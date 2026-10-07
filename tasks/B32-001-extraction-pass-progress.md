# B32-001 — The extraction pass works through the whole catalog

**Status: accepted by the owner, 2026-10-07.** Implemented and independently reviewed the
same day.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B32, found by the
[B28-001](B28-001-input-keyed-derivatives.md) review; the last open item before the first
live extraction run.

## Result and boundaries

**User result:** once live AI is on, each worker tick extracts up to 25 postings that do
not have a record yet, newest first, until the whole catalog has one. Today the pass
slices the first 25 rows the database happens to return and only then skips the ones
already answered, so once those 25 have records every tick answers the same 25 for free
and nothing else is ever extracted. `--limit=5` on the CLI means five provider calls, as
the first live run expects, not five rows.

**What the limit counts.** Provider calls: a posting answered from its record, a
tombstone, an empty text and a posting blocked by its own operation (B31) do not use a
slot. Counting them would bring the defect back in another form: 25 blocked postings at
the front would stop every tick.

**Order.** Newest first (`first_seen_at` descending, then id). The rate of spending is the
same in any order (at most `limit` calls per pass); the order decides what is extracted
first. Under an inflow above the limit, newest first spends on what candidates see, where
oldest first would fall further behind and pay for postings about to expire.

**Not included:**
- `readSnapshotCardsData`: unchanged, because the catalog, matching and relevance read it;
  the pass orders the rows it already loads.
- Batch-loading the stored records: an answered posting still costs one lookup per pass.
- The other lifecycles (`closed`, `stale`): extracted as before.

**Context:** `src/server/ai/extraction-pass.ts` (`runExtractionPass`),
`src/server/storage/snapshots.ts` (`readSnapshotCardsData`), `scripts/worker.ts`
(`EXTRACTION_PER_TICK_LIMIT`), `scripts/extract-fields.ts` (`--limit`).

**Risk: high** (money). It decides which postings are paid for on each tick, and how many.
Negative tests, an independent review and the owner's acceptance are required.

**Data:** synthetic postings and a labelled mock transport; nothing is sent or paid. No
migration.

## Acceptance (fixed before the code)

1. The pass visits postings newest first (`first_seen_at` descending, then id), whatever
   order the database returns.
2. `limit` bounds the provider calls of one pass (fresh `extracted` or `rejected`
   outcomes). Postings answered from a record, tombstones, empty texts and blocked postings
   do not count, so a pass reaches the first posting without a record however many
   answered or blocked postings come before it.
3. A pass makes at most `limit` calls, and stops as soon as it has made them.
4. Unchanged: the switch, the permission, the up-front hold check and the in-loop
   classification (B31), the budget refusals, a stored record answering a repeat.

## Plan

1. Tests first in `tests/integration/extraction-pass.test.ts`: answered postings before
   the one that needs work (1, 2, 3); blocked postings before it (2); the existing limit
   assertion rewritten for calls instead of rows.
2. `extraction-pass.ts`: sort, and count calls instead of slicing.
3. Checks; mutation check; independent review; docs; then the owner.

**Rollback:** `git revert`. No migration and no stored data change.

## Approvals and limits

Local code and tests. No provider, no live AI, no spend. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.**
- `src/server/ai/extraction-pass.ts`: the rows are sorted newest first (`first_seen_at`
  descending, then id); `limit` counts fresh `extracted` and `rejected` outcomes, checked
  before each posting, instead of slicing rows.
- `scripts/cli-limit.ts` (new): `limitArg`. `scripts/extract-fields.ts` refuses a present
  but malformed `--limit` with `INVALID_LIMIT` before the switch is checked; its header
  says the limit is calls per source. Added after the review (finding 3).
- Tests: in `tests/integration/extraction-pass.test.ts`, answered postings ahead of the
  ones that need work, inserted against the expected order on both keys, three ticks of
  one call each; blocked postings ahead of one that needs work; a rejected output using
  the slot; the old limit assertion rewritten for calls (answered postings visited, no
  call, nothing settled). `tests/unit/cli-limit.test.ts`: absent, valid and eleven
  malformed limits.
- Run on the local database with live AI forced off and no key: `--limit 5` and
  `--limit=0` exit 1 with `INVALID_LIMIT`; `--limit=5` reaches `live_ai_disabled`.

**Mutation check:** 8 of 8 fail at least one test: the database's order, oldest first, no
id tie-break, the old slice of rows, every visited row counted, a blocked posting using a
slot, only `extracted` counted, and the limit checked off by one.

**Independent review** (fresh context, 2026-10-07): the code is ready for owner
acceptance; the tests needed one addition. It ran `npm run check:agent` (0) and
`npm run test:db` (85/85). Findings and what was done:
1. *A rejected output using a slot was untested*; a regression would lift the cap if
   outputs stopped parsing. Test added, and the mutation is now caught.
2. *The ordering test relied on insertion order.* The rows are now inserted against the
   expected order on both keys.
3. *A malformed `--limit` made the CLI unbounded* (existed before). Refused now, with a
   unit test. Also found: the import scripts run the pass with no limit, recorded as
   OPEN_GAPS B34 for the owner, and without `--source` the CLI limit applies per source,
   now in its header.
4. *A cancel that races a call in flight is not counted:* the owner cancels with
   `ai:holds` while the call runs, settlement then fails with `WRONG_STATE`, and the
   posting counts as blocked, not as a call. At most one extra call per such cancel, and
   `holdHint` advises against it. Listed below.
5. *Trade-offs of newest first:* listed below.
6. *The cost of a pass:* listed below.
7. *The ledger lets a second process retry an uncertain operation* (existed before; B32
   changes nothing there). Listed below.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 304/304 (2 new); guardrails, Biome 239 files, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 390/390 (5 new or rewritten); 83.03% lines, 86.49% branches, 91.99% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.0 min) |

Not run: CI on GitHub (not pushed); any live extraction (live AI is off).

**Acceptance:** 1–4 met and tested locally; the independent review is done.
**Accepted by the owner 2026-10-07**, with the limitations below. On B34 the owner decided
the same day: the import scripts cap extraction at 25 calls per source, like the worker.

**Limitations.**
- Under an inflow above the limit, older postings wait; `first_seen_at` never moves, so a
  revived or edited old posting also waits behind every newer one.
- A posting that throws an unexpected error before its call stops every pass at the same
  place in this order, until it is fixed (heap order made it as sticky before).
- A pass may visit every posting before it makes its calls: one lookup per answered
  posting, five or six queries per blocked one (about 700 postings today). The CLI prints
  every visited posting's id and status.
- A call the owner cancels while it is in flight is not counted toward the limit (review
  finding 4).
- Existed before: the ledger lets a second process retry an operation another pass marked
  uncertain, within its deadline and attempt budget.
- The import scripts run the pass with no limit (OPEN_GAPS B34, the owner's decision).

**Rollback:** `git revert`. No migration and no stored data change.

**Next small task:** B34: cap the import scripts' extraction at 25 calls per source (owner decision).
