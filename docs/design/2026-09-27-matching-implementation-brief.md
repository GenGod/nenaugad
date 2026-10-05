# Brief for the next AI session: designing and implementing the job matching system

Date: 2026-09-27. Branch: `design/job-matching`.
Basis: [docs/research/2026-09-26-job-matching-research.md](../research/2026-09-26-job-matching-research.md)
(part 1 — top-10 methods, part 2 — non-obvious improvements; hereinafter "research").

## 1. How to use this document

1. Read first: `AGENTS.md`, `START_HERE.md`, `docs/ARCHITECTURE.md` (ADR-001),
   `docs/SAFETY_GATES.md`, research (in full), the current task `npm run task -- show`,
   and this brief in full.
2. Implement **strictly one registry item per task** through the SP 1.0 working loop
   (`npm run task -- ...`): short plan → minimal complete change → real
   checks → diff review. At most two repair cycles; record a new testable hypothesis
   via `npm run task -- repair "..."` BEFORE the cycle.
3. Every item goes through the **V0–V6 re-verification protocol** (section 4). Without it
   an item is not considered done — not with green tests, not with "works locally".
4. Statuses are honest: `implemented` ≠ `tested locally` ≠ `verified` ≠ `accepted`.
   Commands that were not run are marked `not_run`, never "passed".
5. Delegation: non-complex edits/tests/greps — to executor subagents
   (see `docs/PROMPT_EXECUTOR.md`); architecture, security, source-policy, money —
   only in the main session. All subagent output is reviewed by the main agent.
6. Do not commit without the owner's explicit word. Do not push, do not merge, do not deploy.

## 2. Project state as of 2026-09-27 (facts to start from)

This is NOT "day one": a significant part of the cascade already exists. Before
designing any item, read the listed files — they are the source of truth,
not this brief.

**Already implemented:**
- Auth (next-auth@4.24.15, scrypt), versioned profiles, ownership discipline 401/404.
- Deterministic eligibility-gate engine `src/domain/matching.ts`: rules GEO-01,
  CONTRACT-01, REMOTE-01, SAL-01, TIME-01, SKILL-01; outcomes
  `pass/fail/unknown/not_applicable`, reason codes, AND-within-option/OR-between-options;
  job-level fail caps the final status. This is the "hard filters with
  three-valued logic" from research (method 2) — **do not re-implement, extend**.
- Skills dictionary `src/domain/skills.ts` (aliases, categories; SKILL-01 —
  count-based ≥2, category-aware).
- Hiding with fixed reasons (migration 0008 `hidden_jobs`), application marking,
  return to the feed — `src/server/feedback-service.ts`, `src/domain/feedback.ts`.
- Two import sources: himalayas (approved+enabled) and jobicy (approved,
  enabled=true, policy v2, activated by the owner on 2026-09-25 after S1-003;
  beyond them — synthetic atlas-fixtures, not an import source),
  the import pipeline with idempotency (`src/server/import/pipeline.ts`),
  closure-checks with a HEAD budget, quarantine-guard, "soft/hard closure"
  (`src/server/import/closure-checks.ts`).
- CV intake: text extraction txt/md/docx without network, fail-closed limits,
  minimization (`src/server/cv/`); "nothing is output automatically" — the
  `draft ≠ факт` principle is already established.
- Letters: S4-001/002/003 (private CRUD, versions, validator, general-mode).
- AI infrastructure: `src/server/ai/` (gateway, provider, openai-transport,
  openai-batch, batch-queue-service, spending, disabled.ts), budgets (`npm run seed:budgets`, task
  AI-001), transport gates. There is one owner-approved purpose today — `cover_letter`
  (AI-002); the whitelist `approvedPurposes` (`provider.ts`) is not enforced by the gateway
  (dead code). Synchronous calls go through `executeGuardedOperation`, but the path
  OpenAI Batch in `/api/v1/relevance` goes to the provider directly, bypassing the gateway —
  without budget reservation. This is a known hole; closing it is part 1 of C0
  (section 6), owner decision #10. Do not add new calls bypassing the contour.
- Design system 1.3 (`--ng-*` tokens, icons, showcase screens) — accepted and
  merged into main (DS-001). New UI elements appear only in Atlas/Nenaugad 1.3.
