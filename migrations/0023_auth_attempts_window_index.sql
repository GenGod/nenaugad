-- B53-001 (review): pruning runs before every login, so the expired-window lookup uses an
-- index instead of scanning every counter. A separate migration because 0022 was already
-- applied to the local databases when the review asked for it.
CREATE INDEX IF NOT EXISTS auth_attempts_window_started_at ON auth_attempts (window_started_at);
