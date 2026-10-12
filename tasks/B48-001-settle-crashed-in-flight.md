# B48-001: a call that died in flight takes a late receipt (B48)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed (twice)
and checked locally the same day. Repair cycle 1 of 2 used, after the first review.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B48, found 2026-10-12 by the B47-001 review.

## Result and boundaries

**User result (the owner):** when a process died mid-call and the provider's usage page
shows the call was charged, `npm run ai:holds -- --settle=<operationId> --amount=<μ$>`
books it, as it already does for an uncertain call. Today such an operation stays
`in_flight` for good, `--settle` refuses it, and the only command, `--cancel`, books
nothing, so the ledger understates spend.

**Why not settle every `in_flight` operation.** A live call settles itself; settled from
outside, the gateway's own settle fails with `WRONG_STATE`, the real cost is lost and the
paid output is thrown away. So the command must tell a crash from a running call. The
transport bounds a call: it gives up after 30 s with no retry (`openai-transport.ts`:
`timeout: 30_000`, `maxRetries: 0`; the installed SDK applies the timeout to the body read
too). A call still `in_flight` well after **its dispatch** is a crash.

**Why the database's clock (repair cycle 1).** The first version measured from the
deadline on the caller's `now`. The review showed that `extract:fields` and the worker
compute `now` once per pass and hand it to every posting, so a call dispatched 8 minutes
into a pass carries a deadline that is already 6 minutes old: deadline + grace could pass
while the call runs. `updated_at` on dispatch was the same stale value. So `beginAttempt`
now stamps the dispatch with `clock_timestamp()`, and the crash check reads the database's
clock against it. No caller's time is involved, and every process shares one clock.

**Change.**
1. `spending.ts`: `beginAttempt` writes `updated_at = clock_timestamp()` (the deadline
   check still uses the caller's `now`; see B49). `OperationRow` carries `updatedAt`.
   `IN_FLIGHT_GRACE_MS` = 5 minutes, ten times the transport's timeout (room for the
   settle write, a slow pool, a stalled event loop), and `inFlightOverAt(dispatchedAt)` =
   the dispatch plus that grace. With `lateReceipt`, `settleOperation` accepts `uncertain`,
   or `in_flight` once the database's clock is past `inFlightOverAt(updated_at)`, read
   inside the locked transaction; anything else stays `WRONG_STATE`. The amount guard
   (`AMOUNT_ABOVE_RESERVATION`) applies the same way.
2. `scripts/ai-holds.ts`: a refused `in_flight` operation prints when a late receipt is
   accepted (`lateReceiptFrom`), and so does each `in_flight` row of the list; the hints
   name both cases.
3. `holdHint` (`extraction-pass.ts`) tells the owner to wait, not cancel, until the same
   moment: `inFlightOverAt(updatedAt)` for an `in_flight` hold (it used the bare
   deadline, B31), the deadline for a `reserved` one. The hold carries `updatedAt`.
4. A unit test ties the grace to the transport: it reads the transport's `timeout` and
   `maxRetries` and fails if the grace is under ten times the timeout or retries are on.
   The constant's comment says any transport the gateway uses must end a call well inside
   the grace (a future local-model transport included).

**Not changed:** `cancelOperation` still accepts an `in_flight` operation at any time
(cancelling a live call loses its settle; recorded in B32-001, and `holdHint` advises
against it); a `reserved` operation is never a late receipt, however old (it was never
sent: cancel it); the gateway's settle and `markUncertain` (a call that comes back after
the owner settled it is refused by the status check, and `markUncertain` touches only
`in_flight`); the other transitions keep writing the caller's `now` to `updated_at`; no
migration. An `in_flight` row written before this change carries the caller's time, which
in a long pass is earlier than the real dispatch; none exists while live AI is off.

**Risk: high (money).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code; 1, 4 and 5 restated by repair cycle 1)

1. With `lateReceipt`, an `in_flight` operation is refused with `WRONG_STATE` until the
   grace after its dispatch has passed on the database's clock (just dispatched; 30 s
   inside the grace), whatever the caller's `now`, with its status and both budget rows
   unchanged; past it, it settles like an uncertain one: status `settled`,
   `settled_minor` = A, and on both rows `held_minor` drops by R and `settled_minor`
   grows by A. An amount above R is refused with `AMOUNT_ABOVE_RESERVATION` unless allowed.
   *Repair:* a call dispatched by the gateway under a stale `now` (a long pass) refuses a
   late receipt while its transport is running, and then settles itself, once.
2. A `reserved` operation is refused long after its creation.
3. After the owner settled a crashed operation, the call's own result (`settleOperation`
   without `lateReceipt`) is refused with `WRONG_STATE` and `markUncertain` changes
   nothing: the charge is booked once.
4. `holdHint`: an `in_flight` hold says "do not cancel" until `inFlightOverAt` of its
   dispatch, whatever its deadline, and points to `ai:holds` from then; a `reserved` hold
   until its deadline; an uncertain hold always points to `ai:holds`.
5. The command, run as a process: `--settle` on an operation dispatched just now (its
   `now` and deadline long past) exits 1 with `WRONG_STATE`, `status: "in_flight"` and
   `lateReceiptFrom`, and changes nothing; the list shows the same `lateReceiptFrom`; on
   one dispatched an hour ago it exits 0 and books it as in 1.
6. The grace is at least ten times the transport's timeout, and the transport's retries
   are off.
7. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first: criteria 1–3 and 5 in `tests/integration/ai-guards.test.ts`; 4 in
   `tests/integration/extraction-pass.test.ts`; 6 in `tests/unit/ai-provider.test.ts`.
