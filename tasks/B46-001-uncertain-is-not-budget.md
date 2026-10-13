# B46-001: an uncertain call is not reported as a spent budget (B46)

**Status: accepted by the owner, 2026-10-13.** Implemented, independently reviewed and
checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B46,
found 2026-10-12 by the B37-001 review.

## Result and boundaries

**User result:** none visible today (live AI is off; the personal-data boundary closes
letters and relevance). When they open: a letter whose call came back uncertain answers
409 `OPERATION_UNCERTAIN`, and the editor says «Не удалось сгенерировать. Попробуйте
позже.» instead of «Бюджет исчерпан — обратитесь к владельцу.»; a relevance chunk whose
call came back uncertain answers 409 `OPERATION_UNCERTAIN` instead of 402
`BUDGET_UNAVAILABLE`.

**Root cause.** The gateway (`src/server/ai/gateway.ts`) throws `BUDGET_UNAVAILABLE` for an
uncertain result, a code that also means "the global budget row is missing"
(`gateway.ts`, `spending.ts`). The letter route maps any message containing "BUDGET" to
402 `BUDGET_EXCEEDED`, and the relevance route maps `BUDGET_UNAVAILABLE` to 402: both tell
the caller the budget is the problem when only the call's billing is unknown. B37 added
`OPERATION_UNCERTAIN` for a replay of such a call; the first result kept the old code.

**Change.**
1. The gateway throws `OPERATION_UNCERTAIN` for an uncertain result, the code a replay
   already meets (B37). `BUDGET_UNAVAILABLE` keeps one meaning: the global budget row is
   missing.
2. `isUncertainReplay` becomes `isUncertainCall` (the first result or a replay).
3. The letter route's error mapping moves to `letterGenerationFailure` in
   `src/server/letters/generation-failure.ts` (a route file may export only handlers), so
   it can be tested; the route keeps the logging of an unknown error and its 502.
   Behaviour is unchanged except that an uncertain call is 409 `OPERATION_UNCERTAIN`, and
   that 429 `GENERATION_LIMIT` now answers only the ledger's `ATTEMPTS_EXHAUSTED` (the old
   rule matched any error naming "ATTEMPTS"; nothing else throws one today, and such an
   error now reaches the 502 and its log).
4. Comments that said an uncertain dispatch surfaces as `BUDGET_UNAVAILABLE` are corrected
   (`ledger-refusals.ts`, `extraction-pass.ts`).

**What the callers do with it (unchanged in effect):** the extraction pass looks the
operation up for every ledger refusal and reports the source `held` (its `code` now says
`OPERATION_UNCERTAIN`) — or, if the owner cancelled or settled that operation between
the result and the lookup, counts the posting `blocked` (B31's rule for a closed
operation) instead of the old misleading `budget_refused`; the relevance run stops on it (`isStopError` lists it since B37)
and answers 409 instead of 402; the letter route answers 409, and the editor shows its
generic failure message (no new copy).

**Not changed:** the hold (kept, as before), the ledger, `isStopError`'s list, the editor;
`BUDGET_UNAVAILABLE` for a missing global row is still 402 `BUDGET_EXCEEDED` in the letter
route (a configuration problem the owner fixes); no migration.

