// Account deletion (B11-001; spec SP 1.0 §1, §8, SP-T16, SP-T22; owner decisions
// 2026-10-13). Deleting the account row removes every personal row with it: every table
// that holds an account's data references `users` with ON DELETE CASCADE (profiles,
// CV texts, letters and their revisions, saved and hidden jobs, the impression journal,
// relevance scores, profile embeddings, the batch queue), so one statement is the whole
// deletion and the same foreign keys refuse any late write for the account. The AI
// spending ledger has no foreign key and stays, pseudonymous: ids, statuses and amounts.
// The deletion ledger records the id and the time for a future restore to re-apply.
// Password attempts are limited per account (B53-001, owner decisions 2026-10-13).
import type { Pool } from "pg";
import { clearAttempts, deletionAttemptKey, loginAttemptKey, takeAttempt } from "./auth-attempts.ts";
import { verifyPassword } from "./password.ts";

export class AccountDeletionError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(code: "ACCOUNT_NOT_FOUND" | "PASSWORD_MISMATCH" | "TOO_MANY_ATTEMPTS", retryAfterSeconds: number | null = null) {
    super(code);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Deletes the account `userId` names, after the user re-entered its password (owner
 * decision 2026-10-13). The caller passes the session's own id: there is no other way to
 * name an account here. On a refusal nothing changes but the attempt count (B53).
 */
export async function deleteAccount(pool: Pool, userId: string, password: string, now = new Date()): Promise<void> {
  const client = await pool.connect();
  let refusal: AccountDeletionError | null = null;
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT email, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const row = found.rows[0] as { email: string; password_hash: string } | undefined;
    if (!row) throw new AccountDeletionError("ACCOUNT_NOT_FOUND");
    // Derived before counting: without the server secret nothing changes (B54).
    const loginKey = loginAttemptKey(row.email);
    // Counted under the account row's lock, before the password is checked; a refusal
    // commits the count and nothing else.
    const attempt = await takeAttempt(client, deletionAttemptKey(userId), now);
    if (!attempt.admitted) {
      refusal = new AccountDeletionError("TOO_MANY_ATTEMPTS", attempt.retryAfterSeconds);
    } else if (!verifyPassword(password, row.password_hash)) {
      refusal = new AccountDeletionError("PASSWORD_MISMATCH");
    } else {
      await client.query("INSERT INTO account_deletions (user_id) VALUES ($1)", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      await clearAttempts(client, [deletionAttemptKey(userId), loginKey]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (refusal) throw refusal;
}
