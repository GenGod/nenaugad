// Account deletion (B11-001; spec SP 1.0 §1, §8, SP-T16, SP-T22; owner decisions
// 2026-10-13). Deleting the account row removes every personal row with it: every table
// that holds an account's data references `users` with ON DELETE CASCADE (profiles,
// CV texts, letters and their revisions, saved and hidden jobs, the impression journal,
// relevance scores, profile embeddings, the batch queue), so one statement is the whole
// deletion and the same foreign keys refuse any late write for the account. The AI
// spending ledger has no foreign key and stays, pseudonymous: ids, statuses and amounts.
// The deletion ledger records the id and the time for a future restore to re-apply.
import type { Pool } from "pg";
import { verifyPassword } from "./password.ts";

export class AccountDeletionError extends Error {
  constructor(code: "ACCOUNT_NOT_FOUND" | "PASSWORD_MISMATCH") { super(code); }
}

/**
 * Deletes the account `userId` names, after the user re-entered its password (owner
 * decision 2026-10-13). The caller passes the session's own id: there is no other way to
 * name an account here. Nothing changes on a refusal.
 */
export async function deleteAccount(pool: Pool, userId: string, password: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const row = found.rows[0] as { password_hash: string } | undefined;
    if (!row) throw new AccountDeletionError("ACCOUNT_NOT_FOUND");
    if (!verifyPassword(password, row.password_hash)) throw new AccountDeletionError("PASSWORD_MISMATCH");
    await client.query("INSERT INTO account_deletions (user_id) VALUES ($1)", [userId]);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