- Tests: unit (117+), integration on a separate test DB (`npm run test:db`),
  e2e Playwright 93 scenarios, screenshot baselines.

**What already exists beyond the eligibility gate (important for A9 and C2):** LLM relevance
scoring is already implemented — `src/server/relevance-service.ts` + `/api/v1/relevance`
(synchronous and OpenAI Batch modes; cache `job_relevance_scores`, migration 0011).
This is NOT a ranker: `matching-service.ts` does not use these scores in the feed; the cache
key `(user_id, snapshot_id, profile_version)` without `prompt_version`/`job_version`;
`model_id` is hardcoded in the route instead of the provider constant. C2 absorbs the
subsystem, does not duplicate it.

**What is missing (the holes this brief closes):** search retrieval is weak
(substring search), there is no score ranking in the pull feed (see above),
there is no cross-source deduplication, impression/click/propensity events are not collected,
there are no push/alerts, no eval set, no embeddings/rerank.

## 3. Invariant principles (verify V2 in every item)

- Eligibility ≠ relevance; unknown ≠ fail and ≠ pass; "not specified" is shown with
  a mark, there is no silent dropping.
- Remote is not "the whole world": the intersection of the employer's hiring zones and the candidate's regions.
- No auto-apply; nothing is sent to external parties on the candidate's behalf.
- Profiles/CV/signals are private by default; minimization; deletion deletes derivatives.
- Sources: only purpose-specific approval (rights matrices, terms_hash, retention).
- Real AI is not enabled by a flag: ownership, approved provider/purpose, atomic budget
  reservation, quotas, persistent counters, deadline, uncertain billing,
  cancellation, commit-time revalidation — all through the existing `src/server/ai`.
- No fake data: mocks only with explicit synthetic marking.
- ADR-001: no separate vector DB service, queues, model router, new API layer.
  Postgres remains the only storage; new dependencies are owner decisions.
- Guardrails: extending the import/transport allowlist is an explicit review, not a bypass.

## 4. Mandatory re-verification protocol V0–V6 (applies to every item)

- **V0. Task and hypothesis.** The item is formalized as a task (`npm run task -- start`),
  the short plan is written before the code. The scope is minimal: one item = one task.
- **V1. Research re-verification.** Before designing, re-read the research section
  for this item AND the key primary sources from its card (arXiv/documentation).
  Confirm: (a) the claim about the benefit really is in the source, (b) the approach
  is applicable to the current code (does not duplicate `matching.ts`/`relevance-service.ts`),
  (c) the ADR-001 stack constraints are not violated. If any of this does not add up —
  STOP: record a new hypothesis via repair, do not improvise.
