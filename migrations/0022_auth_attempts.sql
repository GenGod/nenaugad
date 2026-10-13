-- B53-001: password attempt counters for login and account deletion (owner decisions
-- 2026-10-13). One row per key: `login:` + SHA-256 of the normalized email (never the
-- email), or `delete:` + the account id. An attempt is counted before its password is
-- checked; 5 per 15-minute window, then refused until the window ends. Expired rows are
-- pruned, and an account deletion removes both of its rows.
CREATE TABLE IF NOT EXISTS auth_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL
);
COMMENT ON TABLE auth_attempts IS 'Password attempt counters (B53): a hashed email or an account id, a count and its window start; no email, no password.';
