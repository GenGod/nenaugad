# A9-001 — ranker infrastructure: a version registry, a shadow run, per-request guardrails

**Result:** the ranker stopped being an unwired stub module. There is now a
version registry with stable ids (including "what candidates receive today"), a
shadow run on the same inputs with a diff of positions and a log of numbers only,
and per-request guardrails (empty feeds, closed/duplicate/unapproved sources in
the top-10, p95 latencies) — with thresholds that fail a test. The production feed
deliberately does **not** change: the champion is the ordering served now, and the
shadow only reports what would change. This is the precondition for A10: the feed
order may be changed only behind these gates.

**Out of scope:** EV multipliers and switching the feed to the ranker (A10);
rerank (B3); online A/B and canary (traffic is needed; research D10 — a percentage
canary at growth); shadow columns/dual-write (B1).

**Dependencies:** A1 (measurements and baseline), A2/A5/A6-002 (the layers the
ranker carries), A8 (the journal — the source of facts about impressions).

## What was added

- `src/domain/ranker-registry.ts` — `REGISTERED_RANKERS`: `feed-default-order`
  (not a ranker: the catalog order, that is, what candidates receive today),
  `v0-status-skills-role` (the A1 baseline), `v1-plus-requirements`,
  `v0-plus-freshness` (the A5 control), `v3-...` (current, all layers). Each
  version has an id, a description and a function; `RegistryRanker` takes
  optional preferences (A6-002), so older versions were not rewritten.
- `src/domain/rank-guardrails.ts` — metrics and thresholds: `maxEmptyShare 0.5`,
  `maxClosedInTop10Share 0`, `maxDuplicateInTop10Share 0`,
  `maxUnapprovedSourceShare 0`, `maxP95LatencyMs 250`. The three zero thresholds
  are absolute rules (closed, duplicate, unapproved source are never delivered),
  the empty share and the latency are wide bounds that an honest feed does not
  touch. An empty pool (nothing to rank) is **not** counted as an empty feed:
  otherwise the seen-set (A6), having honestly hidden everything, would fail the
  guardrail — this was caught by a live check and pinned by a test.
- `src/domain/ranker-shadow.ts` — `shadowDiff`: how many positions moved, how the
  top-10 changed, the maximum shift, the first divergence. Positions, not scores
  — the scales of versions are incomparable.
- `src/server/ranker-shadow-service.ts` — `computeRankerShadow` (the champion
  against the candidate on the same inputs) and `logRankerShadow` (**numbers
  only**: no job ids, no profile — a test checks this).
- `src/server/matching-service.ts` — the shadow line at the end of the feed read,
  inside a `try/catch`: a failed shadow does not affect the feed (a test compares
  the feed with a "broken" shadow and without one), and the shadow's input is
  exactly the delivered jobs (ineligible do not enter the shadow).
- `scripts/eval-shadow.ts` + `npm run eval:shadow` (`--candidate=<id>`,
  `--json`): a shadow run over the golden set, exit 1 on a guardrail violation —
  this is the gate for A10.
- Tests: `tests/unit/rank-guardrails.test.ts` (9 tests: every degradation is
  caught — an empty feed, a closed/duplicate/unapproved source in the top-10, a
  slow ranker; the top-10 boundary; an empty pool),
  `tests/integration/ranker-shadow.test.ts` (2 tests on a live DB: the shadow
  sees exactly what was delivered and logs numbers without data; a failed shadow
  does not change the feed).

## Measurements (2026-09-29)

- `npm run eval:shadow` on the golden set: against the catalog order the
  candidate `v0-status-skills-role` moves 150 of 159 positions (the top-10
  changes by 68 entries, the maximum shift 22), `v1-plus-requirements` — 156/159,
  the current one — see below; all versions pass the guardrails.
- The live feed (local DB, 46 delivered jobs, 700 snapshots in the catalog):
  `{"code":"RANKER_SHADOW","champion":"feed-default-order","candidate":"v3-...","compared":46,"moved":43,"top10Changed":18,"maxShift":39,"guardrailsPass":true,"violations":[]}`
  — that is, switching the feed to the current ranker would change almost the
  whole order (that is exactly the owner decision on A10, now it is measurable).
