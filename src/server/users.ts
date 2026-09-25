import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

export type UserRecord = Readonly<{ id: string; email: string; passwordHash: string }>;

export class RegistrationError extends Error {
  constructor(code: "INVALID_EMAIL" | "WEAK_PASSWORD" | "EMAIL_TAKEN") { super(code); }
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/u;

export function validateRegistration(email: string, password: string): void {
  if (!EMAIL_PATTERN.test(email)) throw new RegistrationError("INVALID_EMAIL");
  if (password.length < 10 || password.length > 200) throw new RegistrationError("WEAK_PASSWORD");
}

export async function registerUser(pool: Pool, email: string, password: string): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase();
  validateRegistration(normalized, password);
  const { hashPassword } = await import("./password.ts");
  const id = `u_${randomBytes(12).toString("hex")}`;
  const passwordHash = hashPassword(password);
  try {
    const result = await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, password_hash",
      [id, normalized, passwordHash],
    );
    const row = result.rows[0] as
      | { id: string; email: string; password_hash: string }
      | undefined;
    if (!row) throw new Error("REGISTER_RETURNED_NOTHING");
    return { id: row.id, email: row.email, passwordHash: row.password_hash };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
      throw new RegistrationError("EMAIL_TAKEN");
    }
    throw error;
  }
}

export async function findUserByEmail(pool: Pool, email: string): Promise<UserRecord | null> {
  const result = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  const row = result.rows[0] as
    | { id: string; email: string; password_hash: string }
    | undefined;
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
}
