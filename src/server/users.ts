import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { clearAttempts, loginAttemptKey, pruneAttempts, takeAttempt } from "./auth-attempts.ts";
import { ConfigurationError } from "./config.ts";

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
  const { ensureBudget } = await import("./ai/spending.ts");
  const { ownerBudgetId, GPT6_LUNA } = await import("./ai/provider.ts");
  const id = `u_${randomBytes(12).toString("hex")}`;
  const passwordHash = hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, password_hash",
      [id, normalized, passwordHash],
    );
    const row = result.rows[0] as
      | { id: string; email: string; password_hash: string }
      | undefined;
    if (!row) throw new Error("REGISTER_RETURNED_NOTHING");
    // A user is born with a spending cap. The ledger refuses a missing owner
    // budget (docs/OPEN_GAPS.md A5: absence used to mean "no cap"), so the row has
    // to exist before the first request — created in the same transaction as the
    // user, so neither exists without the other.
    await ensureBudget({
      pool: client, budgetId: ownerBudgetId(row.id), scope: "owner",
      ownerId: row.id, period: "monthly",
      approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroUsd,
    });
    await client.query("COMMIT");
    return { id: row.id, email: row.email, passwordHash: row.password_hash };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
      throw new RegistrationError("EMAIL_TAKEN");
    }
    throw error;
  } finally {
    client.release();
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

export type LoginResult =
  | Readonly<{ ok: true; user: UserRecord }>
  | Readonly<{ ok: false; reason: "INVALID_CREDENTIALS" | "TOO_MANY_ATTEMPTS" }>;

/**
 * Checks a login under the attempt limit (B53, owner decisions 2026-10-13). The attempt is
 * counted per email before anything is looked up, so an email with no account is limited
 * the same way and the limit does not reveal whether one exists. A success clears the count.
 */
export async function checkLogin(pool: Pool, email: string, password: string, now = new Date()): Promise<LoginResult> {
  // Derived first: without the server secret nothing is counted or pruned (B54).
  const key = loginAttemptKey(email);
  await pruneAttempts(pool, now);
  const attempt = await takeAttempt(pool, key, now);
  if (!attempt.admitted) return { ok: false, reason: "TOO_MANY_ATTEMPTS" };
  const user = await findUserByEmail(pool, email);
  if (!user) return { ok: false, reason: "INVALID_CREDENTIALS" };
  const { verifyPassword } = await import("./password.ts");
  if (!verifyPassword(password, user.passwordHash)) return { ok: false, reason: "INVALID_CREDENTIALS" };
  await clearAttempts(pool, [key]);
  return { ok: true, user };
}

/**
 * The credentials provider's check (B53). next-auth sends a thrown error's message to the
 * client, so only fixed codes are thrown: `TOO_MANY_ATTEMPTS`, or `LOGIN_UNAVAILABLE` when
 * the check itself fails, never a database message. The log names a configuration error's
 * own fixed code (such as `AUTH_SECRET_REQUIRED`, B54) and nothing of any other error.
 */
export async function authorizeCredentials(
  credentials: Readonly<Record<string, unknown>> | undefined, pool: () => Pool, now = new Date(),
): Promise<{ id: string; email: string } | null> {
  const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (email.length === 0 || password.length === 0) return null;
  let result: LoginResult;
  try {
    result = await checkLogin(pool(), email, password, now);
  } catch (error) {
    const reason = error instanceof ConfigurationError ? error.message : undefined;
    console.error(JSON.stringify({ code: "LOGIN_CHECK_FAILED", reason }));
    throw new Error("LOGIN_UNAVAILABLE");
  }
  if (!result.ok) {
    if (result.reason === "TOO_MANY_ATTEMPTS") throw new Error("TOO_MANY_ATTEMPTS");
    return null;
  }
  return { id: result.user.id, email: result.user.email };
}

/**
 * Whether the account a session names still exists (B11): a session is a stateless token
 * that outlives a deleted account, so the account is checked on every request (owner
 * decision 2026-10-13).
 */
export async function accountExists(pool: Pool, id: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM users WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}
