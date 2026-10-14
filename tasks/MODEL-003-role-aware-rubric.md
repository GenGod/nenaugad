# MODEL-003 — a scoring rubric that judges role fit before skill overlap

**Status: measured 2026-10-14 — no-go by the criteria fixed before measuring.** The role
check fixes the keyword traps wherever they bit and raises Spearman on four of six
profiles, but it rejects neighbouring and even same roles (a "Backend Developer (Go)" for a
backend developer), which costs one held-out profile 0.085 of Spearman, and it cannot see
the internship job graded 0 for a contract the candidate does not take. Basis: [MODEL-002](MODEL-002-gpu-spike.md)'s result —
on the GPU an 8B model answers the shipped rubric with valid JSON 39/39 in about 3.5 s,
but scores the golden set's two keyword traps (`golden-j28` Technical Recruiter,
`golden-j29` Data Science Instructor; grade 0 for every profile) at 75–85, because the
rubric asks for skill overlap and never asks whether the job is one of the candidate's
roles. The owner chose this as the next task on 2026-10-14 ("do 1st task").

**Goal.** Measure whether a rubric that first judges the job's role against the target
roles fixes the traps without harming the ranking, with Qwen3-VL-8B-Instruct (MODEL-002's
better model) on the same runtime. A measurement: nothing in `src/` changes; adopting a
rubric is a later decision.

## Protocol (fixed before measuring)

SP 1.0 §11: examples used to tune a prompt are kept apart from those that judge it.

- **Development profile:** p-ru-ml (39 pairs; where the traps were seen). At most **3
  rubric variants** are tried on it; one is chosen by its numbers there.
- **Held-out profiles:** p-backend-eu, p-frontend-latam, p-data-asia, p-devops-eu, p-qa-us
  (39 pairs each). The chosen variant runs on them **once**, with no edit afterwards.
- **Baseline:** the shipped rubric on all six profiles, the same runtime and settings.
- **Generic wording only:** a variant may say that a job naming the candidate's skills
  can still hire for a different kind of work; it may not name the traps' roles
  (recruiting, teaching) or any job of the set.
- **Settings:** llama.cpp b11457, Qwen3-VL-8B-Instruct Q4_K_M, every layer on the GPU,
  context 4096, greedy decoding, seed 42; the shipped answer parser.

**Go for the chosen variant** (set by the implementer before measuring; MODEL-002's owner
thresholds where they apply):
1. Development profile: valid JSON 39/39, Spearman ≥ 0.6, no grade-0 job at 50+, median
   ≤ 15 s per pair (MODEL-002's thresholds).
2. Every held-out profile: valid JSON 39/39, no grade-0 job at 50+, median ≤ 15 s, and
   Spearman no more than 0.05 below that profile's shipped baseline (the trap fix must not
   cost ranking). The held-out Spearman values are reported against 0.6 but not gated by
   it: grade 1 includes jobs blocked by the candidate's own hard conditions (salary,
   geography), which no rubric that sees only roles and skills can know.

**A known limit of the evidence:** the two traps are the same jobs in every profile, so
the held-out profiles test regressions and the traps' transfer to other skill sets, not
unseen traps. New graded trap jobs would have to come from the owner (a human writes the
grades, A1).

## Plan

1. `scripts/eval-local-llm.ts`: `--profile=` (a golden-set profile) and `--rubric=`
   (`shipped` or a variant), for the llama-server transport; variants live in the script.
2. Baseline: shipped × 6 profiles.
3. Variants on p-ru-ml; choose one.
4. The chosen variant × 5 held-out profiles, once.
5. Report: per-profile table, the traps' scores, the conclusion, and what adopting it would
   mean.

**Risk: normal** (a measurement; scripts only). **Data:** synthetic golden set. No
provider call, no spend.

**Rollback:** `git revert`.

## Result (2026-10-14)

Runtime and settings as fixed above (llama.cpp b11457, Qwen3-VL-8B-Instruct Q4_K_M, every
layer on the GPU, greedy, seed 42); the server stopped after the runs. The baseline
reproduces MODEL-002 exactly (p-ru-ml 0.614, the same scores), so the runs are
deterministic.

### Development profile (p-ru-ml): two variants, role-first chosen

