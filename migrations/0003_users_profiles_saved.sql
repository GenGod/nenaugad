CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS candidate_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version),
  CHECK (payload->>'kind' = 'candidate_profile')
);
CREATE TABLE IF NOT EXISTS search_profiles (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  candidate_profile_id text NOT NULL,
  candidate_profile_version integer NOT NULL CHECK (candidate_profile_version >= 1),
  version integer NOT NULL CHECK (version >= 1),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version),
  CHECK (payload->>'kind' = 'search_profile')
);
CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS candidate_profiles_user_idx ON candidate_profiles (user_id);
CREATE INDEX IF NOT EXISTS search_profiles_user_idx ON search_profiles (user_id);
COMMENT ON TABLE candidate_profiles IS 'Manual (S2) or extracted (S3) candidate facts; every save is a new version, history retained.';
COMMENT ON TABLE search_profiles IS 'Current wishes/constraints; references the candidate profile version it was saved with.';
COMMENT ON TABLE saved_jobs IS 'Ownership-scoped saved snapshots; removed with the user (cascade) or when retention deletes the snapshot.';
