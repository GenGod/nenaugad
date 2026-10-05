# B1-002 — indexing resilience: unreachable rows, partial progress

**Result:** a full indexing run stopped being "all or nothing" and stopped
silently losing work. The real cause of the failure was found and measured — not
the B1 code but a **defect of the working DB**: 12 of 700 `job_snapshots.id` are
unreachable via the primary key after the DB image change.

**Trigger:** the first full run (`npm run embeddings:index -- --embedder=local`)
computed 493 vectors in ~6 minutes and lost all of them: one FK insert failed, and
the single transaction rolled everything back.

**Out of scope:** `REINDEX` of the working DB — that is an owner action (their
decision about the image change and their data); the task fixes the code's
reaction to the defect, not the defect.

**Dependencies:** B1-001 (indexing and storage), owner decision No. 1 (the DB image).

## What was found (measured, not assumed)

| Check | Result |
|---|---|
| `SELECT ... WHERE id = $1` (the index path) | 0 rows |
| A sequential scan of the same table with the same predicate | 1 row |
| An audit of all `job_snapshots.id` rows for reachability | **12 / 700 unreachable** |
| `users.id`, `users.email`, `candidate_profiles.id` | 0 unreachable |
| The test DB (`atlas_starter_test`) | 0 unreachable |

All 12 are himalayas, ASCII only, with no common traits in their appearance. The
cause of the class: the btree stores the order computed by the previous collation
implementation (the image `postgres:17.11-alpine`, musl), while the server after
switching the image to `pgvector/pgvector:0.8.6-pg17` (Debian, glibc, `en_US.utf8`,
`datcollversion = NULL`) compares differently — a binary search over such an index
yields false "not found". This is exactly the risk for which decision document
No. 1 recorded the «страховка `REINDEX DATABASE`» ["the `REINDEX DATABASE`
safeguard"] at rehearsal.

**The consequence for the product, more important than the embeddings:** everything
that looks up a job by id (saved, hidden, letters, FK inserts) does not work for
these 12 records. The remedy: `REINDEX TABLE job_snapshots;` (if in doubt —
`REINDEX DATABASE atlas_starter`), then repeat `npm run embeddings:index`. The
owner is notified of this by this report; the implementer did not touch the DB.

## What changed in code

- `src/server/embeddings/embedding-service.ts`: writing in chunks (25) — its own
  transaction per chunk and a `SAVEPOINT` per row; an FK violation = "the row is
  unreachable", it is skipped and lands in `report.unreachable` instead of killing
  the run; any other error still aborts (otherwise the bug would be hidden). The new
  outcome `partial_store`. `storeChunk` is exported so that this behavior can be
  tested without corrupting the index.
- `scripts/embeddings-index.ts`: prints the unreachable ids and the remedy, exit 1
  on `partial_store` (a human is needed); the partial progress is preserved.
- `docs/EMBEDDING_PLAYBOOK.md`: an operational note — what `partial_store`
  means and what to do.
- Test: `tests/integration/embeddings.test.ts` — "a row the DB cannot resolve is
  skipped and named, not retried forever" (2 good rows in the same chunk remain
  stored).

## V0–V6 protocol (brief)

- **V3.** `npm run check` → exit 0 (**229/229** unit); `npm run test:db` → exit 0
  (**51/51**, the new test for skipping an unreachable row); `npm run build` → exit 0;
  `npm run test:e2e` → 96 passed. The live run with the real model: 493 embeddings
  computed, **481 stored**, 12 named one by one — and these are exactly the 12 ids
  the independent audit found. The total in the DB: **486 vectors** = 498 − 12.
- **V4.** Partial progress: a chunk without a bad row commits, a bad row does not
  cancel its neighbors (test); a repeated run continues from the stop point
  (`content_hash`) instead of starting over.
- **V5.** Existing checks not weakened: the normal path is still `indexed`
  (the integration tests unchanged), the exception is only for the FK violation.

## Repair cycles: 1/2

1. The hypothesis (recorded via `npm run task -- repair` before the edit): «коммит
   по чанкам делает частичный прогресс долговечным, а отдельный код отказа с
   указанием неудачной строки отличает дефект базы от ошибки модели» ["committing
   by chunks makes partial progress durable, and separate failure code naming the
   failed row distinguishes a DB defect from a model error"]. Confirmed: the live
   run stored 481 of the 493 vectors and named the 12 unreachable ids instead of
   losing all 493.

## Limitations

1. The DB defect remains: 12 jobs are not indexed and not findable by id until
   the owner runs `REINDEX`. The code merely stopped crashing because of them.
2. Skipping a row is not a cure: if REINDEX is not run, these 12 records will
   drop out of the dense leg and out of any id queries silently, with a record
   only in the indexing report.
3. The run is still sequential (one model, one process) — there is no parallel
   indexing, this is deliberate (the model's memory).
