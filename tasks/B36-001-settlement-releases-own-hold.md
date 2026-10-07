# B36-001 — A settlement releases its own hold, not other operations'

**Status: accepted by the owner, 2026-10-07.** Implemented and independently reviewed the
same day.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B36, found by the independent review of
[B35-001](B35-001-tariff-unit.md); existed since the ledger was written (AI-001). Owner
request, this session.

## Result and boundaries

**The defect.** `settleOperation` (`src/server/ai/spending.ts`) subtracts
`max(actual, reserved)` from `held_minor` on the global and the owner budget rows, then
adds `actual` to `settled_minor`. A hold is the sum of every open operation's reservation,
so when a call costs more than it reserved, the excess comes off other operations' holds.
The next budget check then admits more than the cap. The comment promised an incident
flag for such a surplus; none existed.

**How a surplus happens.** `reservationFor` bounds a request from above (prompt
characters in, the transport's maximum out), so the guarded paths rarely settle above
their reservation. `scripts/smoke-ai.ts` does: it reserves a fixed 1,000 tokens in and
2,000 out while the transport may use 8,192 out.

**User result:** a settlement releases exactly its own reservation and settles exactly
what the call cost. A cost above the reservation is booked in full and stays visible on
the operation (`settled_minor` above `reserved_minor`); the budget can then sit above its
limit, which refuses every later reservation until the owner acts. Other operations'
holds are never touched. The live smoke probe reserves the envelope of the prompt it
actually sends.

**Not included:**
- The reservation envelope itself: the transport's system message and chat framing (a
  few dozen tokens) and multi-byte characters (one character can be several tokens) can
  still make a call cost slightly more than `reservationFor` reserved. After this fix such
  a surplus is booked honestly and harms no other hold.
- An alert or a report of surplus operations: they are found by a query
  (`settled_minor > reserved_minor`).
- `cancelOperation`: it already releases exactly the reservation.
- A retry after an uncertain call books only the last call (OPEN_GAPS B37, existed
  before, found by this task's review): a separate money task.

**Context:** `src/server/ai/spending.ts` (`settleOperation`, `cancelOperation`,
`reserveBudget`), `src/server/ai/gateway.ts`, `scripts/smoke-ai.ts`,
`src/server/ai/provider.ts` (`reservationFor`), `tests/integration/ai-guards.test.ts`.

**Risk: high** (money). It changes how the ledger converts a hold into spend. Negative
tests, an independent review and the owner's acceptance are required.

**Data:** the integration tests' synthetic owners and budgets. No migration, no provider
call.

## Acceptance (fixed before the code)

1. Settling an operation lowers `held_minor` on the global and the owner budget by that
   operation's `reserved_minor`, and raises `settled_minor` by the actual amount, whether
   the actual is below, equal to or above the reservation.
2. With another operation holding money, a surplus settlement leaves that hold in place,
   and a reservation that only fits if the hold were freed is refused (`BUDGET_EXCEEDED`).
3. The operation keeps both amounts, so a surplus is visible on its row.
4. `scripts/smoke-ai.ts` sends an explicit prompt and reserves `reservationFor` of it.
5. Unchanged: reservation, attempts, deadline, uncertain, cancel, the ownership scoping,
   commit-time revalidation.

## Plan

1. Test first in `tests/integration/ai-guards.test.ts` (1, 2, 3).
2. `spending.ts`: release the reservation, settle the actual; the comment says what a
   surplus does. `smoke-ai.ts`: the prompt and its envelope.
3. Checks; mutation check; independent review; docs; then the owner.

**Rollback:** `git revert`. No migration and no stored data change.

## Approvals and limits

Local code and tests. No provider call, no spend. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.**
- `src/server/ai/spending.ts` (`settleOperation`): the global and the owner budget rows
  lose exactly the operation's `reserved_minor` from `held_minor` and gain the actual
  amount in `settled_minor`. The comments say what a surplus does; the promised incident
  flag, which never existed, and a deadline re-check, which the code deliberately does not
  make, are no longer claimed.
- `scripts/smoke-ai.ts`: `PROBE_PROMPT`, sent explicitly and reserved with
  `reservationFor` (7 + 4,096 = 4,103 μ$, where the fixed envelope reserved 1,100).
- `src/server/ai/provider.ts`: `reservationFor`'s comment no longer calls the character
  count a strict bound (review finding 3).
- `tests/integration/ai-guards.test.ts`: one test on both budget rows: A settles above its
  reservation while B holds money, B's hold stays and a reservation that fits only if it
  were freed is refused; the surplus stays on A's row; B settles below its reservation;
  C, uncertain, settles at exactly its reservation. It failed on the old code (held 3,900
  instead of 4,000).

**Mutation check:** 4 of 4 fail the test: the old `max(actual, reserved)` on both rows,
the actual released instead of the reservation, the old rule on the owner row only, and
the reservation settled instead of the actual.

**Independent review** (fresh context, 2026-10-07): "ready for owner acceptance", no
blocking finding. It verified every path that writes `held_minor` or `settled_minor`
(only `spending.ts` writes the ledger; each reservation is added once and removed once),
the lock order (no cycle), and the surplus case (fail-closed, no reader misbehaves). On
the local database no budget row's `held_minor` differs from the sum of open reservations
and no settled operation exceeds its reservation, so the old bug never moved a hold there.
It ran `npm run check:agent` (0) and `npm run test:db` (88/88). Findings and what was done:
1. *The `GREATEST(held - x, 0)` clamp would hide a double release or old drift silently,
   and a hold that reads too low fails open.* It cannot fire after this fix; listed below.
2. *A retry after an uncertain call books only the last call* (existed before). Recorded
   as OPEN_GAPS B37 for the owner.
3. *`reservationFor`'s comment contradicted this task.* Corrected.
4. *A stale comment in `smoke-ai.ts`.* Corrected.
5. *Settling an uncertain operation and an actual equal to the reservation were untested.*
   Added to the test.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 306/306; guardrails, Biome, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 394/394; 83.10% lines, 86.61% branches, 92.01% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed |

Not run: CI on GitHub (not pushed); `scripts/smoke-ai.ts`, which spends real money and is
verified by reading and type-checking only.

**Acceptance:** 1–5 met and tested locally (4 by reading); the independent review is done.
**Accepted by the owner 2026-10-07.**

**Limitations.**
- The clamp in `settleOperation` and `cancelOperation` turns a negative hold into zero
  without a signal. It cannot happen after this fix; a reconciliation in `npm run ai:holds`
  (each budget row's `held_minor` against its open reservations) would surface drift if it
  ever appeared.
- A call can still cost slightly more than `reservationFor` reserved (system message,
  framing, multi-byte characters); it is settled in full and frees no other hold.
- `smoke-ai`'s "remaining" line can print a negative number once a budget is past its
  limit; cosmetic.

**Rollback:** `git revert`. No migration and no stored data change.

**Next small task:** a look at the first run's five records before the worker extracts;
B37 when the owner wants the letter or matching paths opened.
