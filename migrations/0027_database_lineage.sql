-- DEPLOY-003 (review 3): this database's identity, one random id, made once by this migration.
-- It travels with the database: pg_dump copies it, a restore brings it back, and every deletion
-- export records it. A restore accepts a deletion ledger from another file only when the file
-- has the restored backup's lineage, so a new server's own database (a new id) can never pass
-- its empty ledger off as the newest one. No account data: an id and a time.
CREATE TABLE IF NOT EXISTS database_lineage (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- At most one row.
CREATE UNIQUE INDEX IF NOT EXISTS database_lineage_single ON database_lineage ((true));
INSERT INTO database_lineage (id)
  SELECT gen_random_uuid()::text WHERE NOT EXISTS (SELECT 1 FROM database_lineage);
COMMENT ON TABLE database_lineage IS 'This database''s identity (DEPLOY-003): carried by its dumps and deletion exports, so a restore can tell its ledger sources apart from another database''s.';
