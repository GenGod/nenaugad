// Password attempt limit for login and account deletion (B53-001; owner decisions
// 2026-10-13): 5 attempts per 15-minute window, then refused, even with the right
// password, until the window ends. An attempt is counted before its password is checked,
// in one atomic upsert, so parallel guesses cannot pass the limit. Login counts per email,
// whether or not an account has it; deletion counts per account.
import { createHmac, hkdfSync } from "node:crypto";
import type { Pool } from "pg";
import { authSecret, ConfigurationError } from "./config.ts";

export const ATTEMPT_LIMIT = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type AttemptDecision =
  | Readonly<{ admitted: true }>
  | Readonly<{ admitted: false; retryAfterSeconds: number }>;

type Queryable = Pick<Pool, "query">;

/**
 * The login counter's key: an HMAC of the normalized email under a key derived from the
 * server secret (B54, owner decisions 2026-10-13), so the table never holds the email and
 * a database reader without the secret cannot test a guessed one. The HKDF label keeps
 * this key apart from anything next-auth derives from the same secret. Without the secret
 * it refuses: there is no unkeyed fallback.
 */
export function loginAttemptKey(email: string): string {
  const secret = authSecret(process.env);
  if (secret === null) throw new ConfigurationError("AUTH_SECRET_REQUIRED");
  const key = Buffer.from(hkdfSync("sha256", secret, "", "nenaugad auth-attempts login v1", 32));
  return `login:${createHmac("sha256", key).update(email.trim().toLowerCase()).digest("hex")}`;
}

export function deletionAttemptKey(userId: string): string {
  return `delete:${userId}`;
}

/** The one service-wide registration counter (B55, owner decision 2026-10-13). */
export const REGISTRATION_KEY = "register:all";

/**
 * Counts one attempt for `key` and says whether it may go on: at most `limit` per window
 * (5 for a password, B53; registration passes its own, B55). The window starts at a key's
 * first attempt and lasts 15 minutes; a refused attempt is counted too but does not extend
 * it. Runs inside a caller's transaction as well.
 */
export async function takeAttempt(
  db: Queryable, key: string, now = new Date(), limit = ATTEMPT_LIMIT,
): Promise<AttemptDecision> {
  const expired = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  const result = await db.query(
    `INSERT INTO auth_attempts AS a (key, attempts, window_started_at) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN a.window_started_at <= $3 THEN 1 ELSE a.attempts + 1 END,
       window_started_at = CASE WHEN a.window_started_at <= $3 THEN $2 ELSE a.window_started_at END
     RETURNING attempts, window_started_at`,
    [key, now, expired],
  );
  const row = result.rows[0] as { attempts: number; window_started_at: Date } | undefined;
  if (!row) throw new Error("ATTEMPT_NOT_RECORDED");
  if (row.attempts <= limit) return { admitted: true };
  const left = row.window_started_at.getTime() + ATTEMPT_WINDOW_MS - now.getTime();
  // A window that starts after `now` (a clock moved back) still ends within one window.
  const retryAfterSeconds = Math.min(Math.max(Math.ceil(left / 1000), 1), ATTEMPT_WINDOW_MS / 1000);
  return { admitted: false, retryAfterSeconds };
}

export async function clearAttempts(db: Queryable, keys: readonly string[]): Promise<void> {
  await db.query("DELETE FROM auth_attempts WHERE key = ANY($1::text[])", [[...keys]]);
}

/**
 * Deletes up to 100 counters whose window has ended, so a hashed email does not outlive
 * its window for long and one login never does unbounded work. Skips a row another
 * transaction holds: pruning never waits on, or deadlocks with, a deletion or an attempt.
 */
export async function pruneAttempts(db: Queryable, now = new Date()): Promise<void> {
  const expired = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  await db.query(
    `DELETE FROM auth_attempts WHERE key IN (
       SELECT key FROM auth_attempts WHERE window_started_at <= $1 LIMIT 100 FOR UPDATE SKIP LOCKED)`,
    [expired],
  );
}
