# B49-001: an extraction pass reads the clock for each posting (B49)

**Status: accepted by the owner, 2026-10-12.** Implemented, independently reviewed and
checked locally the same day. Basis: [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) B49, found 2026-10-12
by the B48-001 review.

## Result and boundaries

**User result:** none visible today (live AI is off). When it is on, every paid
extraction call meets the source's `send_to_ai_provider` permission (expiry,
`valid_until`) at the moment it is made, a permission that lapses during a pass stops the
pass with `no_permission`, and each operation's stored deadline is its own reservation
time + 120 s. Today a pass uses the time it started for all of this, which in an
unbounded `extract:fields` run or a worker tick after a long import can be an hour old.

**Root cause.** `runExtractionPass` takes one `now` and hands it to every posting
(`extraction-pass.ts:219` at HEAD); `extractPostingFields` uses it for the permission
check and the gateway uses it for the reservation's deadline and `beginAttempt`. The
callers compute it once: `extract:fields` at start-up for all sources
(`scripts/extract-fields.ts:46`), the worker at the start of the tick, before the import
(`scripts/worker.ts:49`), the import scripts before the pass. So:
- a policy that expires during a pass keeps sending posting text to the provider until
  the pass ends (source rights; at most one pass, since the next starts with a fresh
  time);
- every reservation's stored deadline is the pass start + 120 s, which is what
  `holdHint`'s "do not cancel until" for a `reserved` hold and `ai:holds` show.
No money is at risk: each operation makes one attempt right after its reservation, and
B48 judges a crash on the database's clock.

**What it does not fix (recorded as B50).** The gateway gives the reservation and its
attempt the same `now` (`gateway.ts`), so `beginAttempt`'s `deadline_at > now` holds for
any new reservation, before and after this change: a reservation that waits more than
120 s on a budget-row lock is still dispatched. The deadline can only refuse a row created
another way. The relevance route checks source rights once per request, before its chunk
loop (inert while the personal-data boundary closes it).

**Change.**
1. `runExtractionPass` and `runExtractionPassAfterImport` take `clock: () => string`
   instead of `now`. The pass reads it for its own permission check and afresh for each
   posting it hands to `extractPostingFields`. `systemClock` (the wall clock, ISO) is
   exported from `extraction-pass.ts` for the callers. No default: a caller must say
   which clock it means.
2. A posting-level `no_permission` (or `unknown_source`) stops the pass with that
   outcome, its counts and results so far, like a budget refusal: with a clock that only
   moves forward, every later posting would be refused the same way, and the summary the
   worker logs must say the permission lapsed instead of `ran`.
3. Callers pass `systemClock`: `scripts/worker.ts`, `scripts/extract-fields.ts` (its
   start-up `now` is gone), `scripts/import-himalayas.ts`, `scripts/import-jobicy.ts`. The
   hold hints they print compare with a fresh time (`holdHint(held, systemClock())`).
