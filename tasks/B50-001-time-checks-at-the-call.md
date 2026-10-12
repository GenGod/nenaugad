# B50-001: the deadline refuses a late dispatch; relevance re-checks rights per chunk (B50)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed and
checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B50,
found 2026-10-12 by the B49-001 review.

## Result and boundaries

**User result:** none visible today (live AI is off; the personal-data boundary closes
relevance). When live AI is on: a paid call whose dispatch comes more than 120 s after
the call began is refused instead of being sent (SP 9's operation deadline becomes real),
and a relevance run stops sending a source's postings at the next chunk once its policy
lapses.

**Root cause.**
1. `executeGuardedOperation` (`src/server/ai/gateway.ts`) passes the caller's `now` to
   both `reserveBudget` (deadline = now + 120 s) and `beginAttempt` (`deadline_at >
   now`), so the comparison holds for every new reservation: a reservation that waits on
   its budget-row lock (the snapshot pool the routes use sets no statement timeout) or a
   stalled event loop is still dispatched, however late. The deadline can only refuse a
   row created another way.
2. The relevance route checks source rights once per request, before its chunk loop
   (`src/app/api/v1/relevance/route.ts:168`); every chunk after a lapse is still sent.

**Change.**
1. The gateway gives the attempt its own time: the caller's `now` plus the real time
   since the gateway was entered, read from `performance.now()` (monotonic: a wall-clock
   jump cannot move it). For a new reservation the check is then "less than 120 s since
   the gateway was entered", whatever the caller's `now`; the caller's `now` stays the
   origin, so the reservation's deadline, the stored times and every test's fixed `now`
   mean what they did. Time the caller spends between reading its `now` and entering
   the gateway is not counted. A refused attempt leaves the operation `reserved` with
   its hold, as a crash between the two steps does today; nothing was sent.
   **What follows, per caller** (review finding 2): the extraction pass reports the
   source `held` on every tick until the owner releases it with `ai:holds --cancel`,
   and the hint now says nothing was sent and names that command; after the cancel the
   posting's key answers `IDEMPOTENCY_COLLISION`, so the posting stays `blocked` until
   its text changes. A relevance replay stops at that chunk (`isStopError`), and after a
   cancel the chunk is read as a duplicate and never scored for that profile version
   (B45). The letter route answers 409 `DEADLINE_EXPIRED` instead of 502
   `GENERATION_FAILED`; that request's key is dead, a new click makes a new key.
   **Why not release it automatically:** a released reservation still closes its key
   (`IDEMPOTENCY_COLLISION`, B45), so it saves the owner one command and nothing else, and
   `cancelOperation` also cancels an `in_flight` row: a second caller with the same key
   and a fresher `now` could dispatch the row between the refusal and the release. A
   safe release would need its own guarded update (`status = 'reserved' AND
   attempt_count = 0`) in one transaction. Left manual, next to B45.
2. `sendableNow(items, now)` in `src/server/source-policies.ts`: the items whose source
   may send text to the provider at `now`, and the sources that may not. The relevance
   route asks it for each chunk with a fresh time, drops a lapsed source's postings from
   that chunk on (the key and prompt are built from what is left; an empty chunk is
   skipped), and reports the lapsed sources with the ones denied up front
   (`rightsSkipped`, `rightsMessage`). The check comes before the chunk's reservation,
   not at its attempt; with date-level `valid_until` and the attempt bounded by change 1,
   that leaves at most 120 s.
3. `isExpiredReservation` in `src/server/ai/ledger-refusals.ts`; the letter route maps it
   to 409 `DEADLINE_EXPIRED` (review finding 1).
4. `holdHint`: a `reserved` hold past its deadline says nothing was sent and names
   `npm run ai:holds -- --cancel=<id>` (review finding 6).

**Not changed:** the reservation's deadline (still the caller's `now` + 120 s); the
ledger's SQL; `markUncertain` and the settle still stamp the caller's `now` (nothing
decides on it, B49 review note 6); the letter route and the single-job relevance path
(one call each, checked at the call); no migration.

**Risk: high (the paid path and source rights).** Tests first, an independent `reviewer`
pass, and the owner's acceptance before it is treated as done.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. A call whose attempt comes 121 s after it began (the monotonic clock is mocked to jump
   between the start and the attempt) is refused with `DEADLINE_EXPIRED`; the transport
   is not called; the operation stays `reserved` with `attempt_count` 0 and its worst
   case held on both budget rows; cancelling it releases the hold.
