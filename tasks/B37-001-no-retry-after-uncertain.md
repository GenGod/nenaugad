# B37-001: an uncertain call is never re-dispatched under its reservation (B37)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed and checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B37,
found 2026-10-07 by the B36-001 review.

## Result and boundaries

**User result:** none visible today (live AI is off, and the personal-data boundary closes
letters and relevance). When live AI is on, the ledger cannot understate spend through a
repeated idempotency key: a call whose billing is uncertain keeps its hold until the owner
reconciles it, and nothing is dispatched again under that reservation.

**Root cause.** `beginAttempt` (`src/server/ai/spending.ts`) starts an attempt from
`reserved` **or `uncertain`**. When a caller repeats a key after an `uncertain` result,
`reserveBudget` returns the existing operation without a new hold and the gateway
dispatches again. Up to `MAX_ATTEMPTS` calls (4 for a letter, 2 for matching) can each be
billed against one reservation, and `settleOperation` books only the last one: the ledger
can understate spend by up to (attempts − 1) × one call. Through the gateway, a second
attempt on one operation can only come from this path: after a result the operation is
`settled`, after a crash mid-call it stays `in_flight`, and both already refuse.

**What the spec says** (`docs/solo/ATLAS_SOLO_PIPELINE.md` §AI spending): "Held includes
in-flight and uncertain charges"; "A failure between sending and writing the response →
`uncertain` … Keep the reservation held; do not repeat an uncertain paid call blindly. In
the beta, reconciliation may be manual"; SP-T13: "the hold is preserved, there is no blind
retry". The comment in `markUncertain` says the same and the code did not enforce it.

**Who can reach it.** The extraction pass stops on any hold (B31) and never repeats a key
after an uncertain result. A letter generation uses a fresh client key per click, so only a
replay of the same request (same `idempotency-key` header) repeats it. The relevance run
derives chunk keys from the profile version and the postings, so a re-run repeats them.

**Change.**
1. `beginAttempt` starts an attempt only from `reserved`. An `uncertain` operation is
   refused with a new code, `OPERATION_UNCERTAIN`, checked before the deadline and attempt
   diagnoses (the open hold is the fact the caller needs). The attempt counter, status and
   hold do not change.
