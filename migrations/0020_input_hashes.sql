-- B28: a paid extraction and a stored vector answer to the text they were made from,
-- not to the posting version (docs/OPEN_GAPS.md B28; owner decisions 2026-10-06).
--
-- The import gives a posting a new version and content hash for any change of meaning,
-- geography included. Migration 0019 keyed the paid extraction by that version, so a
-- re-map that left the text alone would have paid again for the same input, against
-- 0019's own rule ("never a silent re-charge of the same input"); the embedding index
-- re-embedded unchanged text the same way.
--
-- job_llm_fields: the key becomes (posting, prompt version, input hash), the hash of the
-- exact fields the provider receives (src/server/ai/extraction-service.ts).
-- snapshot_version stays and records the version a record was first paid for. No live
-- extraction has run anywhere when this migration is written, so the table is empty. A
-- row without an input hash cannot be re-keyed honestly (the text of its version is
-- gone), so the migration refuses rather than guess: such rows need a reviewed backfill.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM job_llm_fields) THEN
    RAISE EXCEPTION 'job_llm_fields holds rows: re-keying paid extractions by their input needs a reviewed backfill (docs/OPEN_GAPS.md B28)';
  END IF;
END $$;

ALTER TABLE job_llm_fields ADD COLUMN input_hash text NOT NULL;
ALTER TABLE job_llm_fields DROP CONSTRAINT job_llm_fields_pkey;
ALTER TABLE job_llm_fields ADD PRIMARY KEY (snapshot_id, prompt_version, input_hash);

COMMENT ON COLUMN job_llm_fields.input_hash IS
  'SHA-256 of the input fields the provider receives (title, company, description as a JSON array); with the posting and the prompt version it is the paid unit.';
COMMENT ON COLUMN job_llm_fields.snapshot_version IS
  'The posting version the record was first paid for (audit); not part of the key since migration 0020.';

-- job_embeddings: text_hash is the SHA-256 of the exact text a vector was made from (the
-- title, a blank line, the description: jobEmbeddingText in src/domain/embeddings.ts).
-- The index compares it instead of the snapshot's content hash. Every vector that is
-- current today (its content hash equals its snapshot's) gets the hash of its snapshot's
-- text, so this migration re-embeds nothing; a stale vector keeps no text hash and is
-- re-embedded on the next run, as before.
ALTER TABLE job_embeddings ADD COLUMN IF NOT EXISTS text_hash text;

UPDATE job_embeddings e
SET text_hash = encode(sha256(convert_to(
  concat(s.snapshot->>'title', E'\n\n', s.snapshot->>'description_text'), 'UTF8')), 'hex')
FROM job_snapshots s
WHERE s.id = e.snapshot_id AND e.content_hash = s.content_hash;

COMMENT ON COLUMN job_embeddings.text_hash IS
  'SHA-256 of the text the vector was made from; the index re-embeds a posting when its current text hashes differently.';
COMMENT ON COLUMN job_embeddings.content_hash IS
  'The snapshot revision the vector was made at (informational since migration 0020; staleness reads text_hash).';
