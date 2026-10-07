# B31-001 — A stuck extraction operation no longer kills the pass or the import

**Status: accepted by the owner, 2026-10-07.** Implemented and independently reviewed the
same day.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B31, found by the
[B28-001](B28-001-input-keyed-derivatives.md) review; AGENTS.md (uncertain billing; no
retry may reset a root operation's limit; money changes need a separate review).

**Owner decision (2026-10-07, this session):** when a posting's paid operation still
holds money (reserved, in flight or uncertain), the pass stops until the owner resolves
the hold with `npm run ai:holds`. The alternative, stepping over it and continuing with
the budget as the only brake, was declined: during a provider outage each tick could
leave one more uncertain hold.

## Result and boundaries

**User result:** one bad posting no longer stops extraction for the whole source, and
nothing the extraction pass does can fail or pause an import. An unresolved hold stops
extraction for that source, says which posting and operation, and stays stopped until the
owner resolves it. A resolved hold, or a paid call whose result was lost, blocks only its
own posting.

**What happens today** (inert while live AI is off). The real transport turns every
network failure into `uncertain`; the gateway then throws `BUDGET_UNAVAILABLE`, which the
pass reports as a budget refusal. The next tick finds that operation past its deadline,
`beginAttempt` throws `DEADLINE_EXPIRED`, and the pass rethrows. The worker runs the pass
inside the import's `try`, so the import is recorded as failed, and enough ticks pause
the source. Cancelling the hold does not help: a cancelled operation throws
`IDEMPOTENCY_COLLISION`, which the pass also rethrows, so the pass stays stuck for good.
The import scripts behave the same way: a pass exception ends a successful import with
`IMPORT_FAILED` and exit code 1.

**Not included:**
- B32 (the pass reads in heap order and slices before skipping answered rows). A blocked
  posting still takes a slot of the per-tick limit.
- The ledger (`spending.ts`) and the gateway: unchanged, apart from one read-only lookup.
  The gateway still throws `BUDGET_UNAVAILABLE` after an uncertain dispatch; the pass now
  tells that apart by the operation's state.
- A brake for repeated failures after payment (a store that fails after settlement):
  each such posting is paid once and then blocked; the extractor's budget bounds it.
- `npm run ai:holds`: it now reads the same status list as the pass
  (`HOLDING_STATUSES`), so the two cannot drift; it still lists the holds of every owner
  and task type, not only the extractor's.

**Context:** `src/server/ai/extraction-pass.ts`, `src/server/ai/spending.ts`,
`src/server/ai/gateway.ts`, `src/server/ai/extraction-service.ts`, `scripts/worker.ts`,
`scripts/import-himalayas.ts`, `scripts/import-jobicy.ts`, `scripts/extract-fields.ts`,
`scripts/ai-holds.ts`.

**Risk: high** (money). It decides when the extractor keeps spending after something
went wrong. Negative tests, an independent review and the owner's acceptance are
required.

**Data:** synthetic postings and a labelled mock transport; nothing is sent or paid. No
migration.

## Acceptance (fixed before the code)

1. **An unresolved hold stops the source up front.** Before it reads any posting, the
   pass refuses with outcome `held` when an extractor operation for one of this source's
   postings is `reserved`, `in_flight` or `uncertain` (the statuses `ai:holds` lists and
   can cancel). It names the posting, the operation and the status. No transport call,
   no new operation. Another source's hold does not stop this source.
2. **In the loop, a ledger refusal is judged by the posting's own operation:**
   a. still holding money → the pass stops with `held`, naming the posting, the
      operation, the status and the ledger's code. An uncertain dispatch in this pass is
      reported this way, no longer as a budget refusal;
   b. closed (`settled` with no stored record, `failed`, `cancelled`) → the posting is
      counted as `blocked`, with the code and the operation's status, and the pass goes
      on. No new operation, no call, no money: the block holds until the text changes;
   c. no operation → the budget refusals stop the pass as before (`budget_refused`);
      `OPERATION_CEILING_EXCEEDED`, refused before any reservation, is counted as
      `blocked` and the pass goes on; anything else propagates.
3. **Resolving the hold frees the pass:** after `ai:holds --cancel`, the next pass counts
   that posting as `blocked` and extracts the rest.
4. **An import never fails because of extraction.** The worker and both import scripts
   run the pass through one helper that never throws: an exception becomes
   `{ outcome: "error", code }` with a code only, no message. The import's attempt
   record, failure streak and exit code depend on the import alone.
5. Unchanged: the switch, the source permission, the budget refusals, the tombstone
   skip, stored records answering repeats, the limit, the ledger's rules.

## Plan

1. Tests first in `tests/integration/extraction-pass.test.ts`: an uncertain dispatch,
   then the up-front refusal, then the cancel (1, 2a, 3); another source unaffected (1);
   a paid call whose result was lost (2b); the ceiling (2c); the helper (4).
2. `spending.ts`: `findOperationByKey`, read-only.
3. `extraction-pass.ts`: the up-front check, the classification, `blocked` and `held`
   in the result and the summary, and `runExtractionPassAfterImport`.
4. `scripts/worker.ts`, `scripts/import-himalayas.ts`, `scripts/import-jobicy.ts`: the
   helper, outside the import's failure path. `scripts/extract-fields.ts`: a hint for
   `held`.
5. Checks; mutation check; independent review; docs; then the owner.

**Rollback:** `git revert`. No migration and no stored data change.

## Approvals and limits

Local code and tests. No provider, no live AI, no spend. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.**
- `src/server/ai/extraction-pass.ts`: `openHold`, the up-front check (an extractor
  operation in a holding status, tied to the source by joining its key
  `extraction:<posting id>:` on the source's postings); the classification after a
  ledger refusal by the posting's own operation (holding → `held`; a budget code →
  `budget_refused`; closed or over the ceiling → `blocked`; anything else propagates);
  `blocked` in the counts, `held` and `operationStatus` in the result and the summary;
  `holdHint`; `runExtractionPassAfterImport`, which never throws and reports a code only.
- `src/server/ai/spending.ts`: `HOLDING_STATUSES` and the read-only `findOperationByKey`.
  `gateway.ts` exports `PURPOSE_TASK_TYPE`; no logic changed.
- `scripts/worker.ts`: the pass runs after the import's `try`/`catch`, through the helper,
  and the log line carries the hint for a hold. `scripts/import-himalayas.ts` and
  `scripts/import-jobicy.ts`: the helper; their exit code depends on the import alone.
  `scripts/extract-fields.ts`: a hint for a hold. `scripts/ai-holds.ts`: the shared
  status list.
- `scripts/guardrails.mjs`: the worker and every `scripts/import-*.ts` must not call
  `runExtractionPass(` directly (proven: it fails on either file with the direct call).
- Tests (`tests/integration/extraction-pass.test.ts`, 6 new): an uncertain dispatch,
  every later tick held up front, an in-flight hold, the hints, the owner's cancel
  freeing the pass with only that posting blocked; the up-front check made
  deterministic by tombstoning the held posting, for all three holding statuses;
  another source's hold; a paid call whose result was lost, and the kill switch at that
  posting; the ceiling; the helper, including an error whose message quotes a posting.

**Repair cycle 1** (hypothesis recorded in `tasks/current.json` before the fix): the full
suite failed in `feedback.test.ts` (`SNAPSHOT_NOT_FOUND`). Reproduced with three files:
`closure + feedback` passes, `closure + extraction-pass + feedback` fails. The new hold
test deleted every jobicy posting; `closure.test.ts` leaves jobicy import state, so
`feedback.test.ts`'s own import is refused by the poll interval, and it relied on
closure's rows. The test stopped deleting them; after the review it touches only its own
rows.

**Mutation check:** 15 of 15 realistic mutations fail at least one test. The old pass
behaviour (no up-front check, the old catch) fails 5. The others: no up-front check; the
check not per source; only `uncertain`; without `reserved`; a hold in the loop stepped
over; a closed operation stopping the pass; the ceiling not stepped over; the helper
rethrowing; the helper returning the message; the operation status not reported;
`blocked` not counted; the budget refusal checked after the closed-operation branch; the
hint ignoring the deadline; the hint ignoring the status.

**Independent review** (fresh context, 2026-10-07): "ready for owner acceptance", no
blocking finding. It found no path that dispatches a call the old code would not have,
other than the two intended step-overs, and no way to reset a root operation's limit. It
ran `npm run check:agent` (0) and `npm run test:db` (81/81). Findings and what was done:
1. *The cross-source test read rows other files leave behind*, and could run out of
   budget as those grow. Rewritten: the hold is on the test's own jobicy posting, and the
   himalayas pass, whose rows the test owns, extracts both.
2. *Nothing tested where the callers sit.* The helper never throws, so what matters is
   that no caller after an import uses the throwing pass: a static guardrail now refuses
   it. The call sites themselves are verified by reading, not by a test.
3. *The hint could lead the owner to cancel a call still running in another process.*
   The hold now carries its deadline; before it, a reserved or in-flight hold says to
   wait, not to cancel. An uncertain hold always points to `ai:holds`.
4. *A hold whose posting row no longer exists is invisible to the up-front check.* No
   production code deletes postings (retention tombstones them); listed below.
5. *Two branches were untested.* With the global budget at zero, a posting with a
   closed operation was counted `blocked` instead of stopping the pass: fixed (the budget
   check comes first) and tested. The final rethrow of an unexpected ledger code stays
   untested: it needs a race inside the ledger (an operation deleted between reserve and
   attempt).
6. *Corrections to this file:* the `ai:holds` statement (now shares the list) and the
   limitations below.
7. *`scripts/extract-fields.ts` prints `error.message` when it fails*, which can quote a
   posting. Existed before; outside this diff; proposed as a separate task.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 302/302; guardrails, Biome 237 files, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 384/384 (6 new); 83.00% lines, 86.43% branches, 91.83% functions, all thresholds enforced |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed (1.1 min) |

Not run: CI on GitHub (not pushed); the worker against a live provider (live AI is off).
The lines threshold stays at 82: coverage is 83.00 exactly, too close to raise.

**Acceptance:** 1–5 met and tested locally (4 through the helper and the guardrail); the
independent review is done. **Accepted by the owner 2026-10-07**, with the limitations
below.

**Limitations.**
- The old accidental brake is gone: when storing fails after a call settled, the
  failure streak used to pause the source. Now each tick pays for one more posting per
  source, logs `outcome: "error"`, and the next tick blocks that posting. The extractor's
  budget bounds it; nothing pauses it.
- The pass never uses a second attempt on an uncertain operation, which the ledger would
  allow within the deadline: the up-front check stops it first, by the owner's decision.
- A cancelled hold blocks its posting until the text changes, even when its call was
  never dispatched.
- The up-front check runs once per pass: a hold another run creates mid-pass stops this
  pass only when the loop meets it, or on the next tick.
- A hold whose posting row was deleted does not stop the pass (no code deletes postings).
- The callers' placement is enforced by a static guardrail and by reading, not by a test
  of `attempt()`.

**Rollback:** `git revert`. No migration and no stored data change.

**Next small task:** B32 (the pass reads in heap order and slices before skipping answered
rows), the last open item before live AI.
