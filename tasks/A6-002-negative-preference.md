# A6-002 — weight demotion of the hidden job's neighborhood

**Result:** a job hidden by the candidate is no longer a lone fact: its
neighborhood (same company, same stack per the A3 dictionary) receives a
bounded demotion in ranking. This is a weight, not a filter: the job sinks
within its own level and never disappears from the feed nor rises. The shape of
the signal was chosen by **measurement** on the A1 golden set, not by taste.

**Not included:** structural filters «never show company X» (they require an
owner decision on hide reason codes and a refining UX pass), the embedding
neighborhood (B5), wiring the layer into the product feed (that is A9: shadow
mode + guardrails), the second part of «Rocchio/MMR» (D2).

**Dependencies:** A1 (measurements), A4 (company normalization), A3 (skills
dictionary), A6-001 (hiding as the signal source).

## What was added

- `src/domain/negative-preference.ts` — `dislikedPosting(snapshot)` (company +
  canonical skills), `preferenceDemotion(snapshot, disliked)` → 0 or a negative
  number: same company −12 (A4 normalization: «Hidden Labs GmbH» = «Hidden
  Labs»), a shared stack of ≥4 canonical skills −6, the cap −12 (signals do not
  add up). An empty normalized company name matches nothing. Deterministic: no
  clock, no DB.
- `src/domain/match-ranker.ts` — a layer in the ranker:
  `RankerPreferences.disliked`, the `preference` field in `RankedJob` for
  transparency, `RANKER_VERSION` → v3. The measurement variants
  (`rankJobsWithout*`, `rankJobsBaselineV0`) unchanged.
- `tests/unit/negative-preference.test.ts` — 6 tests: company/normalization, an
  empty company name, the stack threshold and aliases, no accumulation and the
  cap, the pair «hidden → its twin sinks below an equal control (and lifts no
  one)», and a set ratchet: with the synthetic hiding of two keyword-trap jobs
  the aggregate NDCG@10 does not fall and no profile gets worse.

## The measured shape of the signal (2026-09-29)

The hiding is a synthetic state (two keyword-trap jobs `golden-j28/j29`, the
very ones called the trap for the naive ranker in A2); the grades are the
handwritten A1 grades. The aggregate NDCG@10 without the layer is 0.916478.

| signal shape | aggregate NDCG@10 | what is seen |
|---|---:|---|
| company only | 0.926224 | safe but narrow |
| company + stack ≥2 | 0.919056 | **demotes relevant ones** — the threshold is too low |
| company + stack ≥3 | 0.919417 | still a dip on p-ru-ml (0.853 → 0.852) |
| **company + stack ≥4** | **0.930164** | best result, no profile worse |
| stack only ≥3 | 0.916062 | worse than with no layer at all |
| stack only ≥4 | 0.922670 | the stack alone is weaker than the company |

Conclusion: one shared skill is noise («JavaScript» is almost everywhere), two
and three are too few; a neighborhood is credible only when almost the whole
stack matches. The threshold 4 is a data-driven choice, fixed as a constant and
in the module comment.

**Control (not a defect):** if a highly relevant job is hidden, its twin sinks
and NDCG against the grades falls (0.916478 → 0.912827 on the A5 twin pair) —
this is the candidate's own statement, not a ranking error; recorded in the
module comment as a known property.

## Protocol V0–V6

- **V0.** A separate task (the second part of item A6); the DB schema was not
  changed.
- **V1.** Part 2 C2 re-read: negative preferences — first a weight demotion of
  the neighborhood; structural filters are forbidden without an owner decision.
  Verified against the code: `normalizeCompany` (A4) and `extractSkills` (A3)
  already exist — no new dependencies and models (ADR-001 not violated).
- **V2.** Principles: demotion is not hiding (both jobs stay in the feed; a
  test), the eligibility gate is unchanged (the layer only changes the score;
  the guards in the ratchet equal the baseline), one candidate's signals come
  only from their own hiding (`hiddenSnapshotIds` is owner-scoped, a separate
  integration test A6-001/S2-002), no embeddings and no «similarity» — only
  company and dictionary.
- **V3.** `npm run check` → exit 0 (**176/176** unit, was 170; biome 165 files;
  tsc clean); `npm run eval:matching` → exit 0, ranker v3, the metrics did not
  change without preferences (R@5 0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10
  0.916 · MRR 1.000, guards 0/0); `npm run build` → exit 0.
  `test:db`/`test:e2e` — `not_run`: the schema and the product path were not
  changed (the layer is not yet wired into the feed, A9).
- **V4.** Item-specific cases: a company and its legal form, an empty company
  name, the threshold and aliases, no accumulation, the pair «hidden → the twin
  below the control», a set ratchet. The common golden cases (golden 9 — signal
  isolation) are covered by the owner-scoped hiding tests and the seen-set.
- **V5.** Existing tests not weakened: in `matching-eval.test.ts` the synthetic
  «degraded» ranker gained the new required field `preference` (0) — the
  degradation check unchanged; the A1 thresholds were not moved.
- **V6.** This file + an entry in `IMPLEMENTATION_STATUS.md`.

## Repair cycles: 2/2 (limit exhausted, work green)

1. First run of the new unit tests: 4 failures, all in test expectations, not
   in the layer (company+stack give −6 where I expected 0; the alias `js` does
   not resolve, it is ambiguous in the A3 dictionary; the control in the pair
   had different text and therefore a different base score). Hypothesis: the
   tests must set the signals explicitly and compare scores accounting for the
   base difference. Confirmed.
2. `tsc` failed in the existing `tests/unit/matching-eval.test.ts`: the
   synthetic degraded ranker builds a `RankedJob` without the new `preference`
   field. Hypothesis: the contract widened, the synthetic ranker must return
   the field; the degradation check is not weakened by this. Confirmed.

## Limitations

1. **The layer is not wired into the product feed.** The product path
   `/matched` sorts by the AI score and does not call the ranker; wiring the
   ranker in (shadow mode, guardrails) is item A9. The layer is currently
   measured on the golden set and ready to be wired in, but the user does not
   observe it yet.
2. The threshold ≥4 and the weights (−12/−6) were chosen on 34 synthetic jobs;
   that is too little for a confident choice. The values are fixed as constants
   and are to be revisited as the set/data grows (including when moving to the
   embedding neighborhood, B5).
3. Signal accumulation is deliberately forbidden (the −12 cap), so «many
   hidings» does not turn into a structural filter — this is a deliberate limit
   on the signal's strength.
4. The hide `reason_code` does not affect the weight: «компания не интересна»
   and «не тот стек» give the same demotion. Differentiation by reason — after
   an owner decision on extending the reason codes.

## Risk and rollback

Ordinary risk: a pure function + a ranker layer; product behavior unchanged
(the layer is not wired in). Rollback — `git revert` of the A6-002 commit: the
ranker returns to v2, and the A1 golden thresholds remain valid (without
preferences the metrics match).
