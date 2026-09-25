-- Event-driven batch relevance refresh: tracks pending OpenAI Batches
-- so the worker can poll, retrieve results, and persist relevance scores.
CREATE TABLE IF NOT EXISTS ai_batch_queue (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  openai_batch_id text NOT NULL,
  profile_version integer NOT NULL,
  custom_id_mapping jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'completed', 'failed', 'expired')),
  job_count integer NOT NULL DEFAULT 0,
  stored_count integer NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, profile_version, openai_batch_id)
);
CREATE INDEX IF NOT EXISTS ai_batch_queue_pending_idx ON ai_batch_queue (status, submitted_at);
COMMENT ON TABLE ai_batch_queue IS 'Pending OpenAI Batch submissions for bulk relevance analysis; the worker polls and persists results.';
