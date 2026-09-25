-- AI-003: per-user AI relevance scores for job matching (cached by profile version).
CREATE TABLE IF NOT EXISTS job_relevance_scores (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  profile_version integer NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  matched_skills jsonb NOT NULL DEFAULT '[]',
  missing_skills jsonb NOT NULL DEFAULT '[]',
  explanation text NOT NULL DEFAULT '',
  model_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_id, profile_version)
);
CREATE INDEX IF NOT EXISTS job_relevance_user_idx ON job_relevance_scores (user_id);
-- Allow 'job_matching' as an operation type for the AI budget guards.
ALTER TABLE ai_operations DROP CONSTRAINT IF EXISTS ai_operations_task_type_check;
ALTER TABLE ai_operations ADD CONSTRAINT ai_operations_task_type_check
  CHECK (task_type IN ('job_extraction', 'cv_extraction', 'cover_letter', 'job_matching'));
COMMENT ON TABLE job_relevance_scores IS 'AI relevance analysis per user+job+profile_version; cached until the profile changes. Score 0-100 with matched/missing skills and explanation.';
