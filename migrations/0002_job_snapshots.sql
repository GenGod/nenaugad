CREATE TABLE IF NOT EXISTS job_snapshots (
  id text PRIMARY KEY,
  source_id text NOT NULL CHECK (source_id = 'himalayas'),
  content_hash text NOT NULL,
  first_seen_at timestamptz NOT NULL,
  full_pass_misses integer NOT NULL DEFAULT 0,
  excerpt text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  CHECK (snapshot->>'kind' = 'job_snapshot'),
  CHECK (snapshot->>'id' = id),
  CHECK (snapshot->>'source_record_id' = id)
);
CREATE TABLE IF NOT EXISTS import_state (
  source_id text PRIMARY KEY,
  last_run_at timestamptz,
  next_cursor text,
  run_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS job_snapshots_source_idx ON job_snapshots (source_id);
COMMENT ON TABLE job_snapshots IS
  'Canonical job snapshots from the owner-approved himalayas source. Full text is stored per policy but never published in full; excerpt + attribution only.';
COMMENT ON TABLE import_state IS
  'Cursor checkpoint and polling state per source. A failed run must not update last_run_at.';
