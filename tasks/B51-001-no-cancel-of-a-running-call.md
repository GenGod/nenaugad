# B51-001: a call still running cannot be cancelled (B51)

**Status: accepted by the owner, 2026-10-13.** Implemented, independently reviewed and
checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B51,
found 2026-10-12 by the B45-001 review.

## Result and boundaries

**User result (the owner):** `npm run ai:holds -- --cancel=<id>` on a call that may still
be running is refused, with the moment from which it is accepted (`cancelFrom`), instead of
releasing the hold and losing the charge when the provider answers. Today the command
accepts it: the gateway's own settle is then refused (`WRONG_STATE`), the answer and its
cost are dropped, and the ledger understates spend.

**Root cause.** `cancelOperation` (`src/server/ai/spending.ts`) refuses only `settled` and
`cancelled`; an `in_flight` operation is cancelled at any time. B48 already knows when an
`in_flight` call is over for certain (its dispatch, stamped on the database's clock, plus
`IN_FLIGHT_GRACE_MS`), and `--settle` waits for that moment; `--cancel` did not.

**Change.**
1. `spending.ts`: one private helper, `inFlightCallOver(client, row)` — the database's
   clock against the stamped dispatch plus the grace, read inside the caller's locked
   transaction — used by `settleOperation`'s late receipt (as before) and by
   `cancelOperation`, which now refuses an `in_flight` operation until then with
   `WRONG_STATE`, changing nothing. `reserved` and `uncertain` are cancelled as before
   (a reserved call was never sent, and cannot be sent afterwards: `beginAttempt` starts
   only from `reserved`, re-checked after the cancel's row lock; an uncertain one has
   returned or timed out), and so is an `in_flight` one past the grace (a crash: the
   owner judges it as for uncertain).
2. `scripts/ai-holds.ts`: a refused `--cancel` prints the operation's current status and,
   for one in flight, `cancelFrom` (the same moment as `--settle`'s `lateReceiptFrom`).

**Not changed:** the owner check comes first (another owner's operation is still
`OPERATION_NOT_FOUND`); the settled/cancelled refusal; the gateway; the extraction pass
(its hint already says not to cancel before `inFlightOverAt`); no migration. A call
suspended mid-flight for longer than the grace still looks like a crash (B48's
limitation). An `in_flight` row stamped ahead of the database's clock (a row from before
B48 with a fast caller clock, or the database host's clock stepping back) can be neither
cancelled nor settled until that stamp plus the grace; `cancelFrom` says when, and the
wait is bounded by the clock difference. None exists locally (checked read-only by the
review).

**Risk: high (money).** Tests first, an independent `reviewer` pass, and the owner's
acceptance.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. `cancelOperation` on an `in_flight` operation just dispatched, and 30 s inside the
   grace, is refused with `WRONG_STATE`, whatever the caller's `now`; its status and both
   budget rows are unchanged. 30 s past the grace it is cancelled and its hold released.
   A `reserved` and an `uncertain` operation are cancelled at once, as before.
2. The B51 scenario through the gateway: while the transport is answering, the owner's
   cancel is refused; the call then settles itself and its charge is booked once.
3. The command: `--cancel` on a call in flight now exits 1 with `WRONG_STATE`,
   `status: "in_flight"` and `cancelFrom`, and changes nothing; on one dispatched past
   the grace it exits 0 and releases the hold.
4. Every existing test passes; `npm run check`, `npm run test:db` and
   `npm run test:coverage` pass; thresholds not lowered. An independent review of the
   diff finds no blocking issue.

## Plan

1. Tests first in `tests/integration/ai-guards.test.ts` (1–3; the B47 command test's last
   step cancels a fresh in-flight call and becomes part of 3).
2. `spending.ts`, then the script.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards` + `extraction-pass`, `test:db` and `test:coverage` (all exit 0)
and read both local databases' operation statuses (read-only). **Verdict: no blocking
issues.** It confirmed that only `ai:holds` calls `cancelOperation`, that only
`beginAttempt` writes `in_flight` (stamping the database's clock), that the reserved →
in flight race is safe either way round (the attempt's `status = 'reserved'` guard is
re-checked after the cancel's lock; a cancel after the stamp sees its own clock past it),
that a refusal writes nothing and rolls back, that the lock order is unchanged, that the
`settleOperation` refactor keeps its behaviour, that the owner check still comes first,
and that the existing tests still mean what they meant.

Findings and what was done:
1. *Should-fix:* "whatever the caller's `now`" was tested with a caller time 17 days
   behind the database's, which any implementation refuses → a caller clock a day ahead
   of the database's, here and in B48's test; a cancel or a late receipt judged on the
   caller's clock now fails the tests (checked by mutation).
2. A row stamped ahead of the database's clock waits until that stamp plus the grace →
   in "Not changed".
3. The list and the grace comment named only the late receipt → both name the cancel.
4. The command test checked only the budgets after a refused cancel → the whole ledger.
5. The race safety of cancelling a reservation was unstated → stated in change 1, and the
   test asserts that a cancelled reservation cannot be dispatched.

## Result (2026-10-13)

**What changed.**
- `src/server/ai/spending.ts`: `inFlightCallOver`; `cancelOperation` refuses a call
  still in flight; `settleOperation` uses the same helper; comments.
- `scripts/ai-holds.ts`: a refused cancel prints the status and `cancelFrom`; the list's
  comment and hint name the cancel's wait.
- Tests: `tests/integration/ai-guards.test.ts` — "cancel refuses a call still in flight
  until the grace after its dispatch" (1), "gateway: the owner's cancel during a running
  call is refused, and the charge is booked once" (2), the B47 command test's cancel step
  (3); B48's late-receipt test on a caller clock ahead of the database's.
- Docs: `docs/OPEN_GAPS.md` (B51), `src/server/ai/README.md`, `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change all three failed: the library cancelled a call just
dispatched, the command released a live call (exit 0), and in the gateway scenario the
call's own settle was refused after the cancel, so its charge was lost.

**Mutation check:** 4 of 4 before the review (the guard removed; the grace check always
true; always false; `cancelFrom` from the deadline), 2 of 2 after it (cancel or late
receipt judged on the caller's clock).

**Checks.** `npm run check` exit 0 (334 unit tests); `npm run test:db` exit 0 (102 tests);
`npm run test:coverage` exit 0 (436 tests; 83.31 / 87.06 / 92.22 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (no page change). The
local database had to be started first (Docker Desktop was not running after a restart).

**Limitations.** A call suspended mid-flight longer than the grace looks like a crash
(B48); a row stamped ahead of the database's clock waits (above). B40 and B46 stay open.
