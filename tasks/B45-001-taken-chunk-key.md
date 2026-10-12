# B45-001: a relevance chunk whose key is taken is told apart by its operation (B45)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed (twice)
and checked locally the same day. Repair cycle 1 of 2 used, after the first review. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B45,
found 2026-10-12 by the B37-001 review; B47, B48 and B50 each added a way into it.

## Result and boundaries

**User result:** none visible today (the personal-data boundary closes relevance). When
relevance is open again: a run that meets a chunk whose call is still in flight (another
run, or a crash mid-call) or still holds money stops with 409 `OPERATION_HELD` instead of
reporting it as already scored; a chunk whose operation is closed without a stored score
(settled with its answer lost or unusable, settled from a late receipt, cancelled by the
owner, failed) is reported as `closedChunks` instead of `duplicateChunks`, and is not
paid for again. A single-job request for such a posting answers 409 `OPERATION_HELD` or
409 `OPERATION_CLOSED` instead of the ledger's raw `WRONG_STATE`, `IDEMPOTENCY_COLLISION` or
`DEADLINE_EXPIRED`.

**Root cause.** `isDuplicateChunk` (`src/server/ai/ledger-refusals.ts`) reads
`WRONG_STATE` and `IDEMPOTENCY_COLLISION` as "the scores are in the cache". Those codes
only say that the chunk's content-addressed key is taken. A chunk is only formed from
postings without a cached score, so when its key is taken the scores are, almost always,
**not** there: the operation is `in_flight` (a concurrent run, or a crash), `settled` with
no stored score (an unparseable answer, a late receipt, B47), `cancelled` (the owner's
way out of uncertain since B37, and of a stranded reservation since B50) or `failed`.
**And past its deadline** (120 s after the reservation, so for every later run and for
every late receipt) `beginAttempt` refuses a replay with `DEADLINE_EXPIRED` before it
looks at the state, and `isStopError` read that as "stop the run": a settled chunk
stopped every later run, and nothing the owner can do clears it (`cancelOperation`
refuses a settled operation). Found by the first review (repair cycle 1).

**Change.**
1. `chunkRefusal(error, operationFor)` in `ledger-refusals.ts` replaces
   `isDuplicateChunk`. A taken key — `WRONG_STATE`, `IDEMPOTENCY_COLLISION`, and
   `DEADLINE_EXPIRED` or `ATTEMPTS_EXHAUSTED` (the codes a replay meets first past its
   deadline) — is looked up (`operationFor`, the chunk's own operation by key, as the
   extraction pass looks up every ledger refusal, B31) and is `held` with its status
   while that status holds money (`HOLDING_STATUSES`), else `closed`. Any other stop
   refusal (`isStopError`, unchanged: the budget codes, `OPERATION_UNCERTAIN`, a missing
   provider or purpose) is `stop`; anything else `failed`; neither needs a lookup.
2. The relevance route's batch loop: `stop` rethrows as before; `held` answers 409
   `OPERATION_HELD` with the operation's status (the run stops, as for an uncertain
   chunk: another run will store the scores, or the owner settles or cancels the hold);
   `closed` is counted in `closedChunks` (offsets, like `failedChunks`), which replaces
   `duplicateChunks`; `failed` as before.
3. The single-job path: `held` → 409 `OPERATION_HELD`, `closed` → 409 `OPERATION_CLOSED`;
   the rest as before.

