CREATE TABLE IF NOT EXISTS closure_checks (
  snapshot_id text PRIMARY KEY REFERENCES job_snapshots (id) ON DELETE CASCADE,
  last_check_at timestamptz NOT NULL,
  last_result text NOT NULL CHECK (last_result IN ('active', 'inactive', 'unknown')),
  consecutive_inactive integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS closure_checks_last_check_idx ON closure_checks (last_check_at);
COMMENT ON TABLE closure_checks IS 'Per-record HEAD availability checks (jobicy closure signals). A record closes only after two consecutive 404/410 checks; unknown never closes.';