| Rubric | Valid | Spearman | Grade-0 at 50+ | Traps j28 / j29 | Median s | `role_match` false by grade 0/1/2/3 |
|---|---|---|---|---|---|---|
| shipped | 39/39 | 0.614 | 2 | 75 / 85 | 3.7 | — |
| role-gate | 39/39 | 0.746 | none | 20 / 20 | 3.8 | 5/5 · 26/26 · 2/5 · 0/3 |
| **role-first** | 39/39 | **0.763** | none | 20 / 20 | 3.8 | 5/5 · 26/26 · 3/5 · 0/3 |

Both meet the development criteria; role-first was chosen by its Spearman. No third
variant was tried.

### Held-out profiles: role-first once, against the shipped baseline

| Profile | Spearman shipped → role-first | Grade-0 at 50+ (role-first) | Traps j28 / j29 | Median s | Criteria |
|---|---|---|---|---|---|
| p-data-asia | 0.716 → **0.861** | none (was j28 85, j29 85) | 85/85 → 20/20 | 3.8 | ✓ |
| p-devops-eu | 0.705 → 0.770 | none | 20/20 → 0/0 | 3.7 | ✓ |
| p-qa-us | 0.455 → 0.555 | none | 30/30 → 0/20 | 3.8 | ✓ |
| p-frontend-latam | 0.307 → 0.359 | **j24 95** (unchanged) | 0/20 → 0/0 | 3.4 | ✗ |
| p-backend-eu | 0.684 → **0.599** (−0.085) | none | 20/30 → 0/20 | 3.8 | ✗ |

Valid JSON 39/39 on every run.

### What the numbers mean

- **The traps are fixed** on both profiles whose skills they use (p-ru-ml 75/85 → 20/20,
  p-data-asia 85/85 → 20/20), with generic wording that names no job.
- **The cap is blunt.** "Not a role match → at most 20" puts a good neighbouring role at
  the trap's level: for p-ru-ml three grade-2 Data Engineer jobs (`j09`, `j25`, `j32`)
  fall from 75–95 to 20; for p-backend-eu the grade-3 and grade-2 Senior Data Engineer
  jobs (`j34`, `j33`) fall to 20.
- **The role check also errs.** For p-backend-eu (target roles "backend developer,
  node.js developer") the model rejected `j02` "Backend Developer (Go)", a grade-2 job:
  "The job is explicitly for a Go backend developer, while the candidate's target roles
  are Node.js backend development." It judged the stack, not the role.
- **`j24` is not a relevance miss.** "Frontend Engineering Intern" is graded 0 because no
  profile takes an internship contract (its note: "blocked by contract preference for
  every profile"). A rubric that sees roles and skills cannot know it; the deterministic
  contract rule is what should exclude it (SP 1.0 §2: compatibility is separate from
  relevance). The golden grades mix the two ("1 … or blocked by own hard conditions"),
  which also caps how high any relevance score can correlate with them. The criterion was
  fixed before measuring and is not relaxed here; it is reported as what it is.

### Conclusion

**No-go for adopting role-first.** It fails two of five held-out profiles (a ranking
regression beyond the 0.05 tolerance on p-backend-eu; `j24` on p-frontend-latam). Nothing
in `src/` changed; scoring stays closed.

**The held-out profiles are now spent** for rubric design: a next variant tuned after
seeing these numbers would be judged on data it was shaped by. Before another variant:

1. **Fresh graded data from the owner** (A1: a human writes the grades): a handful of new
   jobs per profile — keyword traps of other kinds, neighbouring roles, and the same role
   on another stack — as a new held-out set.
2. **A relevance-only reading of the grades:** judge the rubric on pairs not blocked by
   the candidate's hard conditions (or a separate relevance grade), since the rules, not
   the model, handle those.
3. **Then one variant with a three-level role judgment** (same role / neighbouring
   specialisation / different kind of work, capped differently), stating that the same
   role on another stack is the same role.

### Changed files

- `scripts/eval-local-llm.ts`: `--profile=` and `--rubric=` (the two variants and
  `role_match` in the report) for the llama-server transport.
- This file; `tasks/current.json`; `IMPLEMENTATION_STATUS.md`.

### Checks

The live measurement above (6 + 2 + 5 runs of 39 pairs). `npm run check` exit 0 (349 unit
tests; lint and typecheck include the script). Not run: `test:db`, `test:coverage`,
`build`, `test:e2e` (only the script changed since MODEL-002's full run). No provider
call, no spend, no download (MODEL-002's artifacts); coding-host spend not visible.

**Limitations.** One model; greedy decoding; one machine; 39 jobs shared by every
profile; the traps are the same two jobs everywhere; Spearman on 39 pairs moves by
several hundredths with one or two scores.

**Rollback:** `git revert` (scripts only).
