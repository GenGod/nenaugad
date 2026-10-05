# B1-001 — embedding contract, vector store, dense retrieval leg, playbook

**Result:** embeddings stopped being a paper decision and became a working layer: a
contract with the artifact-as-version, storage in pgvector with deletion by
retention and together with the profile, indexing with a source-permission check, a
dense retrieval leg, and measurement on the frozen A1 set. The model
`Qwen3-Embedding-0.6B` (int8, revision `c25a394d`) actually ran on this machine:
catalog indexing, search and the measurement were executed, not described.

**The main honest outcome of the measurement: one dense leg is **worse** than the
current ranker** (NDCG@10 0.829 against 0.916), and by the rule of §6.4 this means
"do not switch". The value of the measurement is exactly this: instead of expecting
that "vectors are better", a number was obtained and the next step — fusion with
BM25 (B2), not a switch.

**Out of scope:** switching the production feed (owner decision #11 stands; the
page still lives on AI sorting), BM25/RRF (B2), the reranker (B3), the
cross-language extension of the golden set (a separate small task, §11.4).

**Dependencies:** A1 (threshold untouched), owner decision #2 of 2026-09-30 (the
model, the dependency, privacy), decision #1 (pgvector, the image in compose.yaml —
by the owner), A9 (guardrails and shadow discipline).

## What was added

- `src/domain/embeddings.ts` — the contract: `EMBEDDING_MODEL` (id, revision, dtype,
  file, sha256, dim, pooling of the last non-padding token, window), the version is
  **derived from the artifact** and checked by a test against the literal; the
  instruction asymmetry (`Instruct: {task}\nQuery: {query}` on the query only, the
  document without the instruction) with refusals in both directions;
  `assertComparable` — fail-closed on mixing versions/instructions/roles;
  `profileEmbeddingText` (a versioned query text); `Embedder` as a port and
  `embeddingInputsFor`, so that the instruction cannot be lost in an implementation.
- `src/domain/dense-retrieval.ts` — the retrieval leg: positions by cosine, a
  deterministic tie-break by id, `uncovered` separate from `refusals` (no vector —
  not a suspicion; a foreign vector — a refusal of the whole query).
- `migrations/0017_job_embeddings.sql` — `job_embeddings` (FK to the snapshot,
  `ON DELETE CASCADE` — the vector does not outlive the text under retention) and
  `profile_embeddings` (a composite FK to `candidate_profiles(user_id, version)` —
  "delete the profile" and "delete its vector" are one statement). `model_version`
  in the primary key: two versions coexist during reindexing. `profile_text_version`
  as a separate field: editing the query wording must not invalidate 700 document
  vectors.
- `src/server/embeddings/embedding-service.ts` — SQL and indexing; the
  `process_with_ml` permission is asked at the point of use, a source without the
  grant is skipped entirely; reindexing by `content_hash`; the logs carry counters
  only.
- `src/server/embeddings/local-embedder.ts` — the real model: dynamic import,
  `allowRemoteModels = false` (no downloads at runtime), pooling of the last
  non-padding token computed from the mask, not through the convenient pipeline
  (mean-pooling would give a different space).
- `src/server/embeddings/dense-search-service.ts` — a vertical slice "profile →
  vector (cached by profile/model/instruction version) → ordering over candidates";
  the same slice checks privacy and versions against the live DB.
- `scripts/models-fetch.ts` + `npm run models:fetch` — the only place that
  downloads weights: the revision is pinned by a commit, every file is verified
  against sha256 before being renamed to its target name, a foreign file is never
  silently overwritten.
- `scripts/embeddings-index.ts` + `npm run embeddings:index -- --embedder=local` —
  indexing with progress lines (counters only), `--limit` for a portioned run; the
  fake embedder is unreachable from the CLI on purpose.
- `scripts/eval-dense.ts` + `npm run eval:dense` — measurement of the leg on A1.
- `docs/EMBEDDING_PLAYBOOK.md` — the invariants, the enablement order, the model
  swap playbook (artifact → measurement → dual-write → switch → rollback window →
  cleanup), the threshold for moving to ANN, what is not covered.
- `scripts/guardrails.mjs` — pinning the version of `@huggingface/transformers` and
  forbidding `allowRemoteModels = true` in `src/`.
- Tests: `tests/unit/embedding-contract.test.ts` (15 tests),
  `tests/unit/dense-retrieval.test.ts` (8), `tests/integration/embeddings.test.ts`
  (6 on a live DB), `tests/support/fake-embedder.ts` (a labelled deterministic
  double; a test checks that `src/` does not import it).

## Protocol V0–V6

- **V0.** A separate task (the first in group B), the schema was extended additively
  (migration 0017), the feed was not changed.
- **V1.** No formulas were invented: cosine/normalization per the model card
  (§6.2), last-token pooling fixed in the contract and checked by a test on the
  version and the ID.
