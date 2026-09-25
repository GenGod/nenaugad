CREATE TABLE IF NOT EXISTS cv_uploads (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  detected_kind text NOT NULL CHECK (detected_kind IN ('txt', 'md', 'docx')),
  size_bytes integer NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
  character_count integer NOT NULL CHECK (character_count > 0 AND character_count <= 150000),
  extracted_text text NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cv_uploads_user_idx ON cv_uploads (user_id);
COMMENT ON TABLE cv_uploads IS 'Private CV intake (S3): extracted text and metadata only — the original binary is discarded for data minimization. Deleting the user or the upload removes all derived rows.';
