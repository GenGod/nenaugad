# B35-001 — The tariff and the caps count in the same unit

**Status: accepted by the owner, 2026-10-07.** Implemented and independently reviewed the
same day.
Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B35, found 2026-10-07 by reading the
ledger after the owner's first live extraction run (5 himalayas postings); AGENTS.md
(money changes need a separate review and the owner's acceptance).

**Owner decisions (2026-10-07, this session):** fix it; rename the unit honestly; keep the
14 operations already settled as they were booked (evidence of what the code computed),
with the factor documented. Correcting the budget totals or rewriting every row was
declined.

## Result and boundaries

**The defect.** The code calls its money unit a "micro-cent" and never defines it.
- The caps and every display treat one unit as one millionth of a dollar: $10 =
  10,000,000, $1 = 1,000,000, 1 cent = 10,000 (`provider.ts`, `ai-holds.ts`,
  `seed-ai-budgets.ts`).
- The tariff was written in a different unit: "$0.10 → 10 cents → 10,000", which is
  1 cent = 1,000. OpenAI's pricing page (re-read 2026-10-07) confirms gpt-6-luna at
  $0.10 per million input tokens and $0.50 per million output tokens, so in the caps'
  unit the tariff is 100,000 and 500,000, not 10,000 and 50,000.
- Every reservation and every settled amount was booked at a tenth of the real price,
  so the owner-approved caps ($10 total, $1 per user per month, 1 cent per call) let ten
  times as much real money through. The first live run's 5 calls are booked as 265
  units ($0.000265); they cost about $0.00265.

**User result:** the ledger books what OpenAI charges, so the caps the owner approved are
the caps that apply. The unit is named for what it is: micro-dollars (μ$, one millionth
of a dollar; 1 cent = 10,000 μ$).

**Not included:**
- The 14 operations already settled on the local database (6 cover letters, 3 matching,
  5 extraction; 428 units recorded, about 4,280 real): kept as booked, by owner decision.
  The budgets undercount past spend by about $0.004. The 5 extraction records keep their
  old-unit `settled_minor` too (57, 64, 44, 70, 30); nothing adds them up today, but a
  report over `job_llm_fields` would mix units.
- A settlement above its reservation frees other operations' holds (OPEN_GAPS B36,
  existed before, found by this task's review): a separate money task.
- Cached-input pricing ($0.01 per million): every input token is still priced as uncached,
  which can only overestimate.
- The database columns (`*_minor`): unit-neutral names, unchanged; no migration.
- Frozen history (`docs/history/`, accepted task files): unchanged.

**Context:** `src/server/ai/provider.ts`, `src/server/ai/openai-transport.ts`,
`src/server/ai/gateway.ts`, `src/server/ai/extraction-service.ts`,
`src/server/ai/extraction-pass.ts`, `src/app/api/v1/relevance/route.ts`,
`src/app/api/v1/cover-letters/[id]/generations/route.ts`, `src/server/users.ts`,
`src/components/letter-editor.tsx`, `scripts/ai-holds.ts`, `scripts/seed-ai-budgets.ts`,
`scripts/smoke-ai.ts`, `scripts/extract-fields.ts`, `tests/unit/ai-provider.test.ts`.

**Risk: high** (money). It changes every reservation and every settled amount by a factor
of ten. Negative tests, an independent review and the owner's acceptance are required.

**Data:** unit tests and the existing integration tests with the labelled mock transport.
No migration; nothing is sent or paid.

## Acceptance (fixed before the code)

1. One unit, defined once: `MICRO_USD_PER_DOLLAR = 1_000_000`. The tariff and the caps are
   written from it ($0.10, $0.50, 1 cent, $1, $10), so a dollar figure in a comment and the
   number beside it cannot disagree again.
2. A million input tokens cost $0.10 (100,000 μ$) and a million output tokens $0.50
   (500,000 μ$); the integer ceiling still rounds up and never uses floats.
3. The caps keep their dollar values: 1 cent per call, $1 per user per month, $10 in total.
4. Every realistic envelope still fits the 1-cent ceiling: the cover-letter envelope
   (28K in, 6K out, 0.58 cents), a 4,000-character extraction prompt (0.45 cents) and the
   longest posting on the local database (about 0.6 cents).
5. Every identifier, JSON field and printed label that said micro-cents says micro-dollars
   (`MicroUsd`, μ$); the conversion to cents for display stays 10,000 μ$ per cent.
6. Unchanged: the ledger's rules, the database columns, the recorded rows.

## Plan

1. Tests first: `tests/unit/ai-provider.test.ts` pins the unit (a million tokens at the
   page's prices), the caps in dollars, and the envelopes against the ceiling.
2. `provider.ts`: the unit constant, the corrected tariff, the renamed fields and
   function; the rename through every caller, output and label.
3. Checks; mutation check; independent review; docs (OPEN_GAPS B35, IMPLEMENTATION_STATUS);
   then the owner.

**Rollback:** `git revert`. After a revert the ledger books a tenth again; no stored data
changes either way.

## Approvals and limits

Local code and tests. No provider call, no spend. The pricing page was read, which sends
nothing. Coding-host spend: not visible.

## Result (2026-10-07)

**What changed.**
- `src/server/ai/provider.ts`: `MICRO_USD_PER_DOLLAR`; the tariff ($0.10 and $0.50 per
  million tokens, so 100,000 and 500,000 μ$) and the caps (1 cent, $1, $10) written from it;
  `TOKENS_PER_MTOK` for the per-million division (review finding 2); the fields and the
  cost function renamed (`*MicroUsd`, `worstCaseCostMicroUsd`); the comment that explains
  the old unit.
- `src/server/ai/openai-transport.ts`: `usageCostMicroUsd`, the settled amount from the
  reported usage (review finding 4), used by `dispatchOnce`.
- The rename through every caller, output and label: `gateway.ts`, `extraction-service.ts`,
  `extraction-pass.ts` (`settledMicroUsd`), `users.ts`, the relevance route
  (`totalCostMicroUsd`, `costMicroUsd`) and the cover-letter route, `letter-editor.tsx`
  (μ$), `ai-holds.ts` (`releasedMicroUsd`, `reservedMicroUsd`; cents from the constant),
  `seed-ai-budgets.ts` (μ$ with dollars), `smoke-ai.ts` (μ$; the remaining budget from the
  constant instead of a literal), `extract-fields.ts` (`worstCaseMicroUsd`), the tests.
- `tests/unit/ai-provider.test.ts`: the caps in dollars; a million tokens at the page's
  prices; the settlement from usage; the envelopes (5,800 and 4,496 μ$); the exact
  ceiling edge (59,040 characters fit, 59,041 do not).

**Mutation check:** 8 of 8 fail at least one test: the old input tariff, the old output
tariff, a ceiling, a quota or a global budget ten times looser, floor instead of
ceiling, the unit itself, and a settlement booked at a tenth.

**Independent review** (fresh context, 2026-10-07): "ready for owner acceptance", no
blocking finding. It traced every money path (one cost function, used for reservations,
settlement and the ceiling), found no stale reader of a renamed field, confirmed the
14 rows and the 428 units against the local database, and found no weakened test or
enlarged test budget. It ran `npm run check:agent` (0) and `npm run test:db` (87/87).
Findings and what was done:
1. *OPEN_GAPS marked B35 closed before acceptance.* Now "fixed, owner acceptance open".
2. *The 5 extraction records keep old-unit amounts too; the per-million literal equalled
   the unit by coincidence.* Listed under "Not included"; `TOKENS_PER_MTOK` named.
3. *A settlement above its reservation frees other operations' holds* (existed before).
   Recorded as OPEN_GAPS B36 for the owner.
4. *No test of the settlement from usage.* `usageCostMicroUsd` extracted and tested.

**Measured on the local database:** the longest posting is 18,406 characters (jobicy),
about 6,040 μ$ at worst, under the 10,000 ceiling; no provisioned limit differs from the
caps; no hold is open. At the first run's 530 μ$ per posting, the extractor's $1 a month
covers about 1,900 extractions; past that the pass stops with `budget_refused`, as it
should.

**Checks** (on the final code, 2026-10-07):

| Command | Exit | Result |
|---|---|---|
| `npm run check` | 0 | unit 306/306 (2 new); guardrails, Biome, `tsc` clean |
| `npm run test:coverage` | 0 | unit and DB 393/393; 83.09% lines, 86.58% branches, 92.01% functions |
| `npm run build` | 0 | compiled |
| `npm run test:e2e` | 0 | 99 passed |

Not run: CI on GitHub (not pushed); a live call (live AI stays the owner's switch).

**Acceptance:** 1–6 met and tested locally; the independent review is done.
**Accepted by the owner 2026-10-07.**

**Rollback:** `git revert`. After a revert the ledger books a tenth again; no stored data
changes either way.

**Next small task:** B36 (settlement above a reservation), then a look at the first run's
five records before the worker extracts.
