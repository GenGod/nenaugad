-- RET-001 (owner decision No 4, 2026-10-02): retention stops deleting closed
-- source records outright. A row past the policy window becomes a tombstone:
-- identifiers, dates and the content hash survive (dedup and history keep their
-- trace, and the candidate's journal rows are no longer cascaded away before
-- their own 12-month TTL), while the posting's prose is blanked and the
-- lifecycle becomes 'tombstoned' (the contract already allows that value).
ALTER TABLE job_snapshots ADD COLUMN IF NOT EXISTS tombstoned_at timestamptz;
COMMENT ON COLUMN job_snapshots.tombstoned_at IS
  'Moment retention blanked this record into a tombstone (owner decision No 4); NULL for live records.';
