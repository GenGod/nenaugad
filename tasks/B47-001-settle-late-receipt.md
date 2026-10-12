# B47-001: `ai:holds` books a late receipt for an uncertain call (B47)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed and
checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B47, found 2026-10-12
by the B37-001 review.

## Result and boundaries

**User result (the owner):** when the provider's usage page shows that an uncertain call
was charged, `npm run ai:holds -- --settle=<operationId> --amount=<μ$>` books that charge:
the operation's hold is released and the amount is settled on the global and owner budget
rows, as the gateway would have done had the response arrived. Today the only command,
`--cancel=`, releases the hold and books nothing, so a charged call leaves the ledger
understating spend until someone corrects it by hand.

**What the spec says** (`docs/solo/ATLAS_SOLO_PIPELINE.md` §AI spending): "Keep the
reservation held; do not repeat an uncertain paid call blindly. In the beta,
reconciliation may be manual"; §Operation: "Reconciliation of uncertain invoices may be
done manually according to a short instruction". `settleOperation` already accepts an
`uncertain` operation (a late receipt); no command calls it.

**Change.**
1. `scripts/ai-holds-args.ts` (new, no dependencies): the command's arguments. `--settle=`
   needs `--amount=`, a positive integer of micro-dollars (the ledger's unit; no sign,
   point, exponent or leading zero; at most 12 digits), and accepts `--above-reservation`.
   Anything it does not understand is a refusal, never read as "just list" or as another
   action (the B32 rule): an empty or malformed id, a missing or malformed amount, a
   repeated flag, `--cancel` combined with a settle flag, a settle flag without
   `--settle`, an unknown argument. `--cancel=` goes through the same parser, so an empty
   `--cancel=` now refuses instead of listing.
2. `settleOperation` takes an optional `lateReceipt`. Checked under the row lock: the
   operation must be `uncertain` (an `in_flight` one may still be running and settles
   itself; settling it from the command would make the gateway's own settle fail and lose
   the real cost), else `WRONG_STATE`; an amount above the reservation is refused with a
   new code, `AMOUNT_ABOVE_RESERVATION`, unless `allowAboveReservation` (the reservation
   is the worst case, so a larger typed amount is more likely a unit slip than a charge;
   a real one is booked in full with the flag, as B36 books a surplus). The gateway's
   calls are unchanged.
3. `scripts/ai-holds.ts`: parses first and refuses with `USAGE` before touching the
   database; `--settle` looks the operation up by id (as `--cancel` does), calls
   `settleOperation` with `lateReceipt`, and prints the released hold and the settled
   amount in μ$ and cents; a refusal prints its code, and for `WRONG_STATE` the
   operation's current status. The list's hint names both commands and the unit; the
   cancel note says a cancelled operation can no longer be settled.