- The cost of the shadow: ~0–25 ms for 46 delivered jobs (measured on the same
  machine, three runs; the guardrail threshold of 250 ms with margin).

## Protocol V0–V6

- **V0.** A separate task; the DB schema was not changed; the production feed was
  not changed.
- **V1.** Part 2 D7/D10 re-read: the guardrails are computed per request, not as
  an average over users (there is no traffic), the shadow run — without
  influencing the feed. Confirmed in the code: there is no ranker in the read
  path at all, so the "champion" is the catalog order; this is recorded honestly
  as a separate id, not passed off as a ranker.
- **V2.** Principles: the shadow decides nothing (a test with a throwing shadow),
  neither job ids nor the user reach the log (a test on the log line); thresholds
  are constants with tests, a degradation fails the suite; nothing fake — the
  guardrails count real facts of the feed, and "nothing to rank" is not passed
  off as "an empty feed".
- **V3.** `npm run check` → exit 0 (**189/189** unit, previously 180; biome 178
  files; tsc clean); **`npm run test:db` → exit 0 (42/42**, 2 new A9 tests on a
  live DB); `npm run build` → exit 0; **`npm run test:e2e` → 96 passed**;
  `npm run eval:matching` → the A1 thresholds did not move;
  `npm run eval:shadow` → exit 0, all candidates pass the guardrails. Live run:
  see the measurements above.
- **V4.** A9-specific cases: "a new ranker with degraded thresholds is caught by
  the guardrail" — five separate degradations (an empty feed, closed, duplicate,
  unapproved source, slow ranker); "a shadow run does not influence the user's
  feed" — a test with a broken shadow + the determinism of two reads.
- **V5.** Existing tests were not weakened (the only edit in them — the
  `preference` field already done in A6-002); the A1 thresholds did not move; the
  diff reviewed.
- **V6.** This file + a record in `IMPLEMENTATION_STATUS.md`.

## Repair cycles: counter 2/2, there were 4 checking rounds

The counter is spent in full; below are all the rounds, each with a new diagnosis
and no repeat of the same error:

1. `npm run check` failed on tsc: the registry typed rankers with three
   arguments, while the shadow passes a fourth (the A6-002 preferences).
   Hypothesis: the registry must have its own type with optional preferences.
   Confirmed.
2. `test:db`: the shadow received a job the feed does not deliver (ineligible).
   Hypothesis: the shadow must see exactly what was delivered — the accounting
   must stand behind the same condition as the pushes into eligible/needsReview.
   Confirmed.
3. `test:db`: the expected pool (3 fixtures) did not match the fact (2) — one
   fixture is cut off by the catalog gate. Hypothesis: the pool is what passed
   the gate, not the size of the file. Confirmed — and in the same round refined
   to "the pool = the ranker's input".
4. A live check: the guardrail fired on an **honestly** empty feed (the seen-set
   hid all 46 after the first showing) — a false positive that would devalue the
   gate. Hypothesis: an empty pool ≠ an empty feed; the metric must count only
   requests where the ranker had something to order. Confirmed: an empty feed
   without impression data passes, while a ranker that throws everything out of a
   non-empty input fails (test).

## Limitations

1. **The feed is still not ranked by the ranker** — the shadow only reports. The
   switch (and the EV multipliers) is A10, behind the same guardrails.
2. The three "hard" guardrail metrics are structurally zero today (the gates,
   dedup and the source matrices do not let closed/duplicates/foreign sources
   through) — these are nets against regressions, not a measurement of current
   quality; the live metrics today are the empty share, the latency and the
   shadow diff.
3. The p95 latency was measured on one machine and one profile (46 jobs); as the
   catalog grows the threshold must be re-measured (or ranking made incremental).
4. `eval:shadow` counts the synthetic fixtures as approved sources: they have no
   source policy, so this guardrail is checked only on the live path (and covered
   by the matrix tests).
5. The champion in the production shadow is the catalog order, not the page: the
   AI sorting of the `/matched` page lives above the service and does not enter
   the diff. This is recorded, not masked.

## Risk and rollback

Ordinary risk: new reads/logging, the feed order was not changed. Rollback —
`git revert` of the A9 commit (the shadow and the guardrails disappear, the feed
stays as it was; `eval:shadow` and the registry are auxiliary).
