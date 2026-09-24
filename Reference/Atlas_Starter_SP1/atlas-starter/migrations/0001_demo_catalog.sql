CREATE TABLE IF NOT EXISTS atlas_demo_jobs (
  id text PRIMARY KEY,
  source_id text NOT NULL CHECK (source_id = 'atlas-fixtures'),
  external_id text NOT NULL,
  content_hash text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id),
  CHECK (payload->>'synthetic' = 'true'),
  CHECK (payload->>'sourceId' = 'atlas-fixtures'),
  CHECK (payload->>'id' = id),
  CHECK (payload->>'externalId' = external_id)
);
COMMENT ON TABLE atlas_demo_jobs IS
  'Synthetic starter records only. Do not insert real jobs or candidate data.';