**Risk: high (the paid entry point's refusal codes).** Tests first, an independent
`reviewer` pass, and the owner's acceptance.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code)

1. Through the gateway, a call whose transport answers `uncertain` is refused with
   `OPERATION_UNCERTAIN`, the hold is kept, and a replay of its key meets the same code;
   a missing global budget row is still `BUDGET_UNAVAILABLE`.
2. `letterGenerationFailure`: `OPERATION_UNCERTAIN` → 409 `OPERATION_UNCERTAIN` (not 402);
   `BUDGET_EXCEEDED`, `BUDGET_UNAVAILABLE`, `OWNER_BUDGET_MISSING` → 402 `BUDGET_EXCEEDED`;
   `DEADLINE_EXPIRED` → 409; `ATTEMPTS_EXHAUSTED` → 429 `GENERATION_LIMIT`; the
   personal-data boundary, the live-AI switch and a missing provider → 503; a
   `LetterError` → 500 with its code; anything else → none (the route's 502).
3. The extraction pass reports an uncertain posting `held`, now with
   `code: "OPERATION_UNCERTAIN"`; every other test keeps its outcome.
4. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first: 1 in `tests/integration/ai-guards.test.ts` (the existing assertions of
   `BUDGET_UNAVAILABLE` for an uncertain result change); 2 in a new
   `tests/unit/letter-failure.test.ts`; 3 in `tests/integration/extraction-pass.test.ts`.
2. The gateway; the classifier rename; the mapping module; the route; comments.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-13)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `ai-guards` + `extraction-pass`, `test:db` and `test:coverage` (all exit 0).
**Verdict: no blocking issues.** It confirmed that no money behaviour changed
(`markUncertain` then the throw; the hold kept; no new retry or release path), that every
consumer of the code was checked (the relevance run stops on it and answers 409; the
extraction pass, the worker, `extract:fields` and `smoke:ai` pass the code through and
none compares it with `BUDGET_UNAVAILABLE`), and that the reordered mapping answers every
earlier input as before.

Findings and what was done:
1. *Should-fix (follow-up):* the editor shows its generic «Не удалось сгенерировать.
   Попробуйте позже.» for an uncertain call; a retry is a new key, a new hold and a second
   paid call while the first may have been billed, and nothing tells the candidate that
   money is held → recorded as B52 (copy for `OPERATION_UNCERTAIN` and
   `DEADLINE_EXPIRED`), an owner decision on the wording.
2. A cancel or settle racing the pass's lookup now counts the posting `blocked` instead
   of `budget_refused` → in "What the callers do with it".
3. The "ATTEMPTS" rule narrowed to the ledger's code, and the "BUDGET" substring rule was
   untested → in change 3; both now asserted.
4. The new test left the global budget row deleted → it restores it.
5. Older task files (B31, B37, B45) still name `BUDGET_UNAVAILABLE` or
   `isUncertainReplay` → left as the historical record.

## Result (2026-10-13)

**What changed.**
- `src/server/ai/gateway.ts`: an uncertain result throws `OPERATION_UNCERTAIN`.
- `src/server/ai/ledger-refusals.ts`: `isUncertainCall` (was `isUncertainReplay`); comments.
- `src/server/letters/generation-failure.ts` (new): `letterGenerationFailure`;
  `src/app/api/v1/cover-letters/[id]/generations/route.ts` uses it.
- `src/server/ai/extraction-pass.ts`: a comment.
- Tests: `tests/unit/letter-failure.test.ts` (new, 2); `tests/integration/ai-guards.test.ts`
  — "a letter whose call comes back uncertain is not told the budget is spent" (1, 2),
  and the B37 and B45 tests' first uncertain result; `tests/integration/extraction-pass.test.ts`
  (3); `tests/unit/ledger-refusals.test.ts` (the rename).
- Docs: `docs/OPEN_GAPS.md` (B46, new B52), `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change four extraction tests and the B37/B45 assertions
failed (the gateway still said `BUDGET_UNAVAILABLE`), and the mapping module did not exist.

**Mutation check:** 5 of 5 caught: the gateway back to `BUDGET_UNAVAILABLE`; the uncertain
branch removed from the mapping; mapped to 402; the generation limit removed;
`isUncertainCall` accepting any error.

**Checks.** `npm run check` exit 0 (336 unit tests); `npm run test:db` exit 0 (103 tests);
`npm run test:coverage` exit 0 (439 tests; 83.47 / 87.25 / 92.38 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (no page change; the
routes cannot run while the personal-data boundary closes them).

**Limitations.** The editor's copy for an uncertain call invites a paid retry (B52, the
owner's wording); B40 stays open.
