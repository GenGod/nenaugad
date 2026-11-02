-- S1-006: job_snapshots accepts the third source. The policy decides whether
-- anything is fetched or shown; this only widens the source CHECK.
ALTER TABLE job_snapshots DROP CONSTRAINT IF EXISTS job_snapshots_source_check;
ALTER TABLE job_snapshots ADD CONSTRAINT job_snapshots_source_check
  CHECK (source_id IN ('himalayas', 'jobicy', 'remote_first_jobs'));
