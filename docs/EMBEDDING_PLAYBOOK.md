# Embedding playbook (B1)

How the dense leg is turned on, changed and rolled back. Written for the owner
and for whoever runs the next model change; every claim here is either a rule
enforced by code (with a test) or a step with a command.

Design sources: [matching brief](design/2026-09-27-matching-implementation-brief.md)
§B1, [owner decision №2](design/2026-09-30-owner-decision-02-embedding-model.md)
(§6.2 model, §6.3 dependency, §6.4 measurement, §6.5 privacy, §7 vectors).

## 1. Invariants

These hold regardless of which model is configured. Each one is enforced in code
and has a test; they are listed here so an operator knows what a failure means.

| Invariant | Where | Meaning |
|---|---|---|
| The version **is** the artifact | `src/domain/embeddings.ts` (`EMBEDDING_MODEL.version`, derived from revision + weight hash) | A model name is not a version. int8 and q4f16 are different vector spaces. |
| Two versions never mix | `assertComparable`, `denseRetrieve` | A candidate set carrying a foreign vector produces **no** order and a refusal code, never a partial one. |
| The instruction is on the query side only | `embeddingInput` | A query without its instruction and a document with one are both refusals (silent quality loss is the failure mode, not a crash). |
| The query vector is cached per version | `profile_embeddings` key `(model_version, instruction_version, profile_text_version, profile_version)` | A change in any of the three versions cannot serve a stale vector. |
| A profile vector is personal data | composite FK to `candidate_profiles` | Deleting the profile deletes the vector in the same statement; there is no code path that keeps one without the other. |
| A posting vector follows the retention window | FK to `job_snapshots` (`ON DELETE CASCADE`) | Retention (`deleteExpired`) removes the snapshot and its vector together. |
| ML permission is asked at the point of use | `permissionFor(policy, "process_with_ml", now)` in the indexing and search services | A source without the grant has no dense representation at all; an expired policy stops new vectors. |
| Nothing is downloaded at request time | `local-embedder.ts` (`allowRemoteModels = false`), guardrail in `scripts/guardrails.mjs` | Weights come from `npm run models:fetch` only. |
| No text, no vector, no profile field in logs | indexing/search services, `describeDenseRanking` | Lines carry counts and codes only. |
| The layer is inert without the model | `check:offline`, tests | A checkout without the artifact still serves the product; the feed is not ordered by this leg. |

## 2. Enabling the leg locally (first time)

```bash
npm run models:fetch          # ~600 MB, verified against pinned sha256
npm run models:fetch -- --check   # later: verify without downloading
npm run db:migrate            # applies 0017 (extension 0016 must already be in)
npm run embeddings:index -- --embedder=local
npm run eval:dense            # quality of the leg on the frozen A1 golden set
npm run eval:retrieval        # dense vs BM25 vs their RRF fusion, plus the k and weight sweeps
```

Notes:

* `--embedder=local` is required. The deterministic double lives in
  `tests/support/` and is deliberately unreachable from the CLI: a fake vector
  written to a real database would be indistinguishable from a real one later.
* Indexing is resumable: a run embeds only postings with no vector for this
  artifact or with a changed `content_hash`. `--limit=N` bounds one run.
* `jobicy` is skipped with `no_permission` until the owner grants
  `process_with_ml` (decision §6.1). That is a policy outcome, not an error.
* Indexing and evaluation touch the network **only** in `models:fetch`.
* **A full re-index costs real time.** Measured 2026-09-30 on the target machine
  (i5-13450HX, int8, one document per forward pass): the golden set's short
  postings at ~28 ms each, the live catalog (≈500 postings, ~1–2k tokens each) at
  roughly half an hour for the whole set. `--limit=N` bounds a run and the work
  list is derived from `content_hash`, so a stopped run continues where it left
  off instead of re-embedding everything.
* **If the run reports unreachable postings** (`partial_store`), the database
  could not resolve a snapshot by its primary key while attaching the vector.
  Measured cause (2026-09-30): after the database image changed
  (`postgres:17.11-alpine` → `pgvector/pgvector:0.8.6-pg17`, both PostgreSQL
  17.11), 12 of 700 `job_snapshots` ids answered "not found" to an index lookup
  while a sequential scan still saw the row — a btree whose ordering no longer
  matches the server's collation. The fix is `REINDEX TABLE job_snapshots;`
  (`REINDEX DATABASE` if other tables may be affected) and it is an owner action:
  the indexer steps over such rows and names them, it does not repair the catalog.
  Anything keyed by those ids (saved jobs, hidden jobs, letters) is unreliable
  until the reindex runs.

## 3. Changing the model

The order matters; steps 1–3 are read-only with respect to the product.

1. **Write the new artifact into the contract.** `src/domain/embeddings.ts`:
   `repository`, `revision`, `dtype`, `file`, `fileSha256`, `dim`, and the
   derived `version` literal. A unit test fails until the literal matches the
   derivation, so the two cannot drift. Nothing else refers to the model by name.
