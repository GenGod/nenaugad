# A10-001 — Phase 1 EV layer: ghost demotion from closure signals

**Result:** listing availability signals (jobicy closure checks and the
pipeline's own staleness mark) have for the first time reached ranking and the
candidate. A job whose existence we have not confirmed is **not hidden** (one
failed check is a suspicion, not a verdict: the closure rule requires two) — it
is lowered in the order and receives the honest mark «Возможно неактивна:
источник не подтвердил объявление». The phase 1 «urgency» slot is not
duplicated: age already measurably lowers the feed (A5), and the survival model
is item B6.

**Not included:** switching the product feed to the ranker (an owner decision:
the page runs on the AI sorting from decision №11, and A9 provides the gate and
the diffs for switching); the survival/hazard model and «осталось N дней» (B6);
trained EV models and self-reported outcomes (D5, phase 2); showing the mark in
the `/jobs` catalog (shown in the matching card; in the catalog — a separate
task if the owner wants one).

**Dependencies:** A1 (the threshold did not degrade), A5 (age as the urgency
proxy), A9 (guardrails — the gate for switching), A8/A6 (the journal and the
seen-set untouched).

## What was added

- `src/domain/ev-multipliers.ts` — `GhostWeights` (`suspectedInactive: -20`,
  `pipelineStale: -25`), `ghostDemotion(signal)` and `ghostNote(signal)`. The
  thresholds are constants with an explanation: the demotion is smaller than
  the gap between eligibility gate levels (30), so a suspect job sinks within
  its own level without crossing it, and never rises. No signal / `active` /
  `unknown` → 0: unknown is not suspicion, and the «unknown never closes»
  protection does not turn into a false demotion.
- `src/domain/match-ranker.ts` — a layer in the ranker: `RankableJob.closure`,
  `RankedJob.ghost`, `RANKER_VERSION` → v4 (`...-preference-ghost`). The control
  variants kept their layers isolated; the A1 baseline stayed the baseline
  (ghost off) — the ratchet comparison did not drift.
- `src/server/storage/snapshots.ts` — `readSnapshotCardsData` reads the
  closure row together with the card (`LEFT JOIN closure_checks`), the new
  `SnapshotCardRecord.closure`. One query, no deferred reads.
- `src/server/matching-service.ts` — the signal goes both into the card
  (`MatchedJob.closure`) and into the ranker shadow (A9).
- `src/app/matched/page.tsx` — an honest mark line in the matching card.
- Tests: `tests/unit/ev-multipliers.test.ts` (5 tests: unknown/active do not
  demote, one failed check lowers and explains, at equal relevance suspected
  loses to the clean one, the layer does not cross the level, the A1 set is
  inert), `tests/integration/ev-signal.test.ts` (2 tests on the live DB: one
  failed check → the job stays with the mark, a second → it leaves under the
  closure rule; unknown gives neither hiding nor a warning).

## Protocol V0–V6

- **V0.** A separate task (the last one in group A); the DB schema was not
  changed (the existing `closure_checks` are used).
- **V1.** Part 2 B1/B3 (phase 1: fixed multipliers) and arXiv:2106.01941
  re-read. Verified against the code: closure signals are collected since
  S1-005 (`closure_checks`, two failed checks → closed, unknown never), but
  they did not reach ranking — that is the honest novelty of A10. «Urgency»
  was not duplicated: A5 already measurably lowers by age (the numbers are in
  its file), and a second implementation of the same fact would worsen ranking
  by double counting — recorded in the module.
- **V2.** Principles: demotion is not hiding (an integration test: the same
  sample before and after one failed check); unknown is not suspicion (a test);
  the explanation is honest — «possibly», without an invented cause; the signal
  is visible to the candidate (the mark in the card), not only to the system;
  the data is not new — what is already collected is used.
- **V3.** `npm run check` → exit 0 (**194/194** unit, was 189; biome 179 files;
  tsc clean); **`npm run test:db` → exit 0 (44/44**, 2 new A10 tests on the live
  DB); `npm run build` → exit 0; **`npm run test:e2e` → 96 passed**;
  `npm run eval:matching` → exit 0, ranker v4, the metrics did not change
  (R@5 0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 · MRR 1.000) — the
  layer is inert without closure data, the threshold did not degrade;
  `npm run eval:shadow` → exit 0, the current ranker as a candidate moves 155
  of 159 positions against the catalog order, guardrails pass. A live check
  (local DB): after one failed check the job stayed in the feed (46 records),
  the card showed «Возможно неактивна: источник не подтвердил объявление»;
  the check's trace was deleted.
- **V4.** A10-specific cases: «a suspect job is not in the top at equal
  relevance» — a unit pair (the clean one above the suspect); «the explanation
  is shown» — a unit test on the wording + a live check of the card;
  «demotion is not hiding» — integration; «the A1 set did not degrade» — the
  ratchet tests green, the metrics match.
- **V5.** Existing tests not weakened: the synthetic degraded ranker gained the
  required field `ghost: 0` (as `preference` earlier), the degradation check
  unchanged; the A1 thresholds were not moved.
- **V6.** This file + an entry in `IMPLEMENTATION_STATUS.md`.

## Repair cycles: 2/2 (limit exhausted, work green)

1. `tsc` after wiring the layer: `RankedJob.ghost` was missing from the
   «catalog order» pseudo-ranker in the registry, from the synthetic ranker in
   `matching-eval.test.ts`, and from the collected feed records (`collected`
   did not carry `closure`). Hypothesis: the contract widened, all three places
   must return the new fact; the edits do not weaken the checks. Confirmed.
2. First run of the new unit test: `job.snapshot.closure` does not exist — I
   took the check signal for a snapshot field. Hypothesis: closure lives in
   `closure_checks`, not in the snapshot contract; the test must check the
   layer's inertness on the set (no signal → `ghost === 0`), not an invented
   field. Confirmed.

## Limitations

1. The feed order is still not ranked: ghost demotion acts in the ranker and in
   the shadow; the candidate sees only the mark. Switching is an owner decision
   (among other things because of the AI sorting on the page, decision №11);
   the gate for it is ready (A9).
2. The weight constants (−20/−25) were chosen by meaning: the «does not cross
   the eligibility gate level» property is pinned by a test, but tuning the
   values is a matter of future data. The numbers cannot be measured on the
   golden set: the fixtures have no availability checks (recorded in both the
   test and the module).
3. «Quarantined» in the closure-checks sense is a property of the whole pass
   (mass closing under suspicion is not applied), not of a record; therefore
   the per-record signal the layer uses is `consecutive_inactive`. The
   interpretation is fixed: a record the circuit breaker refused to close stays
   with one failed check and receives the strongest demotion available.
4. The mark is shown in the matching card; in the `/jobs` catalog — no (a
   separate task if the owner wants one).
5. self-reported outcomes, p(response) and trained multipliers (D5/B1, phase 2)
   are not started: they need data and a separate decision.

## Risk and rollback

Ordinary risk: domain + reading an existing table + a mark in the UI; the feed
order was not changed. Rollback — `git revert` of the A10 commit (the layer
disappears, the mark disappears, the A1 metrics stay valid: without closure
data the layer was inert).
