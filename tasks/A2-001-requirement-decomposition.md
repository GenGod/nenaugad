# A2-001 — job requirement decomposition (a deterministic layer)

**Result:** a job is decomposed into a list of individual requirements with a
verdict for each «profile ↔ requirement» pair (`covered` / `uncovered` /
`unknown`) and an honest reason wording, instead of one opaque similarity
number. The layer is deterministic (no model), lives next to the gates, but
does NOT affect the eligibility gate — and this is pinned by a test. Exactly
one new signal participates in ranking: the absence of evidence under a stated
must-have.

**Not included:** LLM extraction of must/nice by meaning and NLI contradiction
checking (that is C1/C2; the layer will replace the marker heuristic);
displaying requirements in the UI/API (the next small task); wiring the ranker
into the product read path of `/matched` (that is A10 together with the A9
shadow mode).

**Context:** [the brief](../docs/design/2026-09-27-matching-implementation-brief.md)
(item A2); [the research](../docs/research/2026-09-26-job-matching-research.md)
part 2 A1 (the core of round 2: «requirement decomposition + evidence»).

## What was added

- `src/domain/requirements.ts` — `normalizeRequirements` (the snapshot's
  explicit requirements take priority; otherwise a deterministic derivation
  from the text), `deriveRequirements` (dictionary skills per sentence +
  strength markers), `assessRequirements` (verdicts, missingSkills, coverage),
  the layer version `REQUIREMENT_LAYER_VERSION = "v1"`.
- `src/domain/match-ranker.ts` — ranker v1
  (`v1-status-skills-role-uncovered-must`): + a −15 penalty per uncovered
  must-have. `rankJobsBaselineV0` is kept as the callable A1 baseline for the
  relative ratchet.
- `src/domain/skills.ts` — `canonicalSkillName` added (alias → canonical name)
  for normalizing requirement values; the dictionary unchanged.
- `src/data/matching-golden.ts` — set v2: +3 jobs (j30 with a Kubernetes
  must-have, j31 with a covered Node.js must-have — the pair for measurement,
  j32 with the Russian marker «обязательно»), +18 grades.
- `tests/unit/requirements.test.ts` — 8 tests: marker structure (EN/RU),
  explicit-requirement priority, verdicts and wordings, an empty profile → only
  unknown, and two «requirements do not touch the gate» invariants.
- `tests/unit/matching-eval.test.ts` — the relative ratchet: the requirements
  layer cannot worsen any profile or the aggregate.

## Measurements (the v2 set, 6 profiles)

| metric | v0 equivalent (without requirements) | v1 (with requirements) |
|---|---|---|
| R@5 | 0.772817 | 0.772817 |
| R@10 | 0.955357 | 0.955357 |
| NDCG@5 | 0.901219 | **0.903879** |
| NDCG@10 | 0.921708 | **0.924056** |
| MRR | 1.000000 | 1.000000 |

The gain comes from the j30/j31 pair on the backend profile (NDCG@10 0.986 →
1.000: the job with an uncovered must-have goes below the job with a covered
one); no profile got worse — the test checks this, not the report.

## Protocol V0–V6

- **V0.** A separate task, minimal scope; the DB schema was not changed
  (requirements are already in the snapshot contract), so `test:db` was not
  needed.
- **V1.** Item A2 of the research re-read; confirmed that «decomposition +
  evidence» beats whole-text similarity and that decomposition is the only
  form that naturally expresses pass/fail/unknown. The NLI part is postponed to
  C1/C2 (noted in the research: NLI treats «quiet» negations unreliably).
- **V2.** Principles: unknown ≠ fail (an empty profile yields only unknown,
  never «uncovered»); eligibility unchanged — proven by a test on all 32×6
  pairs with a must-have injection; the wordings do not blame the candidate
  («в профиле не указан», not «у вас нет»); nothing goes to external parties,
  no AI called.
- **V3.** `npm run check` → exit 0 (137/137 unit, biome 147 files, tsc);
  `npm run build` → exit 0; `npm run eval:matching` → exit 0 (guards 0/0).
  `test:db` and `test:e2e` — `not_run`: the schema, queries, UI and API were
  not changed.
- **V4.** Golden cases: derivation (an EN heading, an RU heading, a phrase
  without a colon, a prosaic «requirements»), explicit-requirement priority,
  coverage assessment, an empty profile, the gate invariant on unspecified
  geography.
- **V5.** Existing tests not weakened; the thresholds recomputed **downward**
  once with a recorded reason (the set grew 29 → 32), and the irrevocable
  guarantee is now relative (v1 ≥ v0 per profile). `guardrails` green.
- **V6.** This file + an entry in `IMPLEMENTATION_STATUS.md`.

## Repair cycle (1/2, recorded retroactively)

Hypothesis: «the first version of the markers (any occurrence of the marker
word in a sentence) and the bonus for a covered must-have distort ranking;
after structural markers (the heading zone up to the colon, or an unambiguous
phrase) and dropping the coverage bonus, the layer will stop worsening the
metrics». Confirmed by measurement: the first version gave an aggregate
NDCG@10 of 0.8925 vs 0.9217 for v0 (the keyword trap «Technical Recruiter»
received 4 must-haves from the prosaic «job requirements» and rose into the top
of the data profile); after the fix — 0.9241 vs 0.9217, that is strictly
better. The first version's numbers are kept here as proof of the defect.

## Limitations and follow-up

1. The markers are a heuristic: negations («не требуется Kubernetes») are not
   parsed; synonyms of «обязательно/надо» outside the list are not caught.
   Replaced by C1 (LLM) and refined by A3.
2. Requirements are derived on every call; caching is task A10 (together with
   wiring the ranker into the product path).
3. A covered must-have deliberately gives no bonus (it would duplicate the
   skill intersection and was measured as an amplifier of keyword stuffing);
   if a positive contribution is needed later — only via measurement on a twin
   pair.
4. The set has no job with *unspecified* geography (the unknown path is checked
   by a test, not by a metric). A candidate for the next set: such a job would
   create an honest hard case for A10.
5. The UI does not show requirements — the data is ready (`missingSkills`,
   `rows`); a separate small task with visual tests is needed.

## Risk and rollback

Ordinary risk: product behavior unchanged (the ranker is so far used only by
the harness), no new dependencies. Rollback — restore `RANKER_VERSION` and the
weights, delete `requirements.ts` and the tests; the branch is not merged.
