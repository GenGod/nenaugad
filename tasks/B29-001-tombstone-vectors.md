# B29-001 — The embedding index never stores a vector for a tombstone

**Status: implemented, 2026-10-07.** Tested locally; acceptance is with the owner.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B29, found by
[B28-001](B28-001-input-keyed-derivatives.md); the retention rule of
[RET-001](RET-001-retention-tombstones.md): a vector must not outlive its text.

## Result and boundaries

**User result:** once retention tombstones a posting, no index run gives it a vector
again: neither a vector of its blank text (the recorded defect) nor a vector of its old
text that an index run was already embedding when retention struck (found while scoping
this task). The run's report no longer counts a tombstone as "current".

**The race, as found.** `npm run embeddings:index` reads its work list once and then
embeds for tens of minutes. Retention runs inside the worker's import: it blanks the
posting (one statement), then deletes its vectors (a second statement). A posting
tombstoned during a run is stored by the run after retention's delete, with its old
text. With only the work-list filter, no later run would look at that row again, so the
vector would stay for good.

**Not included:**
- Other lifecycles (`closed`, `stale`, `quarantined`). They keep their text; whether
  they keep a vector is a product decision, not this defect.
- The extraction pass and the near-dup loader: both already exclude tombstones.
- Retention itself (`tombstoneExpired`): unchanged.

**Context:** `src/server/embeddings/embedding-service.ts` (`embeddingWork`,
`countPostings`, `indexSourceEmbeddings`), `src/server/storage/snapshots.ts`
(`tombstoneExpired`), `src/server/import/pipeline.ts` (a tombstone revived by its
source), `scripts/embeddings-index.ts`, `docs/EMBEDDING_PLAYBOOK.md`.

**Risk: normal.** No money, no user data. The one new `DELETE` removes only vectors of
the source's tombstoned postings, which RET-001 already requires to be gone; a negative
test shows a live posting's vector is untouched.

**Data:** synthetic postings and the labelled fake embedder in the tests. On the local
database no tombstone exists yet, so nothing there changes.

## Acceptance (fixed before the code)

1. `embeddingWork` never lists a tombstoned posting (`tombstoned_at` set), so an index run
   embeds no tombstone, whatever text hash it carries.
2. A tombstone that its source lists again (revived: `tombstoned_at` cleared, text
   restored) is embedded again.
3. The report's `current` counts only live postings: a tombstone is neither current nor
   work. `countPostings`, which the script prints as `stored`, counts live postings.
4. A posting tombstoned while a run is embedding it ends the run without a vector. After
   each stored chunk the run deletes every vector of the source's tombstones, and reports
   how many (`retired`). Retention deletes after it blanks, and the run deletes after it
   commits, so whichever comes second finds the vector.
5. The vectors of live postings, and of other sources, are untouched by that delete.
6. Unchanged: the permission refusals, the B28 text-hash comparison, the limit, the
   step-over of unreachable rows.

## Plan

1. Tests first in `tests/integration/embeddings.test.ts`: a tombstone is not embedded
   and not current, and comes back when revived (1–3); retention striking during a run,
   through an embedder that tombstones a posting while it embeds (4, 5).
2. `embedding-service.ts`: the predicate in `embeddingWork` and `countPostings`; the
   sweep after each stored chunk; `retired` in the report.
3. `docs/EMBEDDING_PLAYBOOK.md`: the work list follows the text hash (stale since B28),
   and tombstones are skipped.
4. Checks; mutation check; docs (OPEN_GAPS B29, IMPLEMENTATION_STATUS).

**Rollback:** `git revert`. No migration, no stored data changes on the local database.

## Approvals and limits

Local code and tests only. No provider, no live AI, no spend. Coding-host spend: not
visible.

## Result (2026-10-07)

**What changed.**
- `src/server/embeddings/embedding-service.ts`: `embeddingWork` and `countPostings` read
  only live postings (`tombstoned_at IS NULL`, the marker the near-dup loader already
  uses); `retireTombstoneVectors` deletes the vectors of the source's tombstones after
  each stored chunk, and the report carries the count as `retired`.
- `tests/integration/embeddings.test.ts`: two tests. (1) A tombstone is not work, the
  run embeds only the live posting, a second run reports `current` 1 not 2, and the
  posting is embedded again once its source lists it again. (2) An embedder that runs
  retention on its first call, which is the race as it happens: the run stores both
  vectors, then retires the tombstone's; the live posting and the other source keep
  theirs. Both failed on the old code: (1) at the work list, (2) with the tombstone's
  vector stored and nothing retired.
- `docs/EMBEDDING_PLAYBOOK.md`: the work list follows the text hash (it still said
  `content_hash`, stale since B28), and tombstones are skipped.

**Why the order closes the race.** Retention blanks the posting and commits, then
starts its delete. The run commits a chunk, then starts its sweep. If the run's commit
came before retention's delete started, that delete finds the vector. If it came after,
the sweep starts after the blanking was committed and finds the tombstone. Both are
separate autocommit statements under READ COMMITTED, so each delete reads what was
committed when it started.

**Mutation check:** 6 of 6 realistic mutations fail at least one test: the work list
without the filter, the count with tombstones, no sweep, the sweep moved before the
store, the sweep's predicate inverted, and the sweep over the whole source.

**Local database** (read-only, 2026-10-07): 700 postings (himalayas 498, jobicy 202), no
tombstone, no vector of a tombstone. Nothing there changes.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 302/302; Biome 237 files, 0 diagnostics; `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 378/378 (2 new); 82.71% lines, 86.30% branches, 91.62% functions, all three thresholds enforced |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.4 min) |

Not run: CI on GitHub (not pushed); the real index (`npm run embeddings:index`), which
has nothing to do on the local database.

**Acceptance:** 1–6 met and tested locally. No independent review was run: the risk is
normal.

**Limitations.**
- A vector of a posting tombstoned during a run exists from its chunk's commit to the
  sweep, the next statement. Readers do not see it: the near-dup loader excludes
  tombstones, and the dense leg is not switched on.
- If the process dies between a chunk's commit and its sweep, that vector stays until
  the next run that stores a chunk for the source.
- `retired` is untested beyond one chunk.

**Next small task:** B31 and B32, before live AI.
