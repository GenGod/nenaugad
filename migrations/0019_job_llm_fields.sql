-- C1: stored LLM extractions with provenance (design item C1; purpose
-- `extraction` approved by the owner on 2026-10-04).
--
-- One row per (posting, prompt version, posting version) — accepted OR
-- rejected:
--   * an accepted row carries the validated fields; the posting pipeline (or a
--     human) can read them without re-paying;
--   * a rejected row keeps the reasons AND the raw model output, so a refusal is
--     auditable and a hallucinating run leaves evidence instead of a silent skip;
--   * the row doubles as the idempotency ledger: the extraction is paid, so a
--     second run for the same (snapshot, snapshot_version, prompt_version) reads
--     the row instead of paying again. A retry is a NEW prompt version or a NEW
--     posting version — never a silent re-charge of the same input.
--
-- Provenance is part of the row, as the brief requires: prompt_version (wording
-- of the instruction) and model_version travel next to the paid operation id and
-- its settled amount, so every extracted value traces back to the exact pair of
-- prompt and model that produced it.
--
-- Lifetime follows the SNAPSHOT: ON DELETE CASCADE, like job_embeddings —
-- retention that removes a posting's text must remove its derivatives.
--
-- No CHECK on the payload shape: the shape is owned by
-- src/domain/extraction.ts and has its own version through prompt_version; a SQL
-- CHECK would be a second, silently diverging copy of that contract.
CREATE TABLE IF NOT EXISTS job_llm_fields (
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  snapshot_version integer NOT NULL CHECK (snapshot_version >= 1),
  prompt_version text NOT NULL,
  model_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'rejected')),
  payload jsonb NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  operation_id text NOT NULL,
  settled_minor bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, prompt_version, snapshot_version)
);

COMMENT ON TABLE job_llm_fields IS
  'One accepted or rejected LLM extraction per (posting, prompt version); provenance = the paid operation that produced it. Deleted with the snapshot.';
