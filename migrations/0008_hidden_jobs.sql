-- S2-002: personal hide-with-reason feedback and manual apply marks.
-- Hidden jobs live separately from saved ones: a job can be hidden straight
-- from matching without ever being saved. Reasons are fixed codes only
-- (privacy minimization: no free text in v1).
CREATE TABLE IF NOT EXISTS hidden_jobs (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  reason_code text NOT NULL CHECK (reason_code IN (
    'salary_mismatch', 'geography_mismatch', 'wrong_level', 'wrong_stack',
    'company_uninteresting', 'remote_conditions_unclear', 'other'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_id)
);
ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS marked_applied_at timestamptz;
CREATE INDEX IF NOT EXISTS hidden_jobs_user_idx ON hidden_jobs (user_id);
COMMENT ON TABLE hidden_jobs IS 'Owner-scoped hidden snapshots with a fixed irrelevance reason code; hidden jobs disappear from matching for that user only.';
COMMENT ON COLUMN saved_jobs.marked_applied_at IS 'Manual apply mark: set only by an explicit user action, never by clicking the external link.';
