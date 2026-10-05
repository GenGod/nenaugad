# A1-001 — golden set and eval harness for matching (Recall@k / NDCG@k / MRR)

**Result:** matching quality became measurable. There is now a synthetic golden
set (29 jobs × 6 segment profiles = 174 handwritten relevance judgements) and a
deterministic harness that computes Recall@5/@10, NDCG@5/@10 and MRR on top of
the real gates (`src/domain/matching.ts`) and the v0 baseline ranker. The
thresholds are pinned as a ratchet test: a degradation fails the test. This is
the foundation for all the other items of the registry — without it there is
nothing to measure ranking changes with.

**Out of scope:** embeddings/BM25/rerank (B1–B3), LLM scoring and HyDE (C1–C3),
changes to the eligibility gate rules, UI, real user data.

**Context:** [the brief](../docs/design/2026-09-27-matching-implementation-brief.md)
(item A1, the V0–V6 protocol);
[the research](../docs/research/2026-09-26-job-matching-research.md) (part 1
«Датасеты, бенчмарки, метрики» ["Datasets, benchmarks, metrics"], part 2 D3/D4).

## What was added

- `src/domain/eval-metrics.ts` — `dcgAtK` / `ndcgAtK` / `recallAtK` /
  `reciprocalRank` / `meanOfApplicable`. The formulas were verified against
  primary sources (V1, 2026-09-27): Wikipedia DCG (exponential gain, 1-based
  positions, the log2(i+1) discount), Wikipedia MRR, the Stanford IR book (recall
  as a set measure over top-k). "Not applicable" = `null` and is excluded from
  the mean, not turned into 0.
- `src/domain/match-ranker.ts` — the v0 baseline: eligibility status (30) + the
  number of matched dictionary skills × 10 + the target role in the title (15),
  a tie-break by id. The version is pinned (`RANKER_VERSION`). Replaced by items
  A2/A5/A10/B3 behind the same interface.