2. `spending.ts`, `holdHint`, the script.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration either way; an operation settled by the
command stays settled.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review 1 (2026-10-12): one blocking finding

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards` + `extraction-pass`, `test:db` and `test:coverage` (all exit
0). **Verdict: blocking.**
1. *Blocking:* the deadline-based crash rule is false for the long dispatch paths, which
   reuse one `now` per pass (`scripts/extract-fields.ts:46`, `scripts/worker.ts:49`,
   passed to every posting at `extraction-pass.ts:214`): the owner could settle a live
   call, lose its real cost and block its posting for good → repair cycle 1 (hypothesis
   recorded first): the dispatch is stamped and judged on the database's clock; a gateway
   test reproduces the scenario (it failed before the repair: the late receipt settled the
   live call and the call's own settle threw `WRONG_STATE`). The frozen `now` also means the
   deadline stops nothing inside a long pass, which existed before → recorded as B49.
2. *Note:* the SDK timeout covers the body read (`openai/client.js`), so "30 s, no retry"
   holds; a future transport is not covered by the ratio test → the constant's comment
   now states the rule for any transport.
3. *Note:* clock skew is not a risk today (one machine); with the database's clock it is
   none at all.
4. *Note:* in a narrow race the refusal can re-read `uncertain` and print a hint that a
   retry would now succeed; harmless (nothing is written) → left as is.
5. *Note:* the list did not show when a late receipt becomes possible → each `in_flight`
   row now carries `lateReceiptFrom`.
6. Money and concurrency (row lock, rollback, late gateway settle, `markUncertain`,
   parallel cancel, lock order, amount guard, an unparseable `now` fails closed): no
   findings.

## Independent review 2 (2026-10-12): no blocking issues

The same `reviewer` re-read the repaired diff and ran `check:agent`, `ai-guards` +
`extraction-pass` + `worker`, `test:db` and `test:coverage` (all exit 0). **Verdict: no
blocking issues;** finding 1 of review 1 is fixed. It confirmed that `beginAttempt` is
the only writer of `in_flight` and the transport call follows it directly, so the stamp
is the dispatch; that mixing clocks in `updated_at` only affects the order of listed
holds; that reading `clock_timestamp()` after the row lock leaves no gap (a wait for the
lock only makes the check later); and that B49 is recorded accurately.

Findings and what was done:
1. A worker or `extract:fields` started before this change still stamps the dispatch
   with its stale `now` → in the limitations below: restart them once this lands,
   before live AI is switched on.
2. A test comment still said "after its deadline" → "after its dispatch".
3. The B48 row still ended with the rejected deadline-based suggestion → replaced.
4. A process suspended mid-call (host sleep, a debugger) looks dead once the grace passes;
   the database in Docker can drift from the host clock after sleep → in the limitations
   (the check stays consistent: stamp and check share the database's clock).

## Result (2026-10-12)

**What changed.**
- `src/server/ai/spending.ts`: `beginAttempt` stamps `updated_at` with
  `clock_timestamp()`; `OperationRow.updatedAt`; `IN_FLIGHT_GRACE_MS` and
  `inFlightOverAt`; `settleOperation`'s `lateReceipt` accepts an `in_flight` operation
  once the database's clock is past its dispatch plus the grace.
- `src/server/ai/extraction-pass.ts`: the hold carries `updatedAt`; `holdHint` waits
  until the same moment for an `in_flight` hold.
- `scripts/ai-holds.ts`: `lateReceiptFrom` on a refusal and on each `in_flight` row; the
  hints name both cases.
- Tests: `tests/integration/ai-guards.test.ts` — "a call that died in flight settles once
  the grace after its dispatch is past …" (1–3), "ai:holds --settle books a call that died
  in flight, not one still in flight" (5), "a call dispatched under a stale `now` is not
  taken for a crash while it runs" (1, the repair); `tests/integration/extraction-pass.test.ts`
  (4); `tests/unit/ai-provider.test.ts` (6).
- Docs: `docs/OPEN_GAPS.md` (B48, new B49), `src/server/ai/README.md`,
  `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change the three behaviour tests failed (a crashed call was
refused; no `lateReceiptFrom`; the hint used the bare deadline). Before the repair the
stale-`now` reproduction failed: the late receipt settled the live call and the call's
own settle threw `WRONG_STATE`.

**Mutation check (after the repair):** 9 of 9 fail at least one test: the dispatch stamped
with the caller's `now`; the crash judged on the caller's `now`; the grace removed; the
in-flight time check removed; a grace under ten times the timeout; `holdHint` on the
deadline, or on no grace; the refusal's and the list's `lateReceiptFrom` wrong or missing.
(Before the repair, 7 of 8 plus one equivalent mutant: letting `reserved` count as a crash
changes nothing, because the general status check refuses it first.)

**Checks.** `npm run check` exit 0; `npm run test:db` exit 0 (95 tests);
`npm run test:coverage` exit 0 (426 tests; 83.43 / 87.03 / 92.15 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (no page, route or
client change). The command was run against the test database only.

**Limitations.**
- **Restart before live AI:** a worker or `extract:fields` process started before this
  change still stamps dispatches with its stale `now`; restart any running one once this
  lands, before live AI is switched on. `in_flight` rows written before this change carry
  the caller's time; none exists while live AI is off.
- A process suspended mid-call (host sleep, a debugger) for longer than the grace looks
  dead; settling it in the ~30 s after it resumes would lose its own settle. The
  `lateReceiptFrom` shown is on the database's clock, which in Docker can drift from the
  host's after sleep; the check itself stays consistent.
- Cancelling a live `in_flight` call is still unguarded (B32-001); B49 (the deadline in a
  long pass), B45 and B46 stay open; all are inert while live AI is off.