- **V2.** The instruction on the query only (a test for both mistakes), a
  lowered/missing vector does not hide the job, the profile vector is a derivative
  of personal data and is deleted together with the profile (integration test),
  text does not reach the logs (`describeDenseRanking` prints counters only —
  test), a source without a grant is not indexed at all (integration test on
  jobicy).
- **V3.** `npm run check` → exit 0 (**219/219** unit, previously 194; biome 201
  files; tsc clean); **`npm run test:db` → exit 0 (50/50**, 6 new on a live DB);
  `npm run build` → exit 0; **`npm run test:e2e` → 96 passed**;
  `npm run models:fetch` → 6 files, 624 963 871 bytes, each verified against
  sha256; `npm run embeddings:index -- --embedder=local` → exit 0 (himalayas is
  indexed, jobicy `no_permission`); `npm run eval:dense` → exit 0.
- **V4.** B1-specific cases: mixing `model_version`/instruction/role → a refusal
  (unit); a version change without reindexing → the leg returns nothing foreign,
  and two versions coexist without mixing (integration); deleting the profile and
  deleting a snapshot under retention take the vector with them (integration); the
  model unavailable → the layer is inert, `check:offline` green.
- **V5.** Existing checks were not weakened: the A1 thresholds did not move,
  `eval:matching` before and after gives the same numbers (the ranker untouched),
  the ratchet tests are green.
- **V6.** This file + `IMPLEMENTATION_STATUS.md` + `tasks/current.json`.

### Measurements (2026-09-30, this machine, i5-13450HX, int8)

| Run | Number |
|---|---|
| Indexing the golden set (34 documents) | 950–1169 ms, 28–34 ms per document (two runs) |
| Profile query (uncached) | median 114–138 ms, maximum 136–142 ms (two runs) |
| Indexing the live catalog (493 documents) | ~6 minutes, ≈0.7 s per document of 4.5–6.6k characters |
| Dense leg on A1 | R@5 0.680 · R@10 0.836 · NDCG@5 0.789 · NDCG@10 0.829 · MRR 0.833 |
| Ranker v4 on the same set | R@5 0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 · MRR 1.000 |
| Downloaded artifact | 624 963 871 bytes (the model 613 527 539), all sha256 matched |

## Repair cycles: 2/2 (both on a real run, not on tests)

1. **The model download failed with ENOENT**: the `onnx/` subdirectory was not
   created before the streamed write. The hypothesis that `max_length` was the
   cause of the memory growth **was refuted by measurement** (at 602 tokens,
   32768/4096/1024 → 735/711/731 ms, RSS ~1.4 GB): the real mechanism is padding to
   the longest in the batch plus the KV outputs of all 28 layers, which the ONNX
   graph returns on every pass.
2. **The first full indexing run ate 19 GB of RSS** (batch 8 × 2002 tokens: 39 s
   per pass, RSS 14.5 → 20 GB). Measurement: the same text with batch 1 — 4.1–5.5 s
   and a stable ~3 GB at the same total throughput. Fixed: documents are processed
   one at a time, progress in chunks of 25, with the numbers and the consequence in
   a comment (a full reindex of the catalog ≈ half an hour of CPU).

## Limitations

1. **The dense leg is measurably weaker than the ranker.** This is not an
   implementation defect: the leg knows neither the eligibility gate, nor the
   skills dictionary, nor the role in the title. Switching the feed is not
   proposed; B2 provides the basis for the next measurement.
2. **The cross-language part is not measured**: 4 Russian jobs out of 34 and a
   profile without a language field — too little to distinguish the models.
   Extending the set is a separate task, and it leaves open who labels the pairs
   (A1 requires human judgement, not computation).
3. **A full reindex of the catalog ≈ 30 minutes of CPU** and is versioned only as
   a whole (artifact = version). Portioning — `--limit` + idempotency by
   `content_hash`; there is no parallel indexing.
4. **The KV cache in the ONNX graph** is the main memory cost (≈4.6 GB per batch
   of 8 at 2000 tokens). An export without it is a different artifact, that is, a
   separate owner decision, not an implementer optimization.
5. **`onnxruntime-node@1.30.0` installs without a postinstall script** (the npm
   policy of the environment blocked the `onnxruntime-node` and `protobufjs`
   scripts); inference works nevertheless — verified by an actual run. This is an
   observation about the environment, not a confirmation for another machine.
6. **jobicy is not indexed** — its `process_with_ml` = `denied`, the grant rests
   with the owner (§6.1). The dense leg does not work on it at all, not partially.
7. The measurements are on the golden set (34 documents) and on the current
   catalog; quality on the live catalog was not measured (no labels), the latency
   is given for a cold query (in the product the profile vector is cached by
   version).

## Risk and rollback

The risk is low: the layer is not in the hot path of the feed, the source
permission is checked at the point of use, the vectors are deleted together with
the source of their existence. Rollback — `git revert` of the B1 commit plus (if
needed) `DROP TABLE job_embeddings, profile_embeddings` and the removal of
`models/`; the feed does not change at any step, because it is still not ranked by
this layer.