- `src/domain/matching-eval.ts` — the runner `runMatchingEval(set, ranker)`.
  Gating and ranking are measured separately: NDCG is not punished for what is
  hidden (that is the guard's business), and the guard "relevant but hidden" = 0
  catches a real eligibility mistake. The golden set and report types live here
  too.
- `src/data/matching-golden.ts` — the set: 29 jobs (synthetic,
  `example.invalid`), 6 segment profiles (backend EU, frontend LATAM, data APAC,
  devops EU, QA US, ML CIS), a 0–3 judgement legend.
- `scripts/eval-matching.ts` + `npm run eval:matching` (`--json`, `--verbose`).
- `tests/unit/matching-eval.test.ts` — 11 tests: formulas with hand-computed
  values, the validity of fixture contracts (`isJobSnapshot`,
  `parseManualProfileInput`), labelling completeness, guards, determinism, a
  control "bad" ranker, ratchet thresholds.

## Measured baseline (2026-09-27, 6 profiles)

| profile | shown | relevant | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|---|
| p-backend-eu | 24 | 4 | 1.000 | 1.000 | 1.000 | 0.982 | 1.000 |
| p-frontend-latam | 20 | 2 | 1.000 | 1.000 | 0.855 | 0.875 | 1.000 |
| p-data-asia | 19 | 7 | 0.429 | 1.000 | 0.783 | 0.900 | 1.000 |
| p-devops-eu | 23 | 4 | 1.000 | 1.000 | 0.995 | 0.995 | 1.000 |
| p-qa-us | 23 | 1 | 1.000 | 1.000 | 1.000 | 0.939 | 1.000 |
| p-ru-ml | 20 | 6 | 0.500 | 1.000 | 0.818 | 0.906 | 1.000 |
| **aggregate** | | | **0.821** | **1.000** | **0.909** | **0.933** | **1.000** |

The test's ratchet thresholds = these values (rounded down to 6 decimal places).
The control test: a deliberately bad ranker gives NDCG@10 0.269 against 0.933 —
the metrics are sensitive to degradation, not "green by construction".

## Protocol V0–V6

- **V0.** A separate task, the plan before the code, a minimal scope; the SP 1.0
  rules.
- **V1.** The formulas were verified against primary sources before writing code
  (references in the header of `eval-metrics.ts`). Item A1 of the research
  re-read: «Recall@k и NDCG@k как продуктовые метрики» ["Recall@k and NDCG@k as
  product metrics"] — confirmed. The stack constraints of ADR-001 untouched
  (pure TS, no DB, no network, no new dependencies).
- **V2.** Principles: the unknown/fail/pass semantics was not changed (the
  matching.ts tests without edits); the fixtures are synthetic and labelled; no
  personal data; AI is not called. Additionally the guard "relevant but hidden =
  0" pins the product invariant «заметно подходящее не скрывается молча»
  ["noticeably suitable is not silently hidden"].
- **V3.** `npm run check` → exit 0 (128/128 unit, biome 145 files, tsc);
  `npm run build` → exit 0; `npm run eval:matching` → exit 0. `npm run test:db`
  and `npm run test:e2e` — `not_run`: the schema, the queries, the UI and the
  API were not changed.
- **V4.** Golden cases: fixture contracts, labelling completeness, three gate
  states (j25 unknown contract → needs_review; j26 ambiguous time zone →
  needs_review; j27 mandatory office → needs_review; j18 zero skill intersection
  → needs_review, not hiding), plus a manual `--verbose` audit "through the
  candidate's eyes" over all six profiles.
- **V5.** Existing tests were not weakened and were not changed (diff: only
  `package.json` +1 line and new files); `guardrails` green; foreign files not
  touched. The lint pass caught duplicate keys from my own insertion of
  judgements — removed.
- **V6.** This file + a record in `IMPLEMENTATION_STATUS.md`.

## Repair cycles (2/2, recorded retroactively)

1. The first `npm run check` failed: 12 lint errors (duplicate j26/j27 keys from
   the insertion script) + a failure of the suite's own "control bad ranker"
   test. Hypothesis: the control's failure is not a defect of the metrics but a
   real bug in the runner (`rankJobs` was hard-wired into `evaluateProfile`, the
   injected ranker was not used). Confirmed: after the injection the control
   gives 0.269.
2. The second pass: strict TS errors in the new files (indexed access, type
   exports). Hypothesis: these are type checks, not logic; local `?? 0`/
   type-guard fixes close them without changing behavior. Confirmed: the metric
   values before and after matched to the last digit.

## Observations and follow-up (outside A1's scope)

1. **The skills extractor catches ordinary English words** (verified,
   reproducible): `extractSkills("We go fast and ship daily")` → `["Go"]`,
   `"Read the docs carefully"` → `["Technical Writing"]`, `"Strong BI mindset"`
   → `["Analytics"]`. It affects ranking and SKILL-01. A candidate for A3
   (alias disambiguation) — an owner decision on priority.
2. **Keyword traps** (j28 "Technical Recruiter", j29 "Data Science Instructor")
   are deliberately stuffed with Python/SQL/ML and reach the top of the v0
   ranker's feed while judged 0. This is a coded weakness from research part 1
   §10; fixed by A2 (requirement decomposition) and A3.
3. **Role by substring**: the boost for "frontend developer" does not fire on
   "Frontend Engineer" and wrongly fires on "Angular Frontend Developer" —
   visible in the NDCG@5 of the p-frontend-latam profile (0.855).
4. **Russian-language skills**: «машинное обучение» ["machine learning"] in j21
   is not extracted (the dictionary has English-only aliases) — A3.
5. **`showNeedsReview` is stored but not applied on any read path** (the
   `/matched` page renders both tabs without checking the flag). A product
   behavior question — an owner decision, not an unauthorized edit.
6. The R@10 and MRR thresholds are saturated (1.000 for all profiles) because
   the pools are small; the sensitive ones today are NDCG@5/@10 and R@5. As the
   set grows (A2+) the thresholds rise; lowering them is not allowed.

## Risk and rollback

Ordinary risk: additive files, product behavior unchanged. Rollback — delete the
new files and the script line from `package.json` (the branch is not merged).