4. `scripts/guardrails.mjs` keeps it: in every `scripts/*.ts` and `src/**/*.ts` but the
   pass's own module, with comments stripped, each pass call must take `clock:
   systemClock` in a literal argument and each `holdHint` must compare with
   `systemClock()`; a call it cannot read (a variable argument, nested braces, a computed
   time) is refused; `systemClock` must be imported from `extraction-pass.ts` and not
   redefined or reassigned.
5. Tests pass a fixed clock (`() => NOW`) where they used `now: NOW`.

**Not changed:** `extractPostingFields` and the gateway still take a `now` (one call, one
time); the import itself (its own `now` dates the import's records); the ledger; no
migration.

**Risk: high (source rights and the paid path).** Tests first, an independent `reviewer`
pass, and the owner's acceptance before it is treated as done.

**Data:** the isolated test database only. No provider call, no spend.

## Acceptance (fixed before the code; 2 restated after the review)

1. A pass whose clock moves on between calls (a mock transport advances it by 8 minutes
   per call): each posting's operation has its own deadline, its reservation time plus
   120 s, not the pass start's.
2. A source permission that expires during a pass: the posting read before `valid_until`
   is extracted; the next one stops the pass with `no_permission` (counts and results so
   far kept), and nothing more is sent to the transport or reserved.
3. A pass that starts after `valid_until` is `no_permission`, as before; every other pass
   test keeps its outcome with a fixed clock.
4. The worker, `extract:fields` and both import scripts pass the wall clock and their hold
   hints use a fresh time (a static guardrail over every caller).
5. `npm run check`, `npm run test:db` and `npm run test:coverage` pass; thresholds not
   lowered. An independent review of the diff finds no blocking issue.

## Plan

1. Tests first in `tests/integration/extraction-pass.test.ts` (1–3); 4 as a static
   guardrail in `scripts/guardrails.mjs`, next to B31's.
2. `extraction-pass.ts`, the four scripts, the existing tests' `now:` → `clock:`.
3. Checks; mutation check; independent review; docs; the owner.

**Rollback:** `git revert`. No data migration.

## Approvals and limits

Local code and the isolated test database. No provider call, no spend. Coding-host spend:
not visible.

## Independent review (2026-10-12)

A `reviewer` agent in a fresh context read this file and the working-tree diff, ran
`check:agent`, `guardrails`, the extraction, worker and extraction-service tests,
`test:db` and `test:coverage` (all exit 0). **Verdict: no blocking issues.** It confirmed
that reading the clock once before the loop fails both new tests, that neither test
depends on posting order, and that no other paid path uses a time captured before its
call (the letter route, `smoke:ai` and `ai:holds` read it per call; the batch path is
closed; `extract:fields --snapshot` makes no call).

Findings and what was done:
1. The guardrail let frozen clocks through (a variable argument, a space before the
   brace or parenthesis, a nested time, a comment, a shadowing `systemClock`) and covered
   only four files → rewritten as in change 4 and probed with each of those forms
   (10 of 10 as expected, the reviewer's false positive included).
2. A policy lapsing mid-pass still reported `ran` and visited every posting → the pass
   stops with `no_permission` (change 2); criterion 2 restated.
3. The file claimed the deadline is now checked at each call; it still cannot refuse a
   new reservation → corrected above; recorded as B50, with the relevance route's
   once-per-request source check (finding 5).
4. Two comments still said a pass hands every posting its start time → reworded
   (`spending.ts`, `ai-guards.test.ts`).
5. Older paths: the relevance route (in B50); the import's fetch permission is checked
   once per import (fetch rights, one import long) → noted, not changed.
6. `markUncertain` and the gateway's settle stamp the pre-call time; nothing decides on it
   today → noted.
7. The `extract:fields` hold hint is computed before the remaining sources run; its time
   is absolute, so it stays true → left.
8. A stale line reference and the unrecorded mutation check → corrected and recorded
   below.

## Result (2026-10-12)

**What changed.**
- `src/server/ai/extraction-pass.ts`: `clock` instead of `now`; `systemClock`; a
  posting-level refusal stops the pass; the header states both.
- `scripts/worker.ts`, `scripts/extract-fields.ts`, `scripts/import-himalayas.ts`,
  `scripts/import-jobicy.ts`: `clock: systemClock`; hold hints on `systemClock()`.
- `scripts/guardrails.mjs`: the B49 check (change 4).
- `src/server/ai/spending.ts`, `tests/integration/ai-guards.test.ts`: comments only.
- Tests: `tests/integration/extraction-pass.test.ts` — "a long pass reads the clock for
  each posting: every reservation has its own deadline" (1, and `systemClock` itself), "a
  source permission that expires during a pass stops the postings after it" (2); the
  existing pass calls on a fixed clock (3).
- Docs: `docs/OPEN_GAPS.md` (B49, new B50), `IMPLEMENTATION_STATUS.md`.

**Tests first.** Before the change both new tests failed: both reservations got the pass
start's deadline (12:02 twice), and the lapsed policy still sent the second posting. The
guardrail flagged all four scripts.

**Mutation check:** 7 of 7 caught before the review (the posting's time frozen; the
pass-level check on a fixed time; `systemClock` returning a fixed time; a frozen clock or
hint time in the worker, `import-jobicy` and `extract-fields`), plus, after it, the stop
removed (the expiry test fails) and the ten guardrail probes above.

**Checks.** `npm run check` exit 0 (331 unit tests); `npm run test:db` exit 0 (97 tests);
`npm run test:coverage` exit 0 (428 tests; 83.45 / 87.04 / 92.16 against 82 / 86 / 91,
thresholds unchanged). Not run: `npm run build`, `npm run test:e2e` (no page,
route or client change).

**Limitations.** B50 (the deadline cannot refuse a new reservation; the relevance route's
source check) stays open, as do B45 and B46; all are inert while live AI is off. The
guardrail is textual: a caller in another language or built at run time is not seen.
