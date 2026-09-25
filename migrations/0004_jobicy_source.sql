-- S1-003: job_snapshots becomes a multi-source table. Replace the inline
-- single-source CHECKs with explicit named constraints.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'job_snapshots'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE job_snapshots DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE job_snapshots ADD CONSTRAINT job_snapshots_source_check
  CHECK (source_id IN ('himalayas', 'jobicy'));
ALTER TABLE job_snapshots ADD CONSTRAINT job_snapshots_kind_check
  CHECK (snapshot->>'kind' = 'job_snapshot');
ALTER TABLE job_snapshots ADD CONSTRAINT job_snapshots_identity_check
  CHECK (snapshot->>'id' = id AND snapshot->>'source_record_id' = id);