- **V2. Principles.** Run the section 3 checklist; for each affected principle —
  an automated test fixing the behavior (for example: an unknown salary is not
  guessed; another user's signals are not visible to a different user).
- **V3. Automated checks.** `npm run check` (unit+biome+tsc) — mandatory; `npm run
  test:db` — if the schema/queries changed; `npm run build` — always; `npm run
  test:e2e` — if UI/API changed. All exit codes and numbers — in the report.
- **V4. Golden cases.** Fixture scenarios from section 5 (the common list below) +
  item-specific ones — as executable tests, not as manual habits.
- **V5. Anti-regression and diff review.** No existing test weakened;
  `npm run guardrails` green; unrelated changes untouched; the diff reviewed
  by the main agent in full.
- **V6. Report.** An entry in `IMPLEMENTATION_STATUS.md` per the Handoff rules: result,
  files, commands + exit codes, checks not performed (not_run), mock/live,
  costs (unknown if invisible), limitations, rollback, next small step.

**Golden cases (common list; registry items add their own):**
1. A vacancy without remote zones specified → status unknown, shown with the mark
   "not specified", does not fall into "guaranteed suitable", not silently filtered out.
2. Salary "competitive"/absent → unknown; neither the rule nor the LLM guesses it.
3. "js" in the profile matches "JavaScript" in the vacancy (and vice versa) via the dictionary.
4. An uncovered must-have → the outcome is not `pass`; the explanation is "X is missing".
5. An uncovered nice-to-have → does not spoil the pass outcome.
6. A cross-source duplicate → one canonical object, provenance preserved.
7. A closed vacancy is excluded from search, the catalog and the alerts being sent.
8. Determinism of phase A: identical input → a byte-for-byte identical feed.
9. User B sees no artifacts (feed, alerts, explanations, logs,
   digests) derived from user A's data.
10. Any AI call — including the existing job_matching path and the new purposes
    of phase C — outside the approved purpose/budget → fail-closed refusal (today
    the batch path violates this condition — see C0).
11. An empty feed is honest: "nothing found" ≠ hiding by a broken filter.

## 5. Architectural frame

```
Ingest (pipeline.ts) → skill normalization (skills.ts) → dedup [A4/B5]
  → freshness fields [A5] → (C1: LLM extraction)
Profile (candidate_profiles + skills) → (C1: LLM extraction from CV, draft ≠ fact)
Pull feed: matching.ts (eligibility gate) → retrieval [A3→B2] → rerank [B3]
  → EV multipliers [A10/B6] → explanation [template; C2 optional]
Push: job→profiles on ingest [A7] → digest/alerts (status filter at send time)
Background: events+propensities [A8] → eval [A1/C6] → later D1/D2
```

**Open decision on vectors (owner, before B1):** ADR-001 forbids a separate
vector DB, but pgvector is an extension in the existing Postgres (changing the Docker image is
a modification of `compose.yaml` that the executor cannot touch). The alternative
without extensions: `float8[]` + cosine in SQL/Node — with a catalog of ≤ a few thousand
vacancies this is enough. Both options are permissible; the choice is a V1 check of the catalog
volume + an owner decision.

---

## 6. Registry of approaches

Coverage marks: ✅ already present · 🟡 partial · ❌ absent.
Each card: source in research → dependencies → what to design →
implementation → mandatory verification beyond V0–V6 → owner decisions.

### Phase A — deterministic (no new models or AI; can start today)

#### A1. Golden set + eval harness (Recall@k / NDCG@10)
- Research: part 1 "Datasets, benchmarks, metrics"; part 2 D3/D4.
- Coverage: ❌ (behavioral e2e exist, ranking is not measured).
- Dependencies: none. **Do it first — without it the remaining items are not measurable.**
- Design: a fixture file "profile → expected order/set of relevant
  vacancies" (100–200 pairs across segments: grades, stacks, timezones, languages);
  a harness script computing Recall@k, NDCG@10, MRR over the actual order of the
  pull feed (matching-flow; the LLM score from `relevance-service` is not
  integrated into the feed — see section 2); the first run fixes the baseline of the current
  feed as a versionable artifact, A5/A10/B2/B3/C2 are compared against it;
  the degradation threshold as a failing test.
- Verification beyond V0–V6: (V4) the golden run is stable — a repeated run gives the
  same numbers; (V1) verify the NDCG/RRF formulas against the source (Stanford IR book /
  sbert.net) before writing code; (V2) the fixtures are synthetic, marked.
- Owner decisions: whether to include the harness in `npm run check` right away or as a separate script.

#### A2. Requirement decomposition: structural requirements + deterministic matching
- Research: part 2 A1 (the deterministic part; NLI/LLM — phases B/C).
- Coverage: 🟡 (rule-based eligibility gate exists; "a list of vacancy requirements with
  must/nice" as data — does not).
- Dependencies: A1.
- Design: the `requirements` schema of a snapshot (text, must/nice type, category,
  link to skill-ID, nullable fields with unknown) without LLM — for live sources the fields
  are derived from the available structured data, for fixtures — by hand; matching
  "requirement → evidence in the profile" (skill-ID, grade, experience), aggregation:
  must-uncovered ≠ eligibility-gate fail (this is the relevance layer!), but it drives
  the explanation and the rank bonus.
- Verification beyond V0–V6: (V4) golden 4–5; (V2) decomposition does not substitute for
  eligibility — the test "a vacancy with an uncovered must-have and unknown geography stays
  unknown by the eligibility gate, not fail"; (V3) test:db when the snapshot schema changes.
- Risk: do not break the `job_snapshots` contract (CHECK constraints, migration 0004) —
  schema changes only via a new migration (the latest is 0013, the next is 0014;
  verify against the `migrations/` directory before creating it).

#### A3. Skill normalization: developing the dictionary
- Research: part 1 method 1; part 2 A3 (the instructional part — later).
- Coverage: 🟡 (`skills.ts` exists: aliases + categories).
- Dependencies: A2.
- Design: the dictionary as versionable data (not code), deltas via a
  migration/seed; normalization on ingest and on profile input (one function);
  a coverage metric (the share of non-normalized tokens in the catalog) in the report
  of the A1 harness.
- Verification: (V4) golden 3; a test matrix of aliases js/JavaScript/ECMAScript,
  k8s/Kubernetes; (V1) choosing a subset of ESCO as a replenishment source — verify
  the license and format at esco.ec.europa.eu (this is a source re-verification, record the date).
- Owner decisions: connecting ESCO data (this is external content — as a "source"
  without public display; formalize explicitly).

#### A4. Cross-source deduplication (exact keys)
- Research: part 1 "deduplication" in the aspects; part 2 D2 (the embedding part — B5).
- Coverage: ❌ (dedup only by ID within a source).
- Dependencies: A3 (normalization of title/company).
- Design: a normalized key (canonical company + title + location/
  worldwide); a table/fields of the canonical vacancy with an array of source_ids; choosing
  the primary by freshness and field completeness; the UI shows provenance without merging texts.
- Verification: (V4) golden 6; the test "one vacancy on himalayas and jobicy → one
  card, both backlinks preserved" (source attribution is a principle, the test is mandatory);
  (V2) merging does not rewrite provenance (see the closure-checks lesson: do not touch
  dates/provenance).

#### A5. Freshness: age fields and a signal in ranking/explanation
- Research: part 1 "Freshness and recency" (aspects); part 2 B6 (the model — later).
- Coverage: 🟡 (closure exists; age in ranking/explanation — does not).
- Dependencies: A1.
- Design (`first_seen_at` already exists in the pipeline — verify by code, not by the brief):
  a freshness boost as an explicit multiplier in `relevance-service`; "published N days
  ago" in the card and the explanation; no "new/old" bins instead of a continuous
  value.
- Verification: (V4) the test "two relevant vacancies of different age → the fresh one is higher
  all else being equal"; (V2) age is taken from `first_seen_at`, not from the declared
  `posted_at` (anti-gaming of the source).

#### A6. Seen-set and negative preferences (weighted)
- Research: part 2 C1, C2.
- Coverage: 🟡 (explicit hiding with reasons exists; "saw, did not click", return on
  change, weighted demotion — do not).
- Dependencies: A1, A8 (impression events).
- Design: a per-user impression registry; rules: an explicit dismiss — forever;
  seen-no-action — TTL 7–14 days, return only if the vacancy changed (content-hash
  or version+1 from pipeline.ts); weighted demotion of the neighborhood of what was hidden
  (embeddings are not needed: category/company/skills from the dictionary). Structural
  filters "do not show company X" — only through the existing clarifying
  hide UX (extending reason codes is an owner decision).
- Verification: (V4) tests: a dismissed one does not return; the seen-TTL returns it after
  a change, not earlier; (V2) golden 9 — one user's signals do not affect
  another's feed (an integration test with two users).

#### A7. Push matching: alerts/digest (deterministic)
- Research: part 2 D1.
- Coverage: ❌.
- Dependencies: A1, A5, A4 (dedup before alerts).
- Design: on ingest/update of a vacancy — offline scoring against active
  profiles (the same eligibility gate + relevance); a candidate-set table; digest generation
  "new since the last visit"; at send time — filtering by vacancy status (closed
  ones are never sent); a frequency cap.
- Verification: (V4) golden 7; the test "closure between scoring and sending → the vacancy
  is excluded at send time"; (V2) the letter/digest does not leave the local contour without an
  owner decision (send_email in the source matrices — denied; therefore the MVP is only a
  "what's new" page, not email). Record this limitation explicitly.
- Owner decisions: the delivery channel (in-app for now; email — a separate task).

#### A8. Event journal + propensities
- Research: part 1 "Feedback loop" (aspects); part 2 D6.
- Coverage: 🟡 (save/hide/apply-marking exists; impression/click/dwell and propensity — do not).
- Dependencies: A1.
- Design: an events table (impression/click/save/hide/apply-marking,
  timestamp, position in the feed, normalized impression score = propensity, ranker
  version); privacy: events belong to the user, are deleted with the profile;
  no reads of events in the UI without an explicit function.
- Verification: (V2) golden 9; the event retention policy is consistent with minimization
  (owner decision: the retention period); (V3) test:db.

#### A9. Ranker infrastructure: shadow mode and per-request guardrails
- Research: part 2 D7/D10.
- Coverage: ❌.
- Dependencies: A1.
- Design: a ranker-version interface (id, function) — introduced from scratch:
  there is no score ranker in the feed today (section 2), the reference point is the A1
  baseline; a shadow run of a new version on the same inputs with diff logging; guardrails
  on every request: the share of empty
  feeds, the share of closed/duplicates in the top-10, p95 latency, the share of records outside approved
  sources — with thresholds as failing tests.
- Verification: (V4) the test "a new ranker with threshold degradation is caught by the guardrail";
  the shadow run does not affect the user feed (test).

#### A10. Phase 1 EV multipliers (fixed)
- Research: part 2 B1/B3 (phase 1); arXiv:2106.01941.
- Coverage: ❌.
- Dependencies: A1, A5, A9 (guardrails before changing the ranker).
- Design: the final order = relevance × m_ghost × m_urgency, where m_ghost is a
  rough multiplier from closure statuses (quarantined/soft-closed down), m_urgency —
  from age. The multipliers are constants with an explanation in the code and in the UI
  explanation.
- Verification: (V4) tests: a quarantined vacancy is not in the top at equal relevance;
  the explanation "demoted: possibly inactive" is shown; (V2) demotion is not hiding;
  (V5) the golden set of A1 has not degraded below the threshold.

### Phase B — local models (embeddings/NLI; not generative; owner decisions on dependencies)

#### B1. Embedding contract + dense retrieval + model-swap playbook
- Research: part 1 method 4; part 2 A3 (the instructional model), D8 (playbook).
- Coverage: ❌.
- Dependencies: A1; owner decision on vectors (section 5) and the model.
- Design: the contract: model+version+instruction template (resume query vs
  job document — the asymmetry is fixed in the code as the embedding contract, part 2 A3);
  vector storage with `model_version`; recomputation when content changes; playbook:
  shadow column/table → dual-write → frozen eval A1 → ANN recall check
  (if ANN) → switchover → rollback window; mixing versions in one query is forbidden.
- Verification: (V4) the test "changing model_version without reindexing → fail-closed
  (the query is not executed with mixed versions)"; (V2) the profile embedding is a
  derivative of personal data: deleted with the profile (integration test);
  (V3) test:db.
- Owner decisions: the pgvector extension + changing the compose image (or the float8[] path);
  the model: local (a new dependency → guardrails allowlist review) vs API via the
  existing openai-transport (money, purpose in the matrix). MRL compatibility
  (Matryoshka, part 2 A5) is a selection criterion.

#### B2. Full-fledged BM25 + RRF fusion
- Research: part 1 methods 3 and 5.
- Coverage: 🟡 (substring search of the catalog).
- Dependencies: A1, B1.
- Design: BM25 over normalized text (tsvector GIN or ParadeDB
  `pg_search` — both require an owner decision on extensions; the no-extensions variant —
  BM25 in Node over the catalog, acceptable with a small catalog, fix the breaking-point
  threshold); RRF k≈60 over positions; an eligibility-gate pre-filter before fusion; calibration of k on A1.
- Verification: (V4) a test matrix on synonyms: "ML developer" is found by the dense
  leg in the absence of an exact occurrence; "C#" — by the BM25 leg; RRF lifts the document
  that won in one leg; (V1) the formulas are verified against the source.
- Owner decisions: the extension, if needed.

#### B3. Cross-encoder rerank of the top-K
- Research: part 1 method 6.
- Coverage: ❌.
- Dependencies: B1, B2, A9 (shadow before enabling).
- Design: rerank the top-50 after RRF; the bge-reranker-v2-m3 model locally or
  via API; a latency budget (p95 in the A9 guardrails); disableability (a flag; without it
  the system remains correct).
- Verification: (V4) golden A1: the rerank improves NDCG@10 or is not enabled; a test
  of output determinism with a fixed model; (V2) the rerank cannot lift an eligibility-gate
  fail/unknown — a layer-order invariant test.

#### B4. NLI contradiction pre-check (optional, owner decision)
- Research: part 2 A1 (the NLI part).
- Coverage: ❌.
- Dependencies: A2.
- Design: "requirement ↔ profile fragment" pairs → DeBERTa-mnli locally;
  the result: contradiction → a barrier in the explanation (not in the eligibility gate); neutral is not
  treated as a contradiction (honesty: "silent" negations are unreliable — this is
  documented in research).
- Verification: (V4) the test: "US citizenship required" + a profile without it →
  contradiction in the explanation; "Kubernetes required" + "5 years of Docker" → neutral, not
  contradiction; (V2) the NLI result never changes the eligibility status.
- Owner decisions: the new model dependency; can be deferred to C2 (LLM scoring
  covers the same).

#### B5. Cross-lingual deduplication (the embedding part)
- Research: part 2 D2.
- Coverage: ❌.
- Dependencies: A4, B1.
- Design: pairwise cosine of vacancy embeddings (O(n²) — acceptable up to
  thousands; fix the threshold for switching to LSH later); candidates > threshold → a queue for
  confirmation (LLM — C5; before it — a manual review list, not automatic merging).
- Verification: (V4) the test on a synthetic pair "one vacancy EN/RU" → a candidate for the
  queue; "two different roles at one company" → NOT a candidate (the threshold is insufficient —
  the failure of a pure threshold, known from research).

#### B6. Urgency/survival proxy model
- Research: part 2 B3.
- Coverage: 🟡 (closure heuristics exist; hazard/buckets — do not).
- Dependencies: A5, A10; closure-checks data.
- Design: buckets "published recently / a few weeks / long ago" from the
  observed age and closure statuses; the UI — only coarse buckets, never
  "N days left"; replacing m_urgency from A10 with a model estimate — behind the guardrails of A9.
- Verification: (V4) a test on a synthetic disappearance distribution: the buckets
  are monotone; (V2) do not scare the user with precision that does not exist (the wording
  is honest — a copy test).

### Phase C — generative LLM (strictly behind the existing AI boundaries)

**Phase precondition: C0.** Without it not a single C item starts.

#### C0. AI-boundaries revision: repairing the existing path + new purposes
- Part 1 — repairing the existing one (performed first; does not wait for phase C —
  owner decision #10): (a) enforce the whitelist: `isPurposeApproved`/
  `approvedPurposes` (`src/server/ai/provider.ts`) is checked by the gateway before
  dispatch instead of remaining dead code; (b) bring the OpenAI Batch path
  `/api/v1/relevance` (`submitBatch`/`checkBatch` in
  `src/server/ai/openai-batch.ts` go to the provider directly) behind
  `executeGuardedOperation` (worst-case reservation, ai_operations,
  counters, deadline, uncertain billing) or disable it until it is brought behind; (c)
  validate the custom_id → snapshot_id mapping on the server — right now it comes
  from the request body, and `persistBatchResults` writes scores for any snapshot_ids;
  (d) idempotency without `Date.now()` in the key; (e) an honest totalCost from
  settled. Today's batch path fails golden 10 — this is the initial
  state, not the target one.
- Part 2 — new purposes: extending `TaskType` (`src/server/ai/spending.ts`)
  and `approvedPurposes` (`provider.ts`) with "matching-scoring", "extraction",
  "hyde", "dedup-confirm", "eval-judge" — each approved separately by the owner.
  `job_matching`, `job_extraction`, `cv_extraction` already exist as TaskType —
  extend the existing, do not build a parallel "purposes matrix" (no such
  mechanism exists in the code). Confirm by code (not from memory) that ownership,
  atomic budget reservation, persistent counters, deadline, uncertain billing,
  cancellation, commit-time revalidation cover the calls (see AI-001,
  `docs/SAFETY_GATES.md`); tests for each property.
- Verification: (V2) golden 10 — including the EXISTING job_matching path, and not
  only the new purposes; (V5) the existing letter safety tests are not weakened.

#### C1. LLM field extraction (vacancy ingest; CV — only on an explicit action)
- Research: part 1 method 1; lessons of part 2 A1 (hallucination of unknown fields).
- Coverage: ❌.
- Dependencies: C0, A2 (the schema), A3.
- Design: the JSON schema = the A2 requirements schema; a system rule: a field absent
  from the text → `unknown`, the model is instructed not to invent, the validator
  rejects fabricated values; the prompt and model version in the record's provenance;
  for CV — repeat the letters contour (draft ≠ fact, manual confirmation).
- Verification: (V4) tests: a vacancy without salary → unknown (not null-guessing);
  the model returned a salary when it is absent from the text → the record is rejected by the validator;
  (V2) vacancy data is not sent to the provider without an approved purpose;
  unknown sources do not pass.

#### C2. LLM scoring of the top-K: rubric + structured output (decomposition)
- Research: part 1 method 7; part 2 A1 (the core of round 2).
- Coverage: 🟡 (a primitive LLM scoring already exists — `relevance-service.ts`,
  `/api/v1/relevance`, cache `job_relevance_scores`; see section 2).
- Dependencies: C0, C1, B1–B3 (the cascade limits the cost), A9 (shadow enablement),
  owner decision #11 (the fate of the existing subsystem).
- Design: absorption of the existing subsystem, not duplication: the cache key
  is extended to (profile_version, job_version, prompt_version); model_id from the
  provider config (right now the hardcode "gpt-6-luna" in the route); changes to the table
  `job_relevance_scores` via a separate migration. The input is only normalized
  fields (not the raw CV); the rubric prompt: per-requirement verdict pass/unknown/missed +
  an evidence quote + missing_skills; temperature=0, schema validation, a repeated
  check at commit; the UI explanation is built from the fields, not from the model's free
  text; cache by (profile_version, job_version, prompt_version).
- Verification: (V4) tests: a fabricated skill in the response → rejected by the validator
  (grounding on the extracted fields); an unknown requirement does not turn into pass;
  (V2) ownership: scoring is launched only for one's own profile (integration test);
  the top-K limit is a per-user quota (a persistent counter).

#### C3. HyDE: a hypothetical vacancy from the profile, cache per version
- Research: part 2 A2; arXiv:2212.10496.
- Coverage: ❌.
- Dependencies: C0, B1 (vector storage), C1-like boundaries.
- Design: generation of an "ideal vacancy" on profile change (cache by
  profile_version), its embedding — a third RRF signal; a hybrid with BM25 over the real
  text is mandatory (research: HyDE hallucinations are smoothed out by the hybrid).
- Verification: (V4) the test: regeneration on version change, no call on a
  repeated search without changes; (V2) the hypothetical text is never shown
  to the user as a vacancy (it is an internal artifact — a UI-absence test).

#### C4. Doc2query catalog expansion on ingest
- Research: part 2 A4.
- Coverage: ❌.
- Dependencies: C0, B1.
- Design: offline, on ingest, budgeted (the batch contour already exists —
  `src/server/ai/batch-queue-service.ts`); the expansions are internal fields, not shown
  as vacancy text; the index ×3 — estimate the volume before enabling.
- Verification: (V2) attribution and the publish_full_text prohibition of the source matrices are not
  violated: the expansions are stored and used for search, not published
  (a test on the API response); budget limits are respected.

#### C5. LLM dedup confirmation
- Research: part 2 D2.
- Dependencies: C0, B5.
- Verification: (V4) the "yes/no same vacancy" pair is deterministic (temperature 0),
  the response is logged with provenance; (V2) automatic merging only upon
  confirmation, disputed ones — to a human queue.

#### C6. LLM-judge as a third eval signal
- Research: part 2 D4.
- Dependencies: A1 (the gold set is mandatory and primary), C0.
- Design: a protocol against the biases from research (12 biases): pointwise rubric,
  swap-consistency (averaging over orders), a jury from a different model family than
  the implementation; the jury — only in the A1 eval harness, never in the production feed.
- Verification: (V4) a protocol test: swapping the order does not change the verdict by more than
  the tolerance; (V2) the jury calls do not see real users' personal data —
  only the synthetic data of the golden set.

### Phase D — as data and traffic accumulate (each is a separate owner decision)

- **D1. LTR (lambdarank)** on A8 events: research part 1 method 8. Precondition:
  accumulated events, guardrails, golden A1. Not before the events cover months.
- **D2. Feedback personalization + Rocchio + MMR/quotas**: research part 1 method 10, part 2 A5.
  Rocchio — one formula over the B1 vectors; MMR λ≈0.7 on the top-k; per-company quotas.
- **D3. Skill graph / adjacent roles**: research part 1 method 9. Co-occurrence over the
  catalog + the A3 dictionary; slots with the explanation "matched via the adjacent skill X".
- **D4. Experimental slots: stretch match (gap ≤2 skills) and adjacent roles**:
  research part 2 C3/C4. Marked slots, measurement via hides/saves (not clicks),
  interference with the main rank — only after measurements.
- **D5. p(response) and the bilateral principle**: research part 2 B1/B4. Self-reported outcomes
  ("did they reply within 2 weeks?") — a private survey, a separate owner decision; score =
  min(fits, would-probably-admit) as the aggregation principle.
- **D6. Team-draft interleaving** for click comparisons: research part 2 D5. Only
  paired click metrics; not for application conversion.
- **D7. OPE + percentage canary**: research part 2 D6/D10. Precondition: A8 propensities
  accumulate from day one (check during the A8 revision: the field exists even if OPE is not
  used).
- **D8. Synthetic hard negatives for fine-tuning**: research part 2 A5. Only with explicit
  synthetic marking; mixing with in-domain catalog samples.

### Rejected approaches — do not implement without a new owner decision and a V1 cycle

SPLADE/learned sparse (no inverted index in the Postgres stack); ColBERT/late interaction
(no multi-vector in pgvector, storage ×10–100, the niche is covered by B3); generative
retrieval/semantic IDs (breaks on a changing catalog); daily/weekly response
timing (the evidence is weak, devalued by timezones); full bilateral GNN
(no logs from both sides); a separate vector DB, Redis/queues, model router, external
rerank service (ADR-001).

## 7. Consolidated list of owner decisions (collect in advance)

1. Vectors: pgvector (changing the compose image — an edit to `compose.yaml`) or float8[]+
   cosine; the criterion is the catalog volume, a V1 check.
2. Embedding model: local (a new dependency + guardrails allowlist review) or
   API via the existing transport (purpose in the matrix, money). The selection criteria
   include MRL compatibility and multilingualism (RU/EN).
3. Reranker: local bge-reranker or API; the latency budget.
4. NLI (B4): a separate model now or coverage by C2 means.
5. ESCO data for replenishing the dictionary (A3) — as external content.
6. Extending the hide reason codes (A6) and the AI purposes matrix (C0).
7. Alert channel: in-app for now, email — a separate task (send_email denied in the matrices).
8. Retention of the event journal (A8).
9. Committing the research doc and this brief (both are currently uncommitted).
10. The fate of the existing job_matching AI path (part 1 C0): bringing the batch mode
    behind the gateway or disabling it until repair; whether to approve the `job_matching`
    purpose (today only `cover_letter` is approved, AI-002).
11. The fate of the existing LLM relevance subsystem (`/api/v1/relevance`, cache
    `job_relevance_scores`): absorption into C2 or switching it off until C2.

## 8. Order of work (a recommendation, not a replacement for the owner decision)

A1 → A2 → A3 → A4 → A5 → A8 → A6 → A7 → A9 → A10 → (owner decisions) → B1 → B2 →
B3 → B5 → B6 → B4 → C0 → C1 → C2 → C3 → C4 → C5 → C6 → D-* as data accumulates.
Each step is a separate SP 1.0 task with the full V0–V6 protocol. Items of one phase
can be combined into a task only if together they are less than one substantive
step — by default do not combine. The repair part 1 of C0 is not "later, with phase C":
by owner decision (#10) it is performed ahead of schedule, before/in parallel with phase A —
the unprotected batch path spends real money when a key is present in the environment
and must not wait for phase C.

## 9. Honest limitations of this brief

- References to files (`relevance-service.ts`, schema details) are given per IMPLEMENTATION_STATUS
  and the repository structure; read the code before designing — record discrepancies
  in the task (this is V1 too).
- The research relies on web sources from 2026-09-26; individual numbers (the duplicate share
  50–80%, "~100x" interleaving) come from secondary sources and are marked there; for a
  "do/don't" decision rely on the direction of the effect, not on exact numbers.
- The brief does not override SP 1.0 and does not expand anyone's rights; a contradiction between the brief and
  AGENTS.md/ADR is resolved in favor of the latter, with the discrepancy recorded.
- Revision 2026-09-27 (a deep review against the code): jobicy fixed (enabled=true),
  the number of the next migration (0014), the existing LLM relevance subsystem
  and the unclosed batch bypass of the AI contour taken into account (part 1 C0; owner decisions #10–11).
