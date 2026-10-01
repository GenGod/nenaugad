-- B1: stored embeddings (design item B1; owner decisions 2026-09-30, §6.2/§6.5/§7).
--
-- Two tables, because the two kinds of vector have different owners:
--
--   * job_embeddings follows the SNAPSHOT. A posting's vector is derived from
--     text that the source's retention window governs, so it must disappear with
--     the snapshot (ON DELETE CASCADE), exactly like job_relevance_scores and
--     job_events. Otherwise a source with a 30-day window would keep a permanent
--     derivative of its text while the text itself is deleted.
--
--   * profile_embeddings follows the PROFILE VERSION. An embedding of a profile
--     is derived personal data (decision §6.5), so the composite foreign key to
--     candidate_profiles makes "delete the profile" and "delete its vector" one
--     statement. Deletion is structural rather than application-side on purpose:
--     a future code path that removes profiles cannot forget the vector.
--
-- model_version is part of both primary keys: two artifacts are two vector
-- spaces, and during a re-index both must be able to coexist while the dense leg
-- refuses to compare across them (fail-closed, src/domain/embeddings.ts).
--
-- content_hash records which revision of the posting text produced the vector,
-- so an edited posting is re-embedded instead of silently reusing a stale
-- vector. instruction_version carries the meaning of the query-side template,
-- and profile_text_version the wording of the profile-to-text conversion —
-- separate fields on purpose: rewording the profile text must invalidate cached
-- profile vectors WITHOUT invalidating the 700 document vectors, which a bump of
-- instruction_version would do (and would then fail the comparability check).
--
-- No ANN index (HNSW/ivfflat): the catalog is ~700 postings, where an exact
-- cosine scan is both cheaper and exact. The measured threshold for revisiting
-- that decision is recorded in docs/EMBEDDING_PLAYBOOK.md.
--
-- Dimension 1024 is the reference artifact's output (int8 Qwen3-Embedding-0.6B,
-- decision §6.2). `vector(1024)` is deliberate friction for a model change: a
-- different dimension needs a migration and a re-index, which is exactly what
-- the playbook asks for.
--
-- Precision: pgvector's `vector` stores each component as float4, so a vector
-- that round-trips through the database comes back single-precision (the same
-- 4 bytes/component the storage decision §2 was costed at). Similarities computed
-- from stored vectors therefore agree with freshly computed ones only to ~1e-6,
-- which is why comparisons in tests are approximate and semantic checks (version,
-- role, dimension) are exact.
CREATE TABLE IF NOT EXISTS job_embeddings (
  snapshot_id text NOT NULL REFERENCES job_snapshots (id) ON DELETE CASCADE,
  model_version text NOT NULL,
  instruction_version text NOT NULL,
  content_hash text NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_id, model_version)
);

CREATE TABLE IF NOT EXISTS profile_embeddings (
  user_id text NOT NULL,
  profile_version integer NOT NULL CHECK (profile_version >= 1),
  model_version text NOT NULL,
  instruction_version text NOT NULL,
  profile_text_version text NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, profile_version, model_version),
  FOREIGN KEY (user_id, profile_version)
    REFERENCES candidate_profiles (user_id, version) ON DELETE CASCADE
);

COMMENT ON TABLE job_embeddings IS
  'Dense vectors of stored postings, one row per (snapshot, model_version); deleted with the snapshot by retention (cascade).';
COMMENT ON TABLE profile_embeddings IS
  'Derived personal data: dense vector of a profile version, deleted with that version (cascade). Never logged, never served to a client.';
