ALTER TABLE import_state ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE import_state ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN import_state.last_attempt_at IS 'Last worker attempt (success or failure); persisted so a worker restart does not reset backoff.';
COMMENT ON COLUMN import_state.consecutive_failures IS 'Consecutive failed attempts; the worker pauses a source after 5 until an explicit resume.';
