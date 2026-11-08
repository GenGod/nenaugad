-- S1-007: job_snapshots accepts the fourth source, and import_state keeps the wait a
-- source's 429 asked for. The policy decides whether anything is fetched or shown; this
-- only widens the source CHECK and adds one nullable column.
ALTER TABLE job_snapshots DROP CONSTRAINT IF EXISTS job_snapshots_source_check;
ALTER TABLE job_snapshots ADD CONSTRAINT job_snapshots_source_check
  CHECK (source_id IN ('himalayas', 'jobicy', 'remote_first_jobs', 'remotejobs_org'));
ALTER TABLE import_state ADD COLUMN IF NOT EXISTS retry_not_before timestamptz;
COMMENT ON COLUMN import_state.retry_not_before IS
  'No request to the source before this time: the Retry-After of its last 429 (S1-007). Null when none is pending.';