2. **Fetch and verify**: add the new file set to `scripts/models-fetch.ts`, run
   `npm run models:fetch`. The script refuses a file whose hash differs from the
   pin, and refuses to overwrite a mismatching file silently.
3. **Measure before switching** — the decision rule (§6.4):
   * `npm run eval:dense` on the frozen A1 set, before and after;
   * acceptance: NDCG@10 not below the ratchet floor
     (`tests/unit/matching-eval.test.ts`), R@10 and MRR not degraded,
     guardrails pass (empty share, closed/duplicate/unapproved in top-10 = 0,
     p95 ≤ 250 ms);
   * if there is no measurable gain, the new model is **not** switched on. The
     retrieval work then belongs to B2 (BM25 + RRF), and that preference is
     written down rather than guessed.
   * the near-dup queue's thresholds (§5b) are a property of the artifact as
     well: if B5 is in use, repeat that measurement — a model change with a
     stale threshold is an unmeasured queue.
4. **Shadow column / dual write.** Re-run `npm run embeddings:index` after
   changing the version: rows for the new artifact are written alongside the old
   ones (`PRIMARY KEY (snapshot_id, model_version)`), which is exactly the dual
   write. No table migration is needed, and both spaces stay queryable.
5. **Switch** the leg by pointing the read path at the new version (the query
   vector is re-embedded automatically because the cache key carries the
   version). This is one constant, not a rewrite.
6. **Rollback window**: keep the retired version's rows until the window closes.
   Rolling back is pointing the constant back; the old vectors are still there.
7. **Purge after the window** (only after the decision is final):

   ```sql
   DELETE FROM job_embeddings     WHERE model_version = '<retired>';
   DELETE FROM profile_embeddings WHERE model_version = '<retired>';
   ```

   Until this runs, a retired artifact keeps a copy of posting text in vector
   form — which is why the purge is part of the change, not an optimisation.

## 4. Dimension changes

`vector(1024)` is deliberate friction. A model with a different dimension needs
a migration (`ALTER TABLE ... TYPE vector(N)` plus a re-index) and therefore
another reviewed diff. MRL truncation (32–1024 for the reference model) stays
**off**: at ~700 postings the storage saving buys nothing and would add a second
dimension to keep consistent.

## 5. When an ANN index becomes necessary

Today the leg scans exactly (no HNSW/ivfflat): at ~700 rows an exact cosine is
cheaper than an index and cannot lose recall. Revisit when the catalog grows by
roughly an order of magnitude **and** the measured scan time approaches the p95
budget in `src/domain/rank-guardrails.ts` (250 ms). The decision then needs: a
measured scan time at that size, the index built (`vector_cosine_ops`), and a
recall check against the exact scan. No index is added on speculation.

## 5b. Near-dup queue (B5) and its scan boundary

`npm run dedup:candidates` (`src/domain/near-dup.ts`) scans the stored document
vectors pairwise, because cross-source near-duplicates are what A4's exact keys
cannot see. Measured 2026-10-04 on this machine: ~0.24M pairs/s — 700 postings
≈ 1 s, 5 000 ≈ 53 s, 20 000 ≈ 14 min. LSH/MinHash (research part 2 D2) replaces
the full scan when the catalog approaches ~5 000 postings; `textNeighbours()` is
the function where that swap happens.

The thresholds (text 0.70 / title 0.75) were measured with the **reference
artifact** on a synthetic pair set — an EN/RU translation, an EN paraphrase, two
roles of one company, a same-title template twin, an unrelated pair; the numbers
live in the module header. `npm run dedup:candidates -- --min-text= --min-title=`
overrides them for a single run, and the measured pair set is the review material
for a new default. The queue merges nothing: it is a human worklist (an LLM
confirmation behind the same queue is C5).

## 6. What this playbook does not cover

* **The feed is not ordered by this leg.** It produces retrieval positions; B2
  fuses them with BM25 (RRF) and B3 reranks the top of the fused list. Measured
  2026-09-30 on the frozen A1 set, that fusion did **not** beat BM25 alone
  (NDCG@10 0.827 vs 0.881), so nothing is switched and the numbers are the input
  to the next decision, not a claim that the layer helps. Switching the product
  feed is a separate owner decision (the page's AI sort, decision №11).
* **No reranker, no BM25** — B2/B3.
* **No cross-lingual quality claim.** Today the golden set has 4 Russian postings
  and no language field in the profile contract; the cross-lingual extension is
  a separate small task (brief §11.4). Any statement about RU↔EN ranking quality
  before that extension is unmeasured. What IS measured (B5, 2026-10-04): the
  reference artifact puts a synthetic EN/RU translation pair at text cosine 0.81
  / title 0.85 — enough for the near-dup queue, and nothing about ranking.
* **Jobicy's vectors exist** since the owner's grant (2026-10-02; 202/202
  indexed, B13). A source without the grant still contributes none: the leg
  reports `no_permission` instead of a partial signal.
* **Retention and rights are per source.** `terms_hash` detects a changed terms
  page; a matching fingerprint means "the terms text is the same", never "the
  terms still allow this".