**Not changed:** `cancelOperation` (any non-closed status, as today); the gateway; the
list; no migration. A settled late receipt closes the idempotency key like a settled
call: the extraction pass counts that posting as `blocked` (its designed "settled with
its result lost" case); the relevance run reads the chunk as a duplicate with no scores
stored (the B45 misreading; its row now names this case too); a replay of the same
letter request answers 502 `GENERATION_FAILED`, as it already does for a cancelled key.
A crashed `in_flight` operation can still only be cancelled — refusing it is the safe
default, and settling one is recorded as B48.

**Risk: high (money).** Tests first, an independent `reviewer` pass, and the owner's
acceptance before it is treated as done.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. Library, uncertain operation with reservation R: `settleOperation` with `lateReceipt`
   and an amount A ≤ R settles it — status `settled`, `settled_minor` = A on the
   operation, and on both the global and owner rows `held_minor` drops by R and
   `settled_minor` grows by A.
2. With `lateReceipt`, an `in_flight` or `reserved` operation is refused with
   `WRONG_STATE`, and an amount above R with `AMOUNT_ABOVE_RESERVATION`; in each case the
   operation's status and both budget rows are unchanged. With `allowAboveReservation`
   the amount above R is booked in full.
3. A settled or cancelled operation is refused (`WRONG_STATE`) by a late receipt; a
   settled one is refused by a later cancel. Without `lateReceipt` an `in_flight`
   operation still settles (the gateway's path).
4. Arguments: list, cancel and settle (with and without `--above-reservation`, in any
   order) parse; every malformed form in change 1 is refused.
5. The command, run as a process against the test database: `--settle --amount` on an
   uncertain operation exits 0 and books it as in 1; on an `in_flight` one exits 1 with
   `WRONG_STATE` and `status: "in_flight"` and changes nothing; an amount above R exits 1
   with `AMOUNT_ABOVE_RESERVATION` and changes nothing, and succeeds with
   `--above-reservation`; a malformed amount exits 1 with `USAGE` and changes nothing; an
   unknown id exits 1 with `OPERATION_NOT_FOUND`; `--cancel=` still releases a hold.
6. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first: `tests/unit/ai-holds-args.test.ts` (4); criteria 1–3 and 5 in
   `tests/integration/ai-guards.test.ts`, next to the ledger's other tests.
2. The parser, `settleOperation`'s guard, the script.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration either way; an operation already settled by
the command stays settled (correct it with SQL if it was wrong).

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-12)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards`, `test:db` and `test:coverage` (all exit 0). **Verdict: no
blocking issues.** It confirmed that a refusal throws before any write and rolls back;
that a late receipt releases the full reservation and books the typed amount on both
rows; that settle-twice, settle-after-cancel and cancel-after-settle are refused under
the row lock; that the gateway (only `in_flight`) and the command (only `uncertain`) can
never settle the same operation, two parallel commands serialise on the lock, and all
three ledger functions lock in one order (no deadlock); that the gateway path is
unchanged; that the parser refuses every malformed form tried (including non-ASCII
digits and line endings) and existing ids stay cancellable; and that the command test
cannot reach the working database.

Findings and what was done:
1. A crashed `in_flight` operation can still only be cancelled (understates spend if the
   provider charged) → recorded as B48 and in "Not changed" (existed before).
2. B45 did not name a chunk settled by a late receipt → its row now does.
3. The letter route's 502 for a replayed settled key was not mentioned → in "Not changed".
4. "Refused before the database is touched" was unproven → the command test now runs a
   malformed and a well-formed command with no database configured (`USAGE` vs
   `DATABASE_URL_REQUIRED`).
5. The `WRONG_STATE` hint spoke only of `in_flight` → chosen by the current status.
6. A failure after a refusal left the pool open (a ~10 s wait; existed before) → the pool
   is closed in `finally`.

## Result (2026-10-12)

**What changed.**
- `scripts/ai-holds-args.ts` (new): `holdsCommand` parses list / cancel / settle; anything
  else is refused.
- `src/server/ai/spending.ts`: `settleOperation` takes an optional `lateReceipt`, checked
  under the row lock (`uncertain` only; `AMOUNT_ABOVE_RESERVATION` unless allowed); the
  new code; `beginAttempt`'s comment names the command.
- `scripts/ai-holds.ts`: parses first (`USAGE` before any database work); `--settle`;
  the hints and the cancel note; the header in English; the pool closed in `finally`.
- Tests: `tests/unit/ai-holds-args.test.ts` (new, criterion 4);
  `tests/integration/ai-guards.test.ts` — "late receipt: …" (1–3) and "ai:holds --settle
  books a late receipt from the command line …" (5), which runs the script as a process
  against `TEST_DATABASE_URL`.
- Docs: `docs/OPEN_GAPS.md` (B45, B47, new B48), `src/server/ai/README.md`,
  `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change the parser test failed to import the missing module,
the library test failed with "Missing expected rejection" (a late receipt settled an
`in_flight` call), and the command test showed the old script ignoring `--settle` and
listing with exit 0.

**Mutation check:** 9 of 9 fail at least one test: the `uncertain` guard removed; the
above-reservation guard removed; `>` turned into `>=`; the amount pattern accepting `0`
and leading zeros; `--cancel` accepting extra flags; repeated or unknown flags skipped;
`lateReceipt` dropped from the script; `--above-reservation` ignored; a malformed
argument read as "list".

**Checks.** `npm run check` exit 0; `npm run test:db` exit 0 (92 tests);
`npm run test:coverage` exit 0 (422 tests; 83.39 / 87.01 / 92.14 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (no page, route or
client change). The command was run against the test database only.

**Limitations.** A settled operation records the amount, not that it came from the owner
rather than the provider's response (no journal of manual decisions, as for cancel since
A6). A mistaken cancel cannot be turned into a settle by command. B48 (crashed
`in_flight`), B45 and B46 stay open; all are inert while live AI is off.
