-- S4-003: general-mode cover letters (no job, profile only).
ALTER TABLE cover_letters ALTER COLUMN job_snapshot_id DROP NOT NULL;
ALTER TABLE cover_letters DROP CONSTRAINT IF EXISTS cover_letters_user_id_job_snapshot_id_key;
ALTER TABLE cover_letters ADD COLUMN IF NOT EXISTS mode text
  NOT NULL DEFAULT 'targeted' CHECK (mode IN ('targeted', 'general'));
CREATE UNIQUE INDEX IF NOT EXISTS cover_letters_general_unique
  ON cover_letters (user_id) WHERE mode = 'general';
CREATE UNIQUE INDEX IF NOT EXISTS cover_letters_targeted_unique
  ON cover_letters (user_id, job_snapshot_id) WHERE mode = 'targeted';
