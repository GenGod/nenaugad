-- B66-001 (owner decision 2026-11-03): how many times retention cleared this posting.
-- Clearing deletes the posting's AI extraction, so a posting its source lists again
-- with the same text would meet its own settled paid call under the same idempotency
-- key and never be extracted again. Once above zero, the count is part of the
-- extraction key: one new paid call per relisting. A never-cleared posting keeps its
-- key, and every record already paid for still answers it.
ALTER TABLE job_snapshots ADD COLUMN IF NOT EXISTS cleared_count integer NOT NULL DEFAULT 0
  CHECK (cleared_count >= 0);
COMMENT ON COLUMN job_snapshots.cleared_count IS
  'Times retention cleared this posting into a tombstone; enters the extraction key when above zero (B66-001).';