2. A call whose attempt comes within the deadline dispatches and settles as before, and
   every existing ledger and gateway test passes unchanged.
3. `sendableNow`: with a clock before `valid_until` every item of an allowed source is
   sendable; after it, that source's items are dropped and the source is reported; an
   unknown source is reported; the order of the remaining items is kept.
   *Added after the review:* an extraction pass whose attempt comes late stops as `held`
   with `DEADLINE_EXPIRED` and a `reserved` hold, nothing sent, and its hint says so;
   `isExpiredReservation` names only the ledger's own refusal.
4. The relevance route asks `sendableNow` per chunk with a fresh time (read in the diff;
   the route has no harness and the personal-data boundary closes it at run time).
5. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first: 1–2 in `tests/integration/ai-guards.test.ts`; 3 in
   `tests/unit/source-contract.test.ts`.
2. `gateway.ts`; `sendableNow`; the relevance route.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-12)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards` + `extraction-pass`, `test:db` and `test:coverage` (all exit 0).
**Verdict: no blocking issues.** It confirmed that for a new reservation the check
reduces to "elapsed < 120 s", so a stale or future caller `now` is no worse than before;
that `beginAttempt`'s `now` feeds only the deadline comparison; that the
`performance.now` mock is the gateway's first read, restored in `finally`, and cannot
leak; that the relevance filter keeps `failedChunks` as offsets, cannot double-report a
source, and builds the prompt and key only from what may be sent; and that the route is
dead code today (`assertNoCandidateFacts` throws first).

Findings and what was done:
1. The letter route answered the newly reachable `DEADLINE_EXPIRED` with 502 while money
   stays held → 409 `DEADLINE_EXPIRED` through `isExpiredReservation` (unit-tested).
2. The file did not say what follows a stranded reservation → change 1 now does, per
   caller, with the judgement on automatic release.
3. The extraction pass's `held` for it was untested → a pass test with a stepping
   monotonic clock.
4. The window starts at the gateway's entry, not at the caller's `now`; the title claimed
   a little more → the title and change 1 say so.
5. The relevance check precedes the reservation, not the attempt → in change 2; the
   docstring says "before each call".
6. A stranded reservation's hint sent the owner to the usage page for nothing → its own
   hint.
7. `sendableNow` would report an id without a source prefix as `""`; the storage CHECK
   makes that unreachable → left.

## Result (2026-10-12)

**What changed.**
- `src/server/ai/gateway.ts`: the attempt's own time (monotonic elapsed since entry).
- `src/server/source-policies.ts`: `sendableNow`. `src/app/api/v1/relevance/route.ts`: per
  chunk.
- `src/server/ai/ledger-refusals.ts`: `isExpiredReservation`.
  `src/app/api/v1/cover-letters/[id]/generations/route.ts`: 409 `DEADLINE_EXPIRED`.
- `src/server/ai/extraction-pass.ts`: `holdHint` for a never-dispatched hold.
- Tests: `tests/integration/ai-guards.test.ts` (1, 2), `tests/unit/source-contract.test.ts`
  (3), `tests/unit/ledger-refusals.test.ts` and `tests/integration/extraction-pass.test.ts`
  (added after the review).
- Docs: `docs/OPEN_GAPS.md` (B50), `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change the gateway test failed with "Missing expected
rejection" (the late call was sent) and `sendableNow` did not exist; after the review the
classifier test failed to import and the pass test failed on the generic hint.

**Mutation check:** 5 of 5 caught: the attempt on the caller's `now`; no elapsed time;
no start read; `sendableNow` keeping every item; duplicate denied sources. After the review,
2 of 2: `isExpiredReservation` matching another code; the never-dispatched hint removed.

**Checks.** `npm run check` exit 0 (333 unit tests); `npm run test:db` exit 0 (99 tests);
`npm run test:coverage` exit 0 (432 tests; 83.43 / 87.05 / 92.21 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (the route changes
are server-side and cannot run while the personal-data boundary closes them).

**Limitations.** A stranded reservation is released by hand (above); B45 and B46 stay
open; the relevance and letter changes cannot run while the personal-data boundary
closes those routes.