2. Callers name the refusal instead of mistaking it: the relevance run stops on it (as it
   already stops on the first uncertain result, `BUDGET_UNAVAILABLE`), so it is not counted
   as a duplicate chunk ("scores are in the cache"); the letter route answers 409
   `OPERATION_UNCERTAIN` instead of 502 `GENERATION_FAILED`. The extraction pass needs no
   change (it reads the operation's own status).
3. Reconciliation is unchanged: `npm run ai:holds -- --cancel=` releases an uncertain
   operation's hold, and `settleOperation` still accepts one (a late receipt) — as a
   library function only: no command calls it (review finding 3, OPEN_GAPS B47).

**Not changed:** `MAX_ATTEMPTS` and the persistent counter. After this change no code path
leaves an operation `reserved` with attempts spent (every attempt moves it to `in_flight`
and nothing moves it back), so through the gateway `ATTEMPTS_EXHAUSTED` is unreachable; the
guard stays in the SQL for a row created another way and for a future multi-step path
(review finding 8). Retries are stopped by the operation's status, not the counter; a new idempotency key still makes a new operation with its
own hold, counted against the same quotas (SP-T12); the first uncertain result still throws
`BUDGET_UNAVAILABLE`; no migration (existing `uncertain` rows simply stop being retryable).

**Risk: high (money).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. After an attempt is marked `uncertain`, `beginAttempt` refuses with `OPERATION_UNCERTAIN`
   — also past the deadline and with attempts left or exhausted — and the operation's
   status, `attempt_count`, and both budget rows' `held_minor`/`settled_minor` are unchanged.
2. Through the gateway (the B37 scenario): a call with key K comes back uncertain; a second
   call with K and a transport that would return a result is refused with
   `OPERATION_UNCERTAIN`, the transport is **not** called again, and the full worst-case
   hold stays on the global and owner rows with nothing settled.
3. A new key after an uncertain result is a new operation with its own hold: both holds
   count, and a quota that cannot fit both refuses the second (no bypass).
4. The persistent counter still refuses at `MAX_ATTEMPTS` (`ATTEMPTS_EXHAUSTED`) for a
   `reserved` operation whose count has reached the limit (a restored worker).
5. Unchanged: settling an uncertain operation converts its hold (late receipt);
   cancelling it releases the hold; a crash mid-call (`in_flight`) refuses a repeat with
   `WRONG_STATE`; the extraction pass's held outcome for an uncertain posting.
6. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first in `tests/integration/ai-guards.test.ts`: rewrite "attempt counter is
   persistent" (it asserted the retry this task removes) into criteria 1 and 4; add the
   gateway scenario (2, 3).
2. `spending.ts`, then the two routes' one-line mappings.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration either way.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-12)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`ai-guards`, `check:agent`, `test:db` and `test:coverage` (all exit 0). **Verdict: no
blocking issues.** It confirmed that the only way into `in_flight` is the guarded UPDATE,
now `reserved`-only, that nothing moves an operation back to `reserved`, that every dispatch
goes through the gateway (the batch path is closed), that concurrent replays serialise on
that UPDATE, that the other states' codes are unchanged, that settle and cancel still accept
`uncertain` (no money stranded, no new locks), and that the refusal is owner-scoped.

Findings and what was done:
1. The two route mappings had no test → the classifiers moved to
   `src/server/ai/ledger-refusals.ts` (a route file may export only handlers) and
   `tests/unit/ledger-refusals.test.ts` covers them; the routes call it.
2. Cancelling an uncertain operation was not asserted → the first B37 test now cancels it
   and checks `held_minor` and `settled_minor` on both rows.
3. The comment claimed `ai:holds` can settle a receipt → reworded; recorded as B47.
4. A cancelled relevance chunk is then skipped forever as a "duplicate"
   (`IDEMPOTENCY_COLLISION`) → recorded as B45 (existed before; B37 makes cancel the
   normal way out of uncertain).
5. An `in_flight` relevance chunk is also read as a duplicate (`WRONG_STATE`) → in B45.
6. The letter route answers the first uncertain result with 402 `BUDGET_EXCEEDED`
   («Бюджет исчерпан») → recorded as B46 (existed before).
7. One "nothing changed" comparison could not fail (the count was reset just before it)
   → the comparison now runs before the count is touched.
8. The task file over-claimed the counter as a backstop → corrected above.

## Result (2026-10-12)

**What changed.**
- `src/server/ai/spending.ts`: `beginAttempt` starts an attempt only from `reserved`; an
  `uncertain` operation is refused with `OPERATION_UNCERTAIN` before the deadline and
  attempt diagnoses; the comments say why and what reconciliation exists.
- `src/server/ai/ledger-refusals.ts` (new): `isDuplicateChunk` and `isStopError` moved from
  the relevance route unchanged except that `OPERATION_UNCERTAIN` stops the run;
  `isUncertainReplay` for the letter route.
- `src/app/api/v1/relevance/route.ts`: imports the two classifiers.
- `src/app/api/v1/cover-letters/[id]/generations/route.ts`: an uncertain replay answers
  409 `OPERATION_UNCERTAIN` instead of 502 `GENERATION_FAILED`.
- Tests: `tests/integration/ai-guards.test.ts` — "attempt counter is persistent and never
  reset by retries" (it asserted the retry this task removes) is replaced by "an uncertain
  attempt is never followed by another under the same reservation" (criteria 1, 5 cancel)
  and "the attempt counter persists: a restored operation at its limit is refused" (4);
  new "gateway: a repeated key after an uncertain result is refused without a dispatch
  (B37)" (2, 3, 5 in-flight and late receipt). `tests/unit/ledger-refusals.test.ts` (new).

**Tests first.** Before the fix both new tests failed with "Missing expected rejection":
the replay was dispatched again under the same reservation (B37 reproduced).

**Mutation check:** 4 of 4 fail at least one test: `uncertain` allowed again in the SQL;
the uncertain diagnosis removed; the uncertain check moved after the deadline check;
`OPERATION_UNCERTAIN` removed from the relevance stop list.

**Checks.** `npm run check` exit 0; `npm run test:db` exit 0 (90 tests);
`npm run test:coverage` exit 0 (418 tests; ratchet held). Not run: `npm run build`,
`npm run test:e2e` (no page or client change). No route is exercised at run time (live AI is
off and the personal-data boundary closes both routes).

**Limitations.** Reconciliation stays manual and cancel-only (B47): an uncertain hold is
released by the owner after checking the provider's usage page, which understates spend if
the provider did charge — the ledger now says so instead of hiding it in a retry. B45 and
B46 are the callers' remaining misreadings, all inert while live AI is off.
