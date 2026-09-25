-- S4-001: cover letters with revisions (CL 1.0 contracts, simplified MVP).
-- Letters are private derivatives of the user's profile + a job snapshot;
-- every AI generation and explicit user save creates an immutable revision.
CREATE TABLE IF NOT EXISTS cover_letters (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'deleted')),
  current_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_snapshot_id)
);
CREATE TABLE IF NOT EXISTS cover_letter_revisions (
  id text PRIMARY KEY,
  letter_id text NOT NULL REFERENCES cover_letters (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  body text NOT NULL CHECK (length(body) <= 50000),
  origin text NOT NULL CHECK (origin IN ('generated', 'user_edited')),
  model_id text, -- NULL for user_edited
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (letter_id, version)
);
CREATE INDEX IF NOT EXISTS cover_letters_user_idx ON cover_letters (user_id);
CREATE INDEX IF NOT EXISTS cover_letter_revisions_letter_idx ON cover_letter_revisions (letter_id);
COMMENT ON TABLE cover_letters IS 'Private cover letter per user+job; ownership enforced through the users FK.';
COMMENT ON TABLE cover_letter_revisions IS 'Immutable revisions: every AI generation and explicit user save creates a new version.';
