-- B11-001: the deletion ledger (spec SP 1.0 §8, SP-T22). An account deletion removes the
-- account and, through ON DELETE CASCADE, every personal row in one transaction; this
-- table keeps only the account id and the time (no email, no content), so a future
-- restore from a backup can re-apply every deletion made after that backup. The AI
-- spending ledger (ai_operations, the account's ai_budgets row) stays, pseudonymous
-- (owner decision 2026-10-13).
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id text PRIMARY KEY,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE account_deletions IS 'Deletion ledger: account ids deleted, and when. A restore must delete these accounts again before the database is used.';