**Decision taken, for the owner to confirm:** a closed chunk is not re-scored
automatically under its key. Re-scoring would need a new key, a new paid operation; by
the rule the owner set for extraction (B31, 2026-10-07) a closed operation blocks its own
item, and no retry resets a root operation's limit. The block is per chunk, not per
posting as in B31: the key is the profile version plus the chunk's set of postings, so
any change in which postings are uncached (one scored, added, expired, or a source that
lapsed) can form the same postings into a new chunk, which is paid for. It is
best-effort within a stable catalog. If the owner wants a cancelled chunk (judged "not
charged") to be re-scorable, that is a later, explicit change.

**Not changed:** `isStopError` and `isUncertainReplay`; the ledger; the chunk key; no
migration. No client reads `duplicateChunks` (`grep` over `src/`). A run stopped by 409
`OPERATION_HELD` keeps the scores it already stored, but its response does not report
the cost already spent (as for every stop). A cancel that races a live call loses that
call's charge, which a closed chunk then hides: a ledger gap, recorded as B51.

**Risk: high (money-adjacent: what a run does with held money and paid chunks).** Tests
first, an independent `reviewer` pass, and the owner's acceptance.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. `chunkRefusal`: a stop refusal is `stop` and an unrelated error `failed`, both without
   a lookup; a taken key whose operation is `in_flight`, `reserved` or `uncertain` is
   `held`; `settled`, `cancelled`, `failed` or no row is `closed`.
2. Against the real ledger, through the gateway with purpose `job_matching`: a replayed
   chunk key whose operation is in flight is `held`, settled is `closed`, cancelled is
   `closed`, uncertain is `stop`; the transport is never called and nothing more is held
   or settled. *Repair:* the same, replayed 121 s after the reservation, also for a
   stranded reservation (`held`); `held` carries the operation's status.
3. The route uses `chunkRefusal` in the batch loop and the single-job path, and reports
   `closedChunks` (read in the diff; the route has no harness and the personal-data
   boundary closes it at run time).
4. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first: 1 in `tests/unit/ledger-refusals.test.ts` (the `isDuplicateChunk` tests
   become `chunkRefusal` tests); 2 in `tests/integration/ai-guards.test.ts`.
2. `ledger-refusals.ts`; the route.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review 1 (2026-10-12): one blocking finding

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards`, `test:db` and `test:coverage` (all exit 0) and a scratch test
against the isolated test database. **Verdict: blocking.**
1. *Blocking:* past its deadline a replay is refused `DEADLINE_EXPIRED` before
   `WRONG_STATE`, read as `stop` with no lookup: a settled chunk (every late receipt,
   every unparseable answer) stopped every later run, unclearable; the acceptance test
   missed it because every replay used the reservation's own `now` → repair cycle 1
   (hypothesis recorded first): `DEADLINE_EXPIRED` and `ATTEMPTS_EXHAUSTED` are looked up
   too; the integration test replays past the deadline (settled, in flight, stranded,
   cancelled, uncertain). The root cause above and the B45 row are corrected.
2. *Should-fix:* the 409 promised the operation's status and did not carry it → it does
   (`operationStatus`).
3. An in-flight chunk stopped under two codes (`OPERATION_HELD` within the deadline,
   `DEADLINE_EXPIRED` after) → one code since the repair.
4. Cancelling a live call loses its charge, which a closed chunk then hides → B51.
5. The race between the refusal and the lookup (a chunk settling in between reads as
   closed while its scores are stored) → acceptable: nothing is paid twice.
6. "Not paid for again" holds per chunk key, not per posting as in B31 → the decision
   above and the comment say so.
7. A run stopped by 409 does not report the cost already spent → in "Not changed".
8. The route is dead code today (`assertNoCandidateFacts` throws first) → confirmed.
9. The line-coverage dip (the route's new lines) stays above the ratchet → noted.
10. `docs/OPEN_GAPS.md` still described `duplicateChunks` → updated.

## Independent review 2 (2026-10-12): no blocking issues

The same `reviewer` re-read the repaired diff and ran `check:agent`, `ai-guards`, `test:db`
and `test:coverage` (all exit 0). **Verdict: no blocking issues;** finding 1 of review 1 is
fixed. It walked every state a replayed key can be in, before and after the deadline
(reserved: dispatched before, held after; in flight: held; uncertain: stop; settled:
closed; cancelled or failed: closed; a never-written `pending`: closed, as `ai:holds`
treats it), confirmed that a holding status is never read as closed and that the run-level
refusals still stop with no lookup, and that the docs are accurate.

Findings (notes) and what was done:
1. A stranded reservation answers 409 `OPERATION_HELD` (`reserved`) in relevance but 409
   `DEADLINE_EXPIRED` in the letter route → left; align them when the letter route next
   changes.
2. `isStopError`'s two deadline entries no longer fire for a chunk, and its comment said
   they stop the run → one line says `chunkRefusal` looks them up first.
3. A run stopped mid-way does not report its cost → already in "Not changed".
4. Coverage above the ratchet, `ledger-refusals.ts` at 100 % → noted.

## Result (2026-10-12)

**What changed.**
- `src/server/ai/ledger-refusals.ts`: `chunkRefusal` (with `TAKEN_KEY_CODES`) replaces
  `isDuplicateChunk`; a comment on `isStopError`.
- `src/app/api/v1/relevance/route.ts`: the batch loop and the single-job path read a taken
  key by its operation; 409 `OPERATION_HELD` (with `operationStatus`) and
  `OPERATION_CLOSED`; `closedChunks` replaces `duplicateChunks`.
- Tests: `tests/unit/ledger-refusals.test.ts` (1), `tests/integration/ai-guards.test.ts` —
  "a replayed relevance chunk key is told apart by its operation, not read as scored" (2,
  within and past the deadline).
- Docs: `docs/OPEN_GAPS.md` (B45, the B5-era note on `duplicateChunks`, new B51),
  `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change both tests failed (no `chunkRefusal`); before the
repair the past-deadline replays failed (the reviewer's scratch test showed the settled
replay read as `stop`).

**Mutation check:** 5 of 5 before the review (the held/closed decision; the stop check;
the taken-key code check; null read as held; closed everywhere), 5 of 5 after the repair
(`DEADLINE_EXPIRED` or `ATTEMPTS_EXHAUSTED` dropped from the taken-key codes; a wrong held
status; any operation read as held; stops read as failed).

**Checks.** `npm run check` exit 0; `npm run test:db` exit 0 (100 tests);
`npm run test:coverage` exit 0 (434 tests; lines 83.29 / branches 87.08 / functions 92.21
against 82 / 86 / 91, thresholds unchanged; lines dipped from 83.43 because the route,
which has no harness, gained lines). Not run: `npm run build`, `npm run test:e2e` (the
route cannot run while the personal-data boundary closes it).

**Limitations.** A closed chunk is not re-scored under its key (the decision above, for
the owner); B51 (a cancel that races a live call) and B46 stay open; all are inert while
live AI is off and the personal-data boundary closes relevance.
