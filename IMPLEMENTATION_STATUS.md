# Nenaugad — status (ex-Atlas Starter)

## Now

**Audit of existing functionality (2026-10-01): [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md)**
— an inventory of every open loose end with evidence. **All eight red flags of section A
(money and rights) are closed 2026-10-01** by tasks AI-004…AI-007: the purpose
`job_matching` is approved and checked by the gateway; `send_to_ai_provider` is granted
and has become checkable; the unguarded batch path is closed; idempotency is addressed
by content; the reservation is the upper bound again; `LIVE_AI_ENABLED` became a real
switch; the quota $1/month is provisioned at registration, the operation ceiling is
compared; `npm run ai:holds` resolves stuck holds; `REINDEX` was executed (0 unreachable
out of 2182, vectors 498/498). **Privacy (owner decision):** personal data stays inside
the contour — the structural boundary `personal-data-boundary.ts` closed scoring and
letters until a local model appears; nothing about the candidate goes to the provider
any more. **Closed by the audit:** the unapproved purpose — the owner approved
`job_matching` 2026-10-01, the whitelist became enforceable for the first time (the
gateway checks purpose before money, the spend bucket is derived from purpose):
[AI-004](tasks/AI-004-purpose-job-matching.md). `send_to_ai_provider` was granted to all
three sources and became checkable (`maySendTextToProvider` is asked in the four places
that send text outward): [AI-005](tasks/AI-005-provider-transfer-grant.md). **C0-part-1
is done** ([AI-006](tasks/AI-006-c0-part-1.md)): the unguarded batch path is closed (the
provider SDK is allowed only to the transport — statically, guardrails), idempotency is
addressed by content instead of `Date.now()`, cost is returned from settled, ledger
rejections no longer look like 500s, the reservation is again the request's upper bound.
**The price of closing: automatic background batch scoring is switched off** (the plan
for re-enabling it is in the task). The remainder of this batch: the monthly quota reset
(the window is stored but not reset) and the log of manual hold decisions
([AI-007](tasks/AI-007-owner-decisions-2026-10-01.md)); the full list of what is open —
[docs/OPEN_GAPS.md](docs/OPEN_GAPS.md).

**Decision batch No. 4 — follow-up (EDEC-002, 2026-10-02):** the owner's decisions are
recorded and executed: the filters «не показывать компанию» («do not show the company»)
— **kept as they are**; email — **stays in-app**; the AI-analysis buttons («AI-анализ
всех» and «AI-рейтинг» on the card) **removed** from `/matched` — scoring is closed by
the boundary and the buttons always answered 503; cached-score badges are marked
«справочно: новые не считаются». The ESCO terms were **read verbatim** (handbook §5: a
mandatory attribution line + an adaptation note; occupations — ISCO/ILO, skills — EU);
by owner decision the task [ESCO-001](tasks/ESCO-001-import-skills.md) was registered
(connecting the skills part with attribution). Registered
[MODEL-002](tasks/MODEL-002-gpu-spike.md) — a local-scoring spike on CUDA (7–8B, with
the same measurement matrix). Checks: `check` 241/241, `build` 0, `e2e` 96.

**ESCO-001: the ESCO skills part is connected (2026-10-04, owner decision E.6):** the
artifact — the full documents of **13 939 ESCO v1.2.1 skills** via the open REST API
(`selectedVersion=v1.2.1`; the API also has «latest», but that is a different, smaller
sample), 140 pages / 180 MB, sha256 pins in `data/esco-manifest.json` (not stored in
git; fetching and checking — `npm run esco:fetch`, modes `--check` and `--propose`). The
review produced **50 links** of canons to 33 concepts and an **alias delta v3: 8 canons,
11 aliases** (business intelligence, information security, supervised learning,
programme management…); ESCO's false friends («.NET» under Visual Basic, «Canvas» under
LMS, etc.) were rejected item by item and recorded. ESCO has **no Russian** — the RU
part remains the project's own work, the worklist did not change (95 unknown). The
attribution «This service uses the ESCO classification of the European Commission.» +
the adaptation note — in the footer (e2e test), the terms — in `docs/DEPENDENCIES.md`
(Decision 2011/833/EU, CC BY 4.0; occupations/ISCO outside scope). Measurements:
`eval:matching` before/after is **exactly neutral** (NDCG@10 0.892, guards 0/0), the
thresholds did not change. Checks: `check` 244/244, `test:db` 57/57, `build` 0, `e2e` 99
(visual baselines updated — the footer changed). Details —
[tasks/ESCO-001](tasks/ESCO-001-import-skills.md).

**B5-001: near-dup queue (2026-10-04, brief card B5):** cross-language near-duplicates
are now visible to a human, but **nothing is merged automatically**. The rule
(`src/domain/near-dup.ts`): a prefilter by the cosine of full texts (O(n²); the LSH
boundary is measured — ~0.24M pairs/s, 5 000 posts ≈ 53 s) + a gate by the cosine of
titles (embeddings — a lexical match would break an EN/RU pair) + skipping exact A4
duplicates and a veto by hiring geography (A4 counts geography as identity). The
thresholds (0.70/0.75) — **measured with the reference artifact**: EN/RU translation
0.811/0.846, EN paraphrase 0.854/0.913, different roles of one company 0.582/0.731; the
numbers — in the module. CLI `npm run dedup:candidates`: a JSON queue (public
titles/companies, without description texts), `process_with_ml` per source at the point
of use. A run on the local catalog (700 posts): 429 pairs above the text threshold, 41
exact duplicates skipped, **130 candidates**, all within-source families of one employer
(regions/grades); there are no cross-source ones among those shown. Checks: `check`
256/256, `test:db` 58/58, `build` 0, `e2e` 99. Details —
[tasks/B5-001](tasks/B5-001-near-dup-candidates.md), playbook §5b.

**B6-001: urgency/survival proxy model (2026-10-04, brief card B6):** the hazard-proxy
structure landed behind guardrails — and with an honest correction: there are **no**
observed disappearances in the catalog (700 `active`, `closure_checks` empty, ages ≈ 9.3
days), so the constants are provisional and phase 1 is structure. `survival.ts`
(`survival-l1`): a window of 14→45→90 days (peak −6), buckets
`recent/weeks/long/unknown`, `availabilityNoteFor` — one honest line on the card (the
ghost fact A10 is stronger than age-based caution; no numbers and no countdown). Ranker:
the `urgency` layer, **RANKER_VERSION → v5-…-urgency**, the control
`rankJobsWithoutUrgency` in the registry. Measurements: `eval:matching` identical to
baseline (NDCG@10 0.892, guards 0/0); `eval:shadow` — the control `v5-minus-urgency`
moves **0/189** positions: the marginal effect of the layer is measurably zero (the pair
j33/j34 is already fixed by A5); re-fitting — as closures accumulate. Checks: `check`
263/263, `test:db` 58/58, `build` 0, `e2e` 99 (baselines unchanged). Details —
[tasks/B6-001](tasks/B6-001-survival-urgency-proxy.md).

**B4-001: NLI pre-check of contradictions — a negative result (2026-10-04, brief card
B4):** the candidate model `MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` (MIT, ru, ONNX q8;
revision and sha256 pinned and VERIFIED; loading ≈ 1.6 s, a pair 11–21 ms) works on text
NLI pairs (contradiction 0.991 / entailment 0.871 — the call is correct), but it does
not serve the card's working pairs: V4 «требуется гражданство США» («US citizenship
required») + a profile without it → neutral 0.82/0.85 at contradiction 0.08/0.11; a
threshold that would catch V4 (~0.1) would start catching **absence** («Java vs Python»
0.258 — exactly the failure the card forbids); even a hard presence conflict — 0.032 in
the working order. Plus a project rule: the absence of a fact in the profile is not
proof of the opposite. **Integration is not done** (a measured decision, not caution); a
re-attempt — together with C2, as the card allows. The artifact pin is recorded; product
code did not change, `check` is green. Details —
[tasks/B4-001](tasks/B4-001-nli-precheck.md).

**B3-001: reranker — the input is measured, implementation awaits owner decisions
(2026-10-04):** decision No. 3 chose the API path, which per ADR-001 = phase C LLM
scoring; prerequisite §4.1 (C0-part-1) was closed earlier (AI-006). The only unblocked
sub-question — the rerank input (§6) — was measured by `eval:retrieval` on the golden
set v4: **the ranker v5 order R@10 0.850 / NDCG@10 0.892** versus BM25 (0.734/0.810),
fused RRF (0.755/0.771) and dense (0.823/0.766) — «реранк топ-50 после RRF» («rerank
top-50 after RRF») **is not confirmed by measurement**, the input should be planned from
the ranker order; 8 of 38 relevant ones are invisible to any leg (the reranker cannot
reach them by construction). Four owner decisions are open: the purpose `rerank`, the
grants `send_to_ai_provider` ×3, profile privacy, the quota/operation ceiling +
cross-language golden labelling (§9 of decision No. 3's doctrine). Product code did not
change. Details — [tasks/B3-001](tasks/B3-001-reranker-input-measurement.md).

**C0-002: AI boundaries, part 2 — properties covered by tests, the purposes package
ready (2026-10-04):** part 1 of C0 (AI-006) is confirmed in the code (whitelist before
money, the batch is closed with a reason and a plan, the mapping hole is closed). An
audit of the eight properties named by the brief produced 4 new tests in `ai-guards` —
owner isolation (OPERATION_NOT_FOUND), two-way WRONG_STATE settle/cancel (commit-time
revalidation), exhaustion of the owner's quota by settled spend, «deadline останавливает
новые шаги, но не блокирует settle уже отправленного вызова» («the deadline stops new
steps but does not block settling an already sent call») — `test:db` **62/62**; the
golden-10 holds. The package of decisions on phase C purposes: `extraction` and
`dedup-confirm` are compatible with the PD boundary already today (job text only; a
whitelist is needed, for dedup-confirm — a task_type migration),
`matching-scoring`/`hyde`/`eval-judge` await the §4.4 decision (profile privacy).
**Correction from the code:** `send_to_ai_provider` was granted to all three sources
back on 2026-10-01 (AI-005); the quota was raised to $1/month; doctrine No. 3 §9 and
task B3-001 were corrected. Product code did not change. Details —
[tasks/C0-002](tasks/C0-002-purposes-and-property-tests.md).

**Owner decision 2026-10-04: the purpose `extraction` is approved and registered.**
«Одобряю purpose extraction» («I approve purpose extraction») — job-only extraction of
vacancy fields (≈0.03 cents/post, candidate data does not leave the contour). The
approval mechanics are executed: the whitelist (`provider.ts` — three purposes, with
date and price in a comment), the gateway mapping to `job_extraction` (its own attempt
counter), an explicit `false` at the PD boundary (`personal-data-boundary.ts` — a review
record, not a skip), tests: an approved purpose lands in its own bucket and settles, a
neighbouring unapproved one (`cv_extraction`) refuses before money. There is no calling
code — that is C1; `LIVE_AI_ENABLED=false`, the 1-cent ceiling and the quotas did not
change (C1 is obliged to chunk). Checks: `check` 263/263, `test:db` 63/63.

**C1-001: LLM field extraction — the core landed (2026-10-04, purpose `extraction`):**
`src/domain/extraction.ts` (`extraction-p1`) — the prompt instruction + a strict
parser-validator: grounding (evidence = a verbatim quote from the post; a non-`unknown`
value must be a substring of its quote), «unknown ⇒ пустой evidence» («unknown ⇒ empty
evidence»), a ban on `unknown` in requirement strings, a limit of 25; **any violation
rejects the whole record**. Migration 0019 `job_llm_fields`: immutable evidence rows per
(snapshot, prompt, version) with provenance (prompt/model/operation_id/settled), cascade
by snapshot. Guarded service: purpose `extraction`, `send_to_ai_provider` at the point
of use, an idempotent key (a repeat answers from the record, does not pay), a job-only
prompt via `buildJobOnlyPrompt`; the gateway now returns `operationId` for provenance.
CLI `extract:fields`: `--prompt-only` (checked on a real post: a reservation of 473
microcents against a ceiling of 10 000) and a live run that honestly refuses with the
flag off. Tests: `check` 273/273 (both halves of V4: «нет зарплаты → unknown» («no
salary → unknown»), «выдуманная зарплата → запись отклонена» («invented salary → record
rejected»)), `test:db` **66/66**. Wiring into the pipeline and a live run — the next
step. Details — [tasks/C1-001](tasks/C1-001-llm-extraction.md).

**C1-002: extraction was wired into the pipeline (2026-10-04):** the periodic form —
`src/server/ai/extraction-pass.ts`: the owner's switch first (off = touches nothing: no
text, no money), tombstones are skipped by `lifecycle` (the card reader does not return
`tombstoned_at` — an implementation lesson), a budget refusal stops the whole pass with
a code (`OWNER_BUDGET_MISSING` and neighbours; cured by `npm run seed:budgets`, which
now provisions the extractor's row `u_extraction_001`), and `settledMicroCents` counts
**only fresh** spend — cost doubling by repeats was caught by an integration test before
the commit. The worker calls the pass after a successful source import (a limit of 25
posts/tick; the `extraction` event is logged only on real work, and `--status` now shows
`liveAi`); the himalayas/jobicy import scripts — a pass after a successful run with a
JSON summary; the CLI was moved to the shared pass and no longer provisions money
itself. Checks: `check` 273/273, `test:db` **69/69** (two runs in a row, +3 pass tests),
`build`, `guardrails`; live without spending: CLI → `live_ai_disabled`,
`worker --status` → `liveAi: false`. **The first live run is the owner's**:
`LIVE_AI_ENABLED=true` + a key, then `npm run seed:budgets` and
`extract:fields -- --source=himalayas --limit=5`. Details —
[tasks/C1-002](tasks/C1-002-extraction-wiring.md).

**MODEL-001: local generative model — evaluation (2026-10-02, decision No. 4 item 2):**
on this machine (i5-13450HX, 31.6 GB RAM; the installed RTX 5060 8 GB is not used with
the installed CPU runtime) the candidates Qwen3-1.7B and Qwen2.5-1.5B (ONNX q8,
Apache-2.0; artifacts with pins and sha256 verification) **do not serve the shipped
rubric**: 0/6 valid JSON without scaffolding (the models «повествуют» («narrate»)); with
JSON pre-filling — 8/8 valid, but Spearman(scores vs manual ratings) **−0.156**, an
irrelevant design vacancy gets 85, a keyword trap — 85, speed 6.7 tok/s. Scoring remains
closed; the local path requires a GPU runtime (a new dependency) and a 7–8B model — a
separate owner decision. Details —
[tasks/MODEL-001](tasks/MODEL-001-local-generative-eval.md).

**RET-001: retention without deletion (2026-10-02, owner decision No. 4, item 4):**
migration 0018 (`job_snapshots.tombstoned_at`); expired source records **are anonymised,
not removed**: id, source, dates and content_hash remain, the text
(title/company/description/excerpt) and derived vectors are deleted, lifecycle →
`tombstoned`; a repeated listing **revives** the record with its original
`first_seen_at` (the `revived` pipeline branch). The impression/click journal: TTL **12
months** (`EVENT_RETENTION_MONTHS`) + a `purgeExpiredEvents` pass in the worker
(`--no-retention` disables it). Checks: `check` 241/241, `test:db` **57/57**, `build` 0,
`e2e` 96; the migration is applied locally. Details —
[tasks/RET-001](tasks/RET-001-retention-tombstones.md).

**B23: the ranker in the product path (2026-10-02, owner decision No. 4):** `/matched`
is sorted by the shipped ranker v4 — the decision measurement: NDCG@10 **0.892** versus
**0.421** for the catalog order. Hides feed preference demotion, closure — ghost; the
journal writes `RANKER_VERSION` (feed-order labels replaced); the page no longer sorts
by AI score (the badge is for reference); the shadow — champion v4, the candidate
optional (currently `null`, guardrails keep being computed). Checks: `check` 240/240,
`test:db` **56/56**, `build` 0, `e2e` 96, `eval:matching` 0.892/guards 0/0,
`eval:shadow` guardrails pass. Details —
[tasks/B23-001](tasks/B23-001-ranker-in-product-path.md).

**Owner decision batch No. 4 (EDEC-001, 2026-10-02):** delivery switches to ranker v4 —
the key measurement: catalog order NDCG@10 0.421 versus 0.892 for v4 (implementation —
task B23); the batch path and scoring remain closed until a local generative model, a
task to evaluate one was registered (MODEL-001); jobicy received the right
`process_with_ml` (Fair Use re-read; policy v4→v5; `embeddings:index --source=jobicy`
indexed **202/202** — B13 is factually closed); retention: a 12-month journal +
tombstones of closed records (task RET-001). Still open are E.5–E.7 (company filters,
ESCO, email). The full analysis —
[docs/design/2026-10-02-owner-decisions-04-batch.md](docs/design/2026-10-02-owner-decisions-04-batch.md).

**Deferred measurements (DGAP-001, 2026-10-02):** section D of the inventory is closed
by the principle «замером или честной причиной» («by measurement or an honest reason»).
Golden set v3→v4 (39 vacancies): geography-unknown (j35), two cross-language semantic
pairs without Latin script (j36/j37), a second twin pair freshness (j38/j39); on the
live model BM25 does not find the semantic cases at all (uncovered), dense finds them
(j37 #6 at QA, j36 #15 at p-ru-ml), the aggregate — dense NDCG@10 0.766 · BM25 0.810 ·
fused 0.771 · v4 0.892, «не переключать» («do not switch») confirmed; the ratchet
thresholds were rebased downwards with a recorded reason (the set grew and brought hard
cases). The payload of both journal reports is pinned by a unit test. Still open and
named: constants until data accumulates (collection is ready from BFIX-001),
measurements on one machine, the profile's language field (a product decision),
cost/hardware. Details — [tasks/DGAP-001](tasks/DGAP-001-deferred-measurements.md).

**Documents versus code (FDOC-001, 2026-10-02):** section F of the inventory is closed.
`ARCHITECTURE.md` — an ADR update on top and «устарело 2026-10-02» («outdated
2026-10-02») notes on three statements (the ADR decisions did not change);
`SAFETY_GATES.md` — a fact-based status column, the gates and the beta prohibition did
not change; `README.md` — brought to the actual state; `AGENTS.md` — the "What exists"
paragraph (the rules were not touched); `COVERAGE.md` — the table was rewritten, «не
реализовано» («not implemented») remains only for restore; `DELIVERY.md` — the
preparation environment is marked as decommissioned; `DEPENDENCIES.md` — added
`next-auth@4.24.15` and `openai@7.23.0`; `START_HERE.md` — a status header (it remains
an archival record of day one). Details —
[tasks/FDOC-001](tasks/FDOC-001-docs-vs-code.md).

**B-defect campaign (BFIX-001, 2026-10-02):** 18 items of section B of the inventory are
closed — journal clicks (B1), server-side `propensity` (B2) and server-side feed-order
labels (B3, B20), the «Нужно уточнить» tab driven by the profile flag (B4), vacancy
requirements on the matching card (B5), role boosting by words with head-synonym
matching (B6 — a measured NDCG@5 gain 0.914340→0.918614, the ratchet thresholds raised),
the ghost mark in the catalog (B7), the «На чём основано» panel (B8), If-Match/ETag and
version comparison (B10), the DST-exact TIME-01 window with `RULESET_VERSION` 3 (B12),
facts in health/doctor (B14), the AI contour README (B15), `npm run smoke:ai` (B16),
deletion of dead code (B17), visibility of swallowed errors (B18), cost from the ledger
(B19), the uploads gate on all CV routes (B22). Deferred with a reason: B9 (letters are
closed by the personal data boundary), B11 (account deletion — a separate owner review),
B13 (jobicy's right), B23 (the ranker in the product path — an owner decision). Checks:
`check` **240/240**, `test:db` **55/55**, `build` 0, `e2e` **96** (3 baselines of the
letter page updated deliberately), `eval:matching` — thresholds 0.919/0.920, guards 0/0.
Details — [tasks/BFIX-001](tasks/BFIX-001-b-defects-closure.md).

Group B tasks: [B1-001](tasks/B1-001-embedding-contract-dense.md) (embedding contract,
storage, dense leg, playbook), [B1-002](tasks/B1-002-indexing-resilience.md) (indexing
resilience) and [B2-001](tasks/B2-001-bm25-rrf-fusion.md) (BM25 + RRF) — **implemented,
tested locally** (2026-09-30), committed to `main` (`d3b992f`, 2026-10-01), awaiting the
owner's review. Group A (A1–A10) was completed earlier.

**What is implemented.** The local embedding model really works: the contract (the
version is derived from the artifact — revision + sha256 of the weights; the instruction
only in the query; mixing versions/roles — a refusal), storing vectors in pgvector
(migration 0017: `job_embeddings` with a cascade from the snapshot, `profile_embeddings`
with a composite FK from the profile version), indexing with a check of
`process_with_ml` at the point of use (jobicy — `no_permission`, the synthetic data and
himalayas are indexed), the dense retrieval leg, BM25 in Node and fusion by positions
(RRF k=60 + weights). The model weights are downloaded by the single reviewed command
`npm run models:fetch` (625 MB, each file verified against the pinned sha256, the
revision — a commit). Delivery does not switch: the layer is inert without the model and
is not in the hot path.

**Measured on the frozen set A1 (real model, 34 posts × 6 profiles).**

| Order | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| dense leg (B1) | 0.663 | 0.843 | 0.760 | 0.804 | 0.806 |
| BM25 (B2) | 0.660 | 0.877 | 0.827 | **0.881** | **1.000** |
| RRF fusion k=60 | 0.680 | 0.836 | 0.800 | 0.827 | 0.833 |
| ranker v4 (product) | 0.742 | 0.877 | 0.914 | 0.916 | 1.000 |

The conclusion under rule §6.4 («если нет измеримого прироста — не переключать» («if
there is no measurable gain — do not switch»)): **do not switch**. BM25 alone is better
than fusion, and fusion is the better the smaller the weight of the dense leg (dense 1 ·
bm25 3 → NDCG@10 0.868; BM25 alone → 0.881). No leg reaches the ranker v4 thresholds.
Complementarity (top-10, 32 relevant): both legs found 24, dense only — 1, BM25 only —
2, neither found — 5. Fusion headroom exists, but it does not improve the quality of the
order **on this set**.

Live storage check (real model, working DB): embeddings were computed for all 498
himalayas posts, **486 vectors** written; the indexing cost — ~6 minutes for 493 live
documents. The `models/` artifact is not stored in git (`.gitignore`).

**A finding for the owner (outside the task, DB untouched): 12 of 700 `job_snapshots.id`
in the working DB are unreachable by the primary key.** An index search returns 0 where
a sequential scan finds the row (checked directly: `WHERE id = $1` → 0 rows, scan → 1).
The class cause — a change of the DB image (`postgres:17.11-alpine` →
`pgvector/pgvector:0.8.6-pg17`): btree remembers the order of one collation while the
server compares another (`datcollversion = NULL`, `en_US.utf8`). Only `job_snapshots.id`
is affected: `users.id`, `users.email`, `candidate_profiles.id` and the test DB are
clean. The remedy: **`REINDEX TABLE job_snapshots;`** (when in doubt —
`REINDEX DATABASE atlas_starter`), then repeat `npm run embeddings:index`. Until then 12
vacancies are not found by id — this is broader than embeddings: saved, hidden, letters
and FK inserts by them also do not work. It was precisely this defect that broke the
first full run; the indexer now names such ids and continues, but it does not cure the
catalog.

**Checked:** `npm run check` → exit 0 (**229/229** unit, was 194; biome 201 files; tsc
clean); **`npm run test:db` → exit 0 (51/51** on an isolated DB, 7 new); `npm run build`
→ exit 0; **`npm run test:e2e` → 96 passed**; `npm run eval:matching` → exit 0, the A1
thresholds did not move (the ranker was not touched); `npm run eval:dense` and
`npm run eval:retrieval` → exit 0 (the numbers above); `npm run models:fetch` → 6 files,
624 963 871 bytes, all sha256 matched; `npm run embeddings:index -- --embedder=local` →
exit 1 `partial_store` (expected: 481 written, 12 unreachable named — this is exactly
the measured DB defect).

**Limitations.** Cross-language quality is not measured (4 Russian vacancies, there is
no language field in the profile) — and this is exactly the case where the dense leg
could win; the brief's semantic case ("ML developer" without an exact token occurrence)
was not checked on the real model; a full re-index of the catalog ≈ half an hour of CPU
and is versioned as a whole; the KV outputs of the ONNX graph are the main memory
expense (≈4.6 GB per batch of 8 at 2000 tokens, which is why documents are computed one
at a time); `onnxruntime-node` is installed without a postinstall script (the
environment's npm policy), while inference was checked by an actual run. The numeric
constants of the new layers (fusion weights, `RRF_K`, `k1`/`b`) were not tuned to the
set — except those directly named by the measurements above.

**Rollback.** `git revert` of the B1/B1-002/B2 commits: the layer and the CLI disappear,
delivery does not change at any step (it is not ranked by this layer). Tables —
`DROP TABLE job_embeddings, profile_embeddings`; the artifact — delete `models/`. The DB
defect is not cured by rollback: `REINDEX` is a separate owner action.

## Group B: embeddings, BM25, fusion (2026-09-30)

Three tasks, each with its own report:
[B1-001](tasks/B1-001-embedding-contract-dense.md) (contract, storage, dense leg,
playbook, `models:fetch`), [B1-002](tasks/B1-002-indexing-resilience.md) (indexing
resilience to rows unreachable by the DB index),
[B2-001](tasks/B2-001-bm25-rrf-fusion.md) (BM25 + RRF, fusion measurement). The decision
analysis and the boundaries are in `docs/EMBEDDING_PLAYBOOK.md`.

What appeared in the code: `src/domain/embeddings.ts` (contract: the version = the
artifact, the instruction only in the query, fail-closed on mixing),
`src/domain/dense-retrieval.ts`, `src/domain/bm25.ts`, `src/domain/rrf.ts`,
`src/domain/retrieval-eval.ts`,
`src/server/embeddings/{embedding-service,local-embedder,dense-search-service}.ts`,
`migrations/0017_job_embeddings.sql`,
`scripts/{models-fetch,embeddings-index,eval-dense,eval-retrieval}.ts`, the commands
`models:fetch`, `embeddings:index`, `eval:dense`, `eval:retrieval`. The dependency
`@huggingface/transformers@4.3.0` — owner decision No. 2, pinned exactly and checked by
`npm run guardrails` (plus a ban on `allowRemoteModels = true` in `src/`). 35 tests
added (unit) and 7 (integration).

Not started from group B: B5 (cross-language near-dup — depends on B1, now unblocked),
B6 (a survival model instead of age heuristics), B3 (reranker), B4 (NLI pre-check). On
B3, owner decision No. 3 was made 2026-10-01
([document](docs/design/2026-10-01-owner-decision-03-reranker.md)): the API variant via
the already approved OpenAI transport, the stage budget as a warning, the input question
(«после RRF» («after RRF»)) deferred with a record. Activation is impossible before the
prerequisites: C0-part-1 (the gateway does not check purposes, the batch path goes to
the provider past the budget), a new task_type + purpose, `send_to_ai_provider` grants
(currently `denied` for all three sources), a decision on transferring profile text to
the provider and a quota revision (50 cents/month ≈ 53–72 scored deliveries). OpenAI has
no rerank endpoint, so «B3 через API» («B3 via API») is LLM scoring by rubric, that is,
the mechanics and gates of phase C. The nearest step is **C0-part-1** (requires no new
decisions) or a cross-language extension of the golden set (an open labelling question:
A1 requires human judgement).

**What is implemented (brief item A10, phase 1):** availability signals for a listing
reached ranking and the candidate for the first time. `src/domain/ev-multipliers.ts`:
`ghostDemotion` (`suspectedInactive -20`, `pipelineStale -25`; no signal / `active` /
`unknown` → 0) and `ghostNote` — an honest mark «Возможно неактивна: источник не
подтвердил объявление». The ranker — v4, `RankedJob.ghost` for transparency;
`readSnapshotCardsData` reads the closure row together with the card (one query);
`MatchedJob.closure` carries the signal into the matching card and into the A9 shadow.
The «urgency» slot is **not duplicated**: age already measurably demotes delivery (A5,
the numbers in its file), the survival model — item B6. The demotion is bounded below by
the gap between the admission levels (30) and **does not hide**: one failed check leaves
the vacancy in delivery with a mark, only the two-checks rule closes it.

**Checked:** `npm run check` → exit 0 (**194/194** unit, was 189; biome; tsc clean);
**`npm run test:db` → exit 0 (44/44**, 2 new A10 on the live DB: one failed check → the
vacancy remains with a mark, a second → it leaves by the closure rule; unknown gives
neither a hide nor a warning); `npm run build` → exit 0; **`npm run test:e2e` → 96
passed**; `npm run eval:matching` → exit 0, the set did not degrade (NDCG@10 0.916, the
thresholds did not move — the layer is inert without closure data);
`npm run eval:shadow` → exit 0, the current v4 as candidate moves 155 of 159 positions
relative to the catalog order, guardrails pass. A live check: after one failed check the
vacancy remained in delivery (46 records), the card showed the mark; the check trace was
deleted.

**Limitations:** delivery order is still not ranked (switching — an owner decision,
among other things because of the AI sorting on the page — decision No. 11; the gates
are ready in A9); the weights −20/−25 were chosen by meaning (the check «не пересекает
уровень» («does not cross the level») is pinned by a test, tuning the values is a
question of future data); «quarantined» is a property of the pass, not of the record, so
the layer uses `consecutive_inactive`; the mark is shown on the matching card, in the
catalog `/jobs` — not; p(answer), self-reported outcomes and trained multipliers (phase
2: D5/B1) are not started.

**Rollback:** `git revert` of the A10 commit (the layer and the mark disappear; the A1
metrics remain valid). Next per the brief: owner decisions (section 7), then phase B —
starting with the decision on vectors (pgvector versus `float8[]`) and the embedding
model.

## Owner decisions No. 1–2 of 2026-09-30 (vectors: pgvector; embedding model)

**Result:** the decision on item 2 of section 7 of the brief is **approved by the owner
2026-09-30** («одобряю всё это» («I approve all of this»), items 1–5 of §6 of the draft
[`docs/design/2026-09-30-owner-decision-02-embedding-model.md`](docs/design/2026-09-30-owner-decision-02-embedding-model.md)),
and on the same day two more were made: **item 1 — vectors in pgvector** and **ML
processing of himalayas is allowed**, plus an instruction to fix `terms_hash`. Applied
in the code: `process_with_ml` = `allowed` for `atlas-fixtures` (policy version 1→2) and
for `himalayas` (3→4, `reviewed_at` 2026-09-30, a link to the decision in
`approval_reference`); `train_model` and `send_to_ai_provider` remained `denied` for
everyone, for `jobicy` `process_with_ml` is also `denied` — the owner's grant did not
touch it. The boundaries are pinned by the test `tests/unit/source-contract.test.ts`
"owner decision 2026-09-30 (brief 7.2): local ML inference covers fixtures and
himalayas, not jobicy" — a silent flip of any of the three sources fails the test,
`unknown` is still «не лицензия» («not a licence»).

**The decision (what is approved):** the local model `Qwen3-Embedding-0.6B` (Apache-2.0,
MRL 32–1024, 32K, the instruction on the query side, ONNX for Node) as the primary one;
`microsoft/harrier-oss-v1-0.6b` — a shadow-measurement candidate; `granite-311m-r2` — a
CPU fallback; API — measurement baseline only. Details, the scope of each item, the
attachment points and the rollback are in §6.1–6.5 of the document.

**Decision No. 1 (vectors) — made 2026-09-30: pgvector — applied.** Vector storage —
`pgvector`, not `float8[]`. The owner changed the image in `compose.yaml` to
`pgvector/pgvector:0.8.6-pg17`; the container was recreated, the volume preserved (700
vacancies, 355 users, 124 profiles in place), the server — PostgreSQL 17.11 (Debian;
previously musl/Alpine, the same version). A rehearsal on a volume copy showed the
compatibility of the data catalog in advance. Migration `migrations/0016_pgvector.sql`
(`CREATE EXTENSION IF NOT EXISTS vector`) applied to the working and test DBs,
`vector 0.8.6` installed in both, `npm run test:db` → exit 0 (44/44). There is no vector
table — B1 creates it together with the ownership and deletion rules. The line about the
image and the extension is in `docs/DEPENDENCIES.md`.

**ToS of himalayas and jobicy — analysis 2026-09-30 (raw pages, quotes in §8 of the
document).** himalayas: the API documentation names «AI tools» as its audience and
assumes a mirror of the feed; there is no direct permission for ML processing of stored
text — nor a direct prohibition (the site's general terms prohibit reproduction and
scraping, not directly attributed to the API programme). The owner accepted this reading
and **the grant was issued**; written confirmation from `hi@himalayas.app` remains a
recommended step, but no longer blocks. jobicy: Fair Use directly allows «your own
products and user experiences», «summaries, categories, search experiences», «AI
assistants» — the evidence there is stronger, but the grant was not issued: a separate
owner decision (recorded by a comment in the policy).

**`terms_hash` was fixed 2026-09-30.** The reason: the old hash was computed over the
raw page, and it is not reproducible (jobicy injects a Cloudflare script with a nonce,
himalayas serves a deploy-dependent application shell; Wayback returned 429 for
verification). Now: `src/server/terms-fingerprint.ts` — normalisation (scripts, styles,
comments, tags, one-level entity decoding, block boundaries as newlines) and sha256 of
the normalised text; the read editions are in `docs/sources/terms/himalayas-terms.txt`
and `jobicy-feed.txt` with the manifest `docs/sources/terms/snapshots.json`;
`npm run terms:check` compares the live pages with the record (exit 0 — the same, 1 —
changed, 2 — could not check) and prints the place of the first divergence; the offline
test `tests/unit/terms-fingerprint.test.ts` links the policy, the manifest and the
snapshot and fails on divergence without network. An honest detail: normalisation is not
idempotent (decoding is one-level), so the integrity of the snapshot is checked by a
normal sha256 of its text — the test records this explicitly.

**Checked:** `npm run check:offline` → exit 0 (**198/198** unit, was 195; guardrails;
tokens; icons); `npm run typecheck` → exit 0; `npx biome lint` on changed files → clean;
`npm run test:db` → exit 0 (**44/44** on an isolated DB — the grants did not affect the
integration tests); `npm run build` → exit 0; `npm run test:e2e` → **96 passed**;
`npm run terms:check` → exit 0 twice in a row (both pages «unchanged» — where the old
raw hash diverged on unchanged terms); `npm run eval:matching` → exit 0 (R@5 0.742 ·
R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 · MRR 1.000, the ratchet did not move). **Not
run (`not_run`):** the model itself (not one was downloaded or run) and the latency
measurement on the target machine — that is spike B1. The image change of `compose.yaml`
and migration 0016 were not executed — they are the owner's. **Found earlier, fixed in
the working tree:** `npm run check` on HEAD did not pass — biome failed on an unused
import `RANKER_VERSION` (`scripts/eval-shadow.ts:13`), the file came with the A10
commit. Fixed 2026-10-01 with one line (the import removed); `npm run check` in the tree
is green (229/229, biome, tsc). Committed 2026-10-01 (`7eb7b83`), awaiting the owner's
review together with the rest of group B. **Mock/live:** the application and the tests
are local and synthetic; network requests were only made by `npm run terms:check`
(reading the public terms pages of external sources — that is exactly its job, it is not
part of `npm run check`). The live importers, AI providers and weight downloads were not
run. **Costs:** coding host and subagent research — `unknown`. **Rollback:** policies —
restore `process_with_ml: "denied"`, the previous versions and the previous `terms_hash`
values (the tests will stop passing and show that the rollback is incomplete); the
`terms_hash` mechanics — roll back by commit (the snapshots and the manifest live
separately from the code and affect nothing); the document — delete. **Status of the
changes:** committed 2026-10-01 (`48d991f`), awaiting the owner's review of the diff.
Files: `src/server/source-policies.ts`, `src/server/terms-fingerprint.ts` (new),
`scripts/terms-check.ts` (new), `tests/unit/terms-fingerprint.test.ts` (new),
`tests/unit/source-contract.test.ts`, `package.json`, `docs/sources/terms/*` (new
snapshots and manifest), both decision documents.

---

Previous task: [A9-001](tasks/A9-001-ranker-shadow-guardrails.md) — **implemented,
tested locally (check + test:db + build + e2e + eval:shadow + a live run)**
(2026-09-29), the branch is merged into `main` (`a021854`), awaiting the owner's review.

**What is implemented (brief item A9):** the ranker is no longer an unconnected stub.
`src/domain/ranker-registry.ts` gives stable ids to versions, including
`feed-default-order` — «то, что кандидаты получают сегодня» («what candidates get
today») (the catalog order; the page's AI sorting lives above the service and is not
part of the diff, this is recorded). `src/domain/rank-guardrails.ts` — per-request
metrics with constant thresholds: empty share 0.5, closed/duplicate/unapproved sources
in the top-10 — 0 (absolute rules), p95 latency 250 ms; an empty ranker pool is not
counted as an empty delivery (otherwise an honest seen-set would fail the gates — caught
by a live check). `src/domain/ranker-shadow.ts` + `src/server/ranker-shadow-service.ts`
— a shadow run of champion/candidate on the same inputs, a diff by positions and a log
line **of numbers only** (no vacancy ids, no profile — a test). The shadow is connected
to delivery reading inside `try/catch`: a crashed shadow does not affect delivery (a
test), the shadow's input is exactly the delivered vacancies. `npm run eval:shadow` —
the gate: exit 1 when a guardrail is violated by the candidate.

**Checked:** `npm run check` → exit 0 (**189/189** unit, was 180; biome; tsc clean);
**`npm run test:db` → exit 0 (42/42**, 2 new A9); `npm run build` → exit 0; **`npm run
test:e2e` → 96 passed**; `npm run eval:matching` → the A1 thresholds did not move;
`npm run eval:shadow` → exit 0 (candidate v0 moves 150 of 159 positions, the top-10
changes by 68 records). A live run (local DB, 46 delivered vacancies):
`compared 46 · moved 43 · top10Changed 18 · maxShift 39 · guardrails pass`; the shadow
cost ~0–25 ms, the 250 ms threshold with headroom.

**Limitations:** delivery is still not ranked by the ranker (switching and the EV
multipliers — A10 behind the same gates); the three "hard" metrics are structurally zero
today (the gates and the matrices do not let in closed/duplicate/foreign sources) —
these are nets against regressions; p95 is measured on one machine and one profile;
`eval:shadow` counts synthetic fixtures as approved sources (they have no source policy
— this guardrail is checked on the live path).

**Rollback:** `git revert` of the A9 commit; delivery order did not change. Next step:
A10 — EV multipliers (`relevance × m_ghost × m_urgency`) behind these guardrails, with
verification via `eval:matching` (threshold) and `eval:shadow` (diff and gates).

---

Previous task: [A7-001](tasks/A7-001-whats-new-digest.md) — **implemented, tested
locally (check + test:db + build + e2e + a manual run)** (2026-09-29), the branch is
merged into `main` (`524e3db`), awaiting the owner's review.

**What is implemented (brief item A7, push-MVP):** an honest in-app digest «что нового».
The window = the last delivery view, and it is taken from facts that are already
recorded: `firstSeenAt` (A5) and a fresh impression in the journal (A8). Neither a new
table nor a write on render: a GET that advances the cursor could be called by a
prefetch, and a digest that lies about «новое» («new») is worse than no digest. A closed
vacancy cannot get into the digest — it is computed at read time from the same gates as
delivery (`classifySnapshot` cuts off everything except `active`), so «закрытие между
скорингом и отправкой» («closure between scoring and sending») is impossible by
construction. The seen-set (A6) prevents repeating what was already shown; the empty
state names the reason, including hidden ones with their return time.
`src/domain/digest.ts`, `src/server/digest-service.ts` appeared, `GET /api/v1/digest`,
the page `/whats-new`, a link from `/matched`; `matchedForUser` got an injectable pool
(additively) so that the product path and the tests go through the same code.

**Checked:** `npm run check` → exit 0 (**180/180** unit, was 176; biome; tsc clean);
**`npm run test:db` → exit 0 (40/40**, 3 new A7: the window from the journal and the
honesty of the seen-set, a closed vacancy is not delivered through the real
closure-checks mechanism, the window is per-user and is deleted with the profile);
`npm run build` → exit 0 (the routes `/api/v1/digest` and `/whats-new` built); **`npm
run test:e2e` → 96 passed** (93 + the digest contract at three viewports). A manual run
on the local dev DB: the first review was named the first review, after viewing the
matches the digest showed the window, 0 new and an honest reason (46 hidden, they return
when changed or after 14 days); the test records were deleted.

**Limitations:** the channel — the in-app page only (email is impossible: `send_email`
denied in the source matrices; owner decision — brief, item 7); there is no frequency
cap because there are no sends; the window = the last impression of delivery, not «визит
на сайт» («a visit to the site») (stated in the page text); «новое» («new») is counted
by our first observation (anti-gaming A5).

**Rollback:** `git revert` of the A7 commit; the schema did not change. Next step: A9
(ranker infrastructure: shadow mode and per-request guardrails; here also connecting the
A2/A5/A6-002 layers into product delivery), then A10 (EV multipliers).

---

Previous task: [A6-002](tasks/A6-002-negative-preference.md) — **implemented, tested
locally (check + eval + build)** (2026-09-29), the branch is merged into `main`
(`a347648`), awaiting the owner's review.

**What is implemented (brief item A6, second part):** a vacancy hidden by the candidate
demotes its neighbourhood — the same company (−12, normalisation A4) or the same stack
by the dictionary (−6 at ≥4 shared canonical skills, a ceiling of −12, the signals do
not sum). This is a weight, not a filter: the vacancies remain in delivery, admission
does not change, the layer raises no one. The signal shape was chosen by measurement on
the golden set: `company + stack ≥4` gives an aggregate NDCG@10 0.930164 versus 0.916478
without the layer and worsens no profile, whereas the thresholds ≥2/≥3 demote relevant
vacancies (0.919056 / 0.919417), and «только стек ≥3» («stack only ≥3») is worse than
the absence of the layer (0.916062). The ranker — v3, the `preference` field in
`RankedJob` for transparency.

**Checked:** `npm run check` → exit 0 (**176/176** unit, was 170; biome; tsc clean);
`npm run eval:matching` → exit 0, without preferences the metrics did not change (R@5
0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 · MRR 1.000, guards 0/0);
`npm run build` → exit 0. `test:db`/`test:e2e` — `not_run`: the DB schema and the
product path did not change.

**Limitations:** the layer is not yet connected to product delivery (`/matched` sorts by
AI score; connecting the ranker — A9 with shadow mode and guardrails), so the user does
not observe it yet; the threshold and the weights were chosen on 34 synthetic vacancies
and are subject to revision; signal accumulation is deliberately forbidden (the
ceiling), so «много скрытий» («many hides») does not become a structural filter; the
`reason_code` of a hide does not affect the weight.

**Rollback:** `git revert` of the A6-002 commit; the ranker returns to v2, the A1
thresholds remain valid. Next step: A7 (push matching: the «что нового» page, without
email — send_email denied in the source matrices).

---

Previous task: [A6-001](tasks/A6-001-seen-set.md) — **implemented, tested locally
(including test:db on the live DB and e2e)** (2026-09-29), the branch is merged into
`main` (`22a2f85`), awaiting the owner's review.

**What is implemented (brief item A6, the seen-set part):** matching no longer shows
vacancies that the candidate has already seen and did not touch. Migration 0015 adds to
`job_events` the column `shown_content_hash` — a fingerprint of the content at the
moment of showing, which the **server** fills from `job_snapshots.content_hash` (a
client-side fingerprint would allow claiming «вы этого не видели» («you have not seen
this») and returning a hidden vacancy to delivery). An impression registry is not
created as a separate table: «показано во столько-то с таким содержанием» («shown at
such-and-such a time with this content») — that is already a journal fact, so
`src/server/seen-service.ts` reads the journal (`DISTINCT ON`) and applies the rule from
`src/domain/seen-set.ts`: no record or an action taken (click/save) — show; the
fingerprint is different — show immediately; otherwise a 14-day window; at the boundary
— return. Without evidence (no fingerprint, unreadable time, a label far in the future)
the vacancy is shown: a wrongly hidden one is a silent loss; a clock skew between the DB
and the caller of up to 5 minutes — is normal, not «метка из будущего» («a label from
the future»). The rule is applied to the duplicate group as a whole and is counted per
tab, so an empty tab states the reason («скрыто N, вернутся через 14 дней»), not «ничего
не нашлось». `src/components/impression-reporter.tsx` closes the deferred half of A8:
delivery sends impressions (id and positions, position = the place in the rendered list;
the visible area is not tracked and not claimed). The delivery order in the journal is
labelled explicitly (`v0-ai-score-then-catalog` / `v0-review-catalog-order`) — there is
no versioned ranker in the product path yet (A9), so its version cannot be invented.

**Checked:** `npm run check` → exit 0 (**170/170** unit, was 163; biome; tsc clean);
**`npm run test:db` → exit 0 (37/37**, 6 new A6 on the live test DB: the fingerprint is
read by the server, golden 9, the window expires/does not expire, a content change
returns it, a click/save lifts the rule, deleting the profile removes the state);
`npm run build` → exit 0; **`npm run test:e2e` → 93 passed**; `npm run eval:matching` →
the numbers did not change (the ranker was not touched): NDCG@10 0.916, guards 0/0. The
scenario was walked manually on the local dev DB (postgres): 46 impressions recorded
with fingerprints, a repeated load — 46 hidden with an honest line, no duplicates, the
test records deleted. Incidentally the environment gap from A8 was removed: the local
dev DB had not been migrated to 0014, which made `DELETE /api/v1/profile` fail and the
e2e visual scenarios go red — now the migrations are applied.

**Limitations:** «показ» («an impression») = a vacancy in the rendered list (the
viewport is not claimed); the 14-day window — the upper end of the 7–14 range from the
research, not tuned (there is no traffic); the journal retention (decision No. 8) also
limits the memory of impressions; the catalog `/jobs` remains a showcase — the rule
applies in matching; the client-side sending was checked manually, not by e2e (the
fixture backend has no snapshots); the weighted demotion of the neighbourhood of a
hidden item — the next small task (A6-002).

**Rollback:** `git revert` of the A6 commit; the migration is additive and after the
rollback it is simply not read. Next step: A6-002 (weighted demotion of the
neighbourhood of a hidden item), then A7 (push matching/alerts).

---

Previous task: [A8-001](tasks/A8-001-events-journal.md) — **implemented, tested locally
(including test:db on the live DB)** (2026-09-29), the branch is merged into `main`
(`cb627e0`), awaiting the owner's review.

**What is implemented (brief item A8):** a journal of impressions and clicks. Migration
0014 `job_events` (FK to users and job_snapshots with cascade, event type CHECK,
position, `propensity numeric(6,5)` with CHECK 0..1, `ranker_version`, indexes by (user,
time) and by snapshot). `src/domain/events.ts` — strict batch parsing (fixed types, ids
in the sources' space, ≤50 events, no duplicates, clamping of propensity and null
instead of an invented probability). `src/server/events-service.ts` — writing with a
single parameterised `INSERT ... FROM unnest(...)` (there is no string SQL in the file),
a counter and deletion. `POST /api/v1/events` (session → 401, parsing → 400, a vanished
snapshot → 404, otherwise 201; GET is deliberately absent). `deleteAllProfiles` now also
deletes the journal — the profile leaves no behavioural trace. The state
(saved/hidden/responded) remains in its own tables: one source of truth per fact.

**Checked:** `npm run check` → exit 0 (163/163 unit); **`npm run test:db` → exit 0**
(all integration ones, including 4 new: owner isolation, deletion with the profile,
refusal for a non-existent snapshot, null-propensity); `npm run build` → exit 0 (the
route `/api/v1/events` built). `test:e2e` — `not_run` (the UI did not change). Repair
cycle 1/2: the Mimosa write gate blocked the first version of the service for assembling
SQL from placeholders — rewritten to `unnest` (not a bypass, but a safer form).

**Limitations:** the client-side sending of impressions/clicks from the UI is not
connected (the API and the service are ready; the next small task); `propensity` in the
product will be NULL until A10 (stated in the column comment); the journal retention —
an owner decision (brief, the «Решения владельца» («Owner decisions») section, item 8).

**Rollback:** `git revert` of the A8 commit; the migration is additive. Next step: A6
(seen-set and negative preferences) or the client-side sending of events.

---

Previous task: [A5-001](tasks/A5-001-freshness.md) — **accepted by the owner
2026-09-29**; freshness as demotion of stale items (a measured decision: a boost and a
tie-break raised the irrelevant), age from the first observation, set v3 with a twin
pair.

**What is implemented (brief item A5):** freshness as demotion of stale items.
`src/domain/freshness.ts`: a continuous exponential demotion (0 for fresh, half after 7
days, asymptote −15), age **from our first observation** (`firstSeenAt`),
`firstSeenLabel` with Russian declensions; time is always a parameter, not from the
clock. Ranker v2 (`v2-status-skills-role-must-stale-demotion`) with a `freshness` field
for transparency. Golden set v3: a twin pair j33/j34 (stale/fresh copies, identical in
everything else). UI: «найдена…» on the catalog card and on the matching card, next to
«Листинг от …» (these are different facts, the source date is not substituted).

**Measured decision (three forms checked on the set):** an additive boost for fresh
items — incidentally raises the irrelevant (devops 0.995→0.992, ml 0.853→0.846); a pure
tie-break — the same within equal scores (ml →0.849); **demotion of stale items** —
aggregate NDCG@5 0.912941 → 0.914340, NDCG@10 0.915359 → 0.916478, not a single profile
worsened (data 0.833 → 0.840). The table and the conclusion — in the task.

**Checked:** `npm run check` → exit 0 (159/159 unit, biome 153 files, tsc);
`npm run build` → exit 0; `npm run eval:matching` → exit 0 (guards 0/0).
`test:db`/`test:e2e` — **not_run** (the schema did not change; the snapshot cards in e2e
are empty). The thresholds were recomputed downwards once with a recorded reason (the
set 32 → 34); the **relative ratchets** (A2 «требования» («requirements») and A5
«свежесть» («freshness»)) did not move — these are irrevocable guarantees. Repair
cycles: 2/2 (defects of the new code: a duplicate declaration `Ranker`, `-0`; then a
documented re-baseline).

**Repair cycles 2/2** (the limit exhausted honestly): (1) a duplicate declaration
`export type Ranker` + returning `-0`; (2) a re-baseline of the thresholds after the set
grew.

**Rollback:** `git revert` of the A5 commit, the layer is switched off by the flag
`layers.freshness`; the work is committed to `main` (`40eba50`). Next step: A8 (the
event journal + propensities).

---

Previous task: [A4-001](tasks/A4-001-cross-source-dedup.md) — **accepted by the owner
2026-09-29**; cross-source deduplication with provenance preserved. Repair cycles: in
fact three (the limit is two — recorded in the task).

**What is implemented (brief item A4):** cross-source deduplication by an exact key —
`src/domain/dedup.ts` (company normalisation with legal forms, title normalisation with
the markers `(m/f/d)`/`(fully remote)`, the key includes hiring geography;
representative selection: freshness → completeness → a deterministic tie-break). Dedup
is built into both read paths (catalog, matching) and into the card projection:
`alsoListedAt` in `CatalogCardProjection`, in the UI — the line «Та же вакансия также
на: …» with named links. Key decisions: near-miss is deliberately NOT merged (skipping a
duplicate is safer than hiding a second real vacancy); the representative is chosen only
among publishable records (a fresher, but unverified copy does not hide a confirmed
one); a source that cannot be published is not advertised in the provenance either; hide
applies to the whole group; the texts of the copies are not merged.

**Checked:** `npm run check` → exit 0 (154/154 unit, biome 151 files, tsc);
`npm run build` → exit 0; `npm run eval:matching` → exit 0, the metrics did not change
(0.910/0.943 — dedup is not part of the harness). `test:db`/`test:e2e` — **not_run**:
the schema did not change, the UI contract was extended only with the provenance line,
which renders only for snapshot cards (in e2e — the fixture backend, the catalog is
empty). Golden case 6 of the brief («одна вакансия на himalayas и jobicy → одна
карточка, оба backlink сохранены» («one vacancy on himalayas and jobicy → one card, both
backlinks preserved»)) is covered by a test of the projection.

**Repair cycles:** in fact **three** rounds, the limit is two — the overrun by one is
recorded in the task and here (the third — only tsc in a new test file; the CLI recorded
2/2). There were no repeated failures without new data, but the counter rule was
formally violated: from now on, for large tasks, run `npm run typecheck` first.

**Rollback:** `git revert` of the A4 commit (`0b2e5af`, `main`). Next step: A5
(freshness: vacancy age in ranking and on the card).

---

Previous task: [A3-001](tasks/A3-001-skill-dictionary-v2.md) — **accepted by the owner
2026-09-29**; dictionary v2 (the case rule, consumption of all alias occurrences, 19
Russian aliases, the dictionary worklist). Thresholds raised: NDCG@5 0.909773, NDCG@10
0.942889.

**What is implemented (brief item A3):** the skills dictionary v2 in
`src/domain/skills.ts` — a case rule for ambiguous aliases (go/docs/ rest/rust/… match
only when capitalised: «We go fast» no longer yields Go), a consumption defect fixed
(previously only the first occurrence of an alias was consumed, so a second «Node.js»
leaked into a phantom `js → JavaScript`), a delta of 19 Russian-language aliases
(machine learning, analytics, cybersecurity, databases, autotests, project management,
data engineering…) + ECMAScript. New `src/domain/dictionary-coverage.ts` — the
dictionary worklist (a frequency list of unknown tokens for human revision; **not a
metric**), printed by `npm run eval:matching`.

**Measurements (aggregate of 6 profiles, golden v2):** NDCG@5 0.903879 → **0.909773**,
NDCG@10 0.924056 → **0.942889**; R@5/R@10/MRR unchanged. The ratchet thresholds were
raised (upwards only), the re-baseline history is recorded in the test. The attribution
was checked by comparing the code of A2 and A3 via `git stash`: for the frontend profile
NDCG@5 0.855 → 0.974 because of a removed phantom match (j05 «Node.js ×2»); for the data
profile locally 0.755 → 0.663 (a Russian alias raised j21 and pushed aside j32 within
the top-5) with a rise in NDCG@10 — recorded as an honest permutation of two relevant
ones, not a loss of quality.

**Checked:** `npm run check` → exit 0 (146/146 unit, biome 149 files, tsc);
`npm run build` → exit 0; `npm run eval:matching` → exit 0 (guards 0/0).
`test:db`/`test:e2e` — **not_run** (schema/UI/API did not change).

**ESCO (V1, 2026-09-29):** the publisher — DG Employment of the European Commission, the
data «free of charge», version v1.2.1 (release v5.7.0, update 10.12.2025). The exact
licence on the «about» page is not confirmed (the terms page was not read) — **the
import is not started**, the decision and the arrangement as external content is the
owner's.

**Limitations:** Russian case forms are not supported; the list of ambiguous aliases is
curated manually; the worklist is a heuristic. Coding-host spend: unknown. **Repair
cycle 0/2** (the edits were iterations within the task before the first check run;
recorded honestly).

**Rollback:** `git revert` of the A3 commit (`3b8dbe4`, `main`). Next step: A4
(cross-source deduplication).

---

Previous task: [A2-001](tasks/A2-001-requirement-decomposition.md) — **accepted by the
owner 2026-09-29**; requirement decomposition (a deterministic layer), ranker v1, set
v2. Thresholds at that time: NDCG@5 0.903879, NDCG@10 0.924056.

Previous task: [A1-001](tasks/A1-001-golden-set-eval-harness.md) — **accepted by the
owner 2026-09-29**; golden set + eval harness (metrics, baseline v0, 29 vacancies × 6
profiles), ratchet thresholds. Baseline on set v1: R@5 0.821, R@10 1.000, NDCG@5 0.909,
NDCG@10 0.933, MRR 1.000.

**What is implemented (brief item A2):** decomposition of vacancy requirements — a
deterministic layer without a model. `src/domain/requirements.ts`: normalisation
(explicit snapshot requirements take precedence), derivation from text (dictionary
skills by sentences + structural strength markers: the title zone before a colon or an
unambiguous phrase, EN and RU), coverage evaluation with the verdicts
`covered/uncovered/unknown`, `missingSkills`, honest wordings («в профиле не указан»
(«not specified in the profile»), not «у вас нет» («you do not have it»)).
`src/domain/match-ranker.ts` → ranker v1 (`v1-status-skills-role-uncovered-must`): the
only new signal in the rank — a penalty of −15 for an uncovered must-have (a covered one
is not bonused: it is already counted by the skill intersection, and the bonus was
measured as an amplifier of keyword stuffing). `src/domain/skills.ts`:
`canonicalSkillName` added (alias → canon name), the dictionary did not change. Golden
set v2: +3 vacancies (the pair j30/j31 to measure the effect, j32 with the Russian
marker «обязательно») and +18 ratings.

**Measurements (set v2, 6 profiles).** v0-equivalent → v1: NDCG@5 0.901219 →
**0.903879**, NDCG@10 0.921708 → **0.924056**; R@5/R@10/MRR unchanged; not a single
profile worsened (checked by a relative ratchet test). The gain comes from the pair
j30/j31: a vacancy with an uncovered must-have goes below a vacancy with a covered one
(backend profile NDCG@10 0.986 → 1.000).

**Checked (real commands):** `npm run check` → exit 0 (137/137 unit, biome 147 files,
tsc); `npm run build` → exit 0; `npm run eval:matching` → exit 0 (guards 0/0). `test:db`
and `test:e2e` — **not_run**: schema/queries/UI/API did not change. Existing tests were
not weakened; the thresholds were recomputed downwards once with a recorded reason (the
set 29 → 32), the irrevocable guarantee is now relative (v1 ≥ v0 per profile).

**Repair cycle 1/2** (recorded retroactively, the counter spent honestly): the first
version of the markers and the bonus for a covered must gave NDCG@10 0.8925 versus
0.9217 for v0 — the keyword trap "Technical Recruiter" received must status from the
prose «job requirements» and surfaced in the data profile's top. The numbers of the
first version are preserved in the task as proof of the defect.

**Boundaries:** the UI/API do not show requirements yet (the data is ready —
`missingSkills` and `rows`); the ranker is not connected to the product read path
`/matched` (that is A10 together with the A9 shadow mode). Negations («не требуется X»
(«X is not required»)) the heuristic does not parse — replaced by C1 (LLM) and refined
by A3. Coding-host spend: unknown.

**Rollback:** restore `RANKER_VERSION` and the weights, delete `requirements.ts` and the
tests; the work is committed to `main` (`1aa4c7c`). The next small step: A3 (developing
the skills dictionary — including the extractor's false positives on ordinary words, see
A1-001) or A4 (cross-source deduplication).

---

Previous task: [A1-001](tasks/A1-001-golden-set-eval-harness.md) — **accepted by the
owner 2026-09-29**; golden set + eval harness (metrics, baseline v0, 29 vacancies × 6
profiles), ratchet thresholds. Baseline on set v1: R@5 0.821, R@10 1.000, NDCG@5 0.909,
NDCG@10 0.933, MRR 1.000.

Active task earlier: [DS-001](tasks/DS-001-nenaugad-design-system.md) —

**What is implemented (design brief item A1):** golden set + matching eval harness.
`src/domain/eval-metrics.ts` (DCG/NDCG/Recall@k/MRR; the formulas were verified against
primary sources 2026-09-27, «неприменимо» («not applicable») = null, not 0);
`src/domain/match-ranker.ts` (baseline v0: admission status ×30 + skills ×10 + role in
the title ×15, deterministic); `src/domain/matching-eval.ts` (the runner: gates and
ranking are measured separately, the guards "unjudged shown" and "relevant but hidden");
`src/data/matching-golden.ts` (a synthetic set: 29 vacancies × 6 segment profiles = 174
handwritten ratings 0–3); `scripts/eval-matching.ts` + `npm run eval:matching`
(`--json`, `--verbose`); `tests/unit/matching-eval.test.ts` (11 tests, ratchet
thresholds).

**Baseline (aggregate of 6 profiles):** R@5 0.821 · R@10 1.000 · NDCG@5 0.909 · NDCG@10
0.933 · MRR 1.000; a control bad ranker — NDCG@10 0.269 (sensitivity confirmed). The
test thresholds = these values, they must not be lowered.

**Checked (real commands):** `npm run check` → exit 0 (128/128 unit, biome 145 files,
tsc); `npm run build` → exit 0; `npm run eval:matching` → exit 0, guards 0/0. `test:db`
and `test:e2e` — **not_run**: schema, queries, UI and API did not change. Diff: only
`package.json` (+1 script) and new files; existing tests were not touched.

**Repair cycles 2/2** — recorded retroactively (the CLI writes only forward), the
counter exhausted honestly: (1) an own control test found a real bug — `rankJobs` was
hard-wired and the injected ranker was not used; (2) strict TS checks of the new files,
the metric numbers did not change. A third cycle in this task is forbidden — only a
blocker report.

**Observations for the following items (unchanged in A1):** the skill extractor catches
ordinary English words (checked: «We go fast» → Go, «Read the docs» → Technical
Writing); keyword traps are deliberately encoded in the set and are fixed by A2/A3; role
boosting by substring does not trigger on «Frontend Engineer»; Russian-language skill
names are not extracted; `showNeedsReview` is stored but never applied on read — a
product behaviour question for the owner.

**Limitations:** the fixtures are synthetic (`example.invalid`), the language of the
posts does not participate in the ratings (the profile model carries no languages — gap
A3); R@10 and MRR are saturated today (pools 19–24), NDCG@5/@10 and R@5 are sensitive.
Coding-host spend: unknown.

**Rollback:** delete the 6 new files and the `eval:matching` line in `package.json`; the
work is committed to `main` (`1aa4c7c`). The next small step: A2 (structural
requirements + deterministic matching), after that — A3/A4.

**Commit blocker — a decision made by the owner 2026-09-29:** commit via the plugin's
standard handle. The owner sets `setx MIMOSA_GIT_GATE_MODE warn` and restarts ZCode (the
variable is read by the hook process, so until the restart an inline or `setx` value
does not apply to the current session; verified empirically 2026-09-29). The gate will
keep printing the audit, but will stop blocking. The findings because of which it blocks
are known false positives in third-party files: `tests/e2e/visual.spec.ts:46` (the
password of a local e2e account at `@example.invalid`) and
`tests/integration/ai-guards.test.ts` (parameterised SQL helpers). After the restart,
the commit order: (1) docs on `design/job-matching`; (2) A1+A2 on
`feature/A1-golden-set-eval-harness` (including docs via `--ff-only`); (3) then A3…A10 —
one commit per task. Done 2026-10-01: everything accumulated was committed
(`1aa4c7c`…`95501f9`) and pushed to `origin/main`, the working tree is clean; the branch
was renamed to `main`.

---

Active task earlier: [DS-001](tasks/DS-001-nenaugad-design-system.md) — **accepted by
the owner and merged into main** (merge `4b6882e`, 2026-09-27); checks before the merge:
`npm run check` (exit 0, unit 117/117), `npm run build` (exit 0), `npm run test:e2e`
(93/93).

**DS-001 — the Nenaugad 1.3 design system in the application (the branch
`feature/nenaugad-design-system`, merged into main — merge `4b6882e`).** The owner
2026-09-26 instructed to apply the brand book from `Reference/Nenaugad/` (v1.3)
pixel-perfect with screenshot tests. Implemented: tokens `--ng-*` — 140 items (132 Atlas
1.1 values unchanged + 8 brand) from the new `docs/solo/context/nenaugad.tokens.json`;
the generator `scripts/tokens.mjs` now takes DTCG units into account (rem is no longer
divided by 16 — the dead `--size-*`/`--leading-*` layer is fixed,
motion/layer/weight/brand added); `atlas.tokens.json` is kept in place (a guardrails
requirement), no longer the source of generation. Brand: `public/brand/wordmark.png`
(208/176 px, from the kit), favicon.svg, «Ненаугад» in metadata/UI, the tagline «Только
удалённо». Icons: `docs/solo/context/nenaugad.icons.json` (64 glyphs) →
`scripts/icons.mjs` → the sprite `public/icons/nenaugad.sprite.svg` + a typed registry;
the `Icon` component via `<use href>` (without `dangerouslySetInnerHTML`, CSP
untouched); `icons:check` in `check:offline`. `globals.css` was rewritten from the
reference showcase CSS (the product layer 1:1: `.wrap`, `.btn`, `.badge`, `.job-card`,
`.context`, `.conditions`, `.empty`, `.banner`, `.saved-row`, `.mobile-nav`…); all
screens (/, /jobs, /jobs/[id], /matched, /profile, /saved, /status, /login, /cv,
/letters, error/not-found) were switched to the showcase markup;
header/footer/mobile-nav — with `aria-current` and SVG icons instead of unicode. The
display layer: the fixtures source's `display_name` → "Nenaugad Fixtures" (the internal
`source_id: "atlas-fixtures"` and all keys untouched). The main phrase «Выбирать работу.
Не наугад.»

**Screenshot tests:** `tests/e2e/visual.spec.ts` — 13 states × 3 viewports
(1440/390/320), fullPage baselines in git; the Next dev indicator is hidden, the email
in the header is deterministic per project, the profile is restored before the shots by
deletion (the DB persists between runs).

**Checked (real commands):** `npm run check` → exit 0 (tokens:check 140, icons:check 64,
guardrails, unit **117/117**, biome, tsc); `npm run build` → exit 0; `npm run test:e2e`
→ **93/93**: 39 old scenarios with updated DOM/copy selectors, 18 design-system checks
(assets/sprite 64 glyphs, security headers, header/favicon/decorative icons, the
conditions map of 5 groups with the amber unknown state, mobile-nav per viewport, the
letter redirect) and 36 visual states (baselines stable across repeated runs). After the
owner's acceptance, coverage was extended: the unit suite
`tests/unit/design-system.test.ts` (the full set of 140 tokens with the key showcase
values, semantic aliases, 64 glyphs in 4 groups, the sprite without executable content,
the closure of `var()` in globals.css, a ban on screen-local colours outside the kit
accents) + screenshot states of unknown geography, an empty delivery, search and profile
validation error. `test:db` was not run — there are no data/migration changes
(`not_run`, not «прошёл»).

**Documented deviations from the showcase** (the rule «домен важнее screenshot» («domain
matters more than screenshot»), the full list is in the task): there is no dead
«Фильтры» button (the catalog has no filters except search); there is no bookmark on
fixture cards (saving — snapshots only, per the API contract; on matching cards the
bookmark is real); the status in «Сохранённом» — real actions, not a demo select; the
demo strip copy is adapted to the actual state of the application.

**Limitations/costs:** font files are not part of the kit (stacks Inter/Source Serif 4
with fallback, CSP `font-src 'self'`) — the baselines are accurate for the environment
where they were taken, on machines without Inter the rendering will fall back; fixed
elements in fullPage screenshots on mobile are drawn at the first viewport's position (a
Playwright artifact, stable). Coding-host spend: unknown. A side artifact of the
session: `docs/research/2026-09-26-job-matching-research.md` (a subagent's web research
outside task DS-001) — committed 2026-09-29 (`edc41e5`, together with the brief). The
dev server on :3000 was stopped for the e2e run (`npm run dev` restarts it).

**Rollback:** the branch is merged into `main` (merge `4b6882e`); rollback —
`git revert` of the merge commit. Next step: S3-002 or batch API test S4-003 (by owner
decision).

---
Previous records (S2-002, S3-003, S1-003, …) are preserved below unchanged.

Active task earlier: [S2-002](tasks/S2-002-hide-and-applied.md) — **implemented, tested
locally** (2026-09-25), awaiting the owner's review/acceptance.

**What is implemented:** migration 0008 (`hidden_jobs` with a reason CHECK +
`saved_jobs.marked_applied_at`); fixed hide reason codes (7 items, a privacy minimum
without free text); the feedback service (ownership, FK→404); the API
`GET/POST/DELETE /api/v1/hidden` + `PATCH /api/v1/saved` (401/400/404 discipline);
matching excludes hidden ones only for the owner (eligible and needs_review); UI:
«Скрыть…» with an inline reason picker on the matching cards (including unsaved ones),
the «Скрытые» section with the reason and «Вернуть в подбор» on /saved, the button
«Отметить отклик ✓ (дата)» on the saved ones — it is set only by a user action, a click
on an external link marks nothing.

**Checked:** 71/71 unit, 21/21 integration (ownership: B does not return A's hidden
item, the mark changes only its own rows; CHECK on reason codes), check/build, e2e 39/39
(API contract: 401/400/404), a live UI flow on real data: 7 eligible → hiding with a
reason → excluded (6) → the «Скрытые» section with the reason → return → 7.

Further (by owner decision): S3-002 (PDF), AI safeguards, a third source, monitoring the
stability of the reinstalled Docker.

**What is implemented:** an offline parser without dependencies
(`src/server/cv/parse.ts`): text insertion and .txt/.md (UTF-8 with reversible-decoding
verification), .docx — an own minimal ZIP reader (central directory; the PK signature
takes precedence over the extension; encrypted entries and >200 entries — a refusal;
unpacking via `inflateRawSync` with `maxOutputLength` — zip bombs die at the 20 MB
limit, not in memory), text from `word/document.xml` (w:t + paragraphs + XML entities),
PDF is rejected with a suggestion of the text form; fail-closed limits: file ≤10 MB,
extracted text ≤150 000 characters, empty text — an error;
THIN_TEXT_LAYER/UNUSUAL_CHARACTERS warnings. Migration 0007 `cv_uploads` (ownership,
minimisation: the original binary is not stored — only text and metadata; range
constraints). The API `/api/v1/cv` (POST json/multipart, GET list, GET/DELETE by id) —
401 without a session, someone else's id → 404, 413/400 with human messages; deleting
the profile also deletes the CV. The page `/cv` (insert/upload/view/delete, warnings,
«ничего не выводится автоматически»), a link from /profile. Config: UPLOADS_ENABLED=true
— the only permitted form of enabling, malformed values remain fail-closed (the safety
test extended, not weakened).

**Checked:** 70/70 unit (a zip builder in the tests: a happy docx, two kinds of zip
bombs, encryption, limits, signature-based routing), 19/19 integration (ownership: B
does not read/delete A; deleting the profile cleans up the CV; constraints),
check/build, e2e 33/33 (insert→view→delete; 401). A debugging trace: the e2e failure was
a missing migration 0007 on the dev DB (applied). Docker instability: the 10th engine
death in a day.

**Slice boundaries:** the PDF parser, OCR and AI extraction are outside the slice
(before paid AI, budgets/quotas/deadlines per AGENTS are mandatory); there is no
autofill of profile fields — the principle «draft ≠ факт» («draft ≠ fact»).

Further (by owner decision): S3-002 (PDF text layer), S2-002, AI safeguards, a third
source.

**What is implemented:** `headJobicyListing` in the allowlisted fetcher (pinned
jobicy.com, HEAD, `redirect:"error"`, a timeout of 10 s; 200→active, 404/410→ inactive,
429/5xx/redirect/network→unknown — never closes); migration 0006 `closure_checks`
(per-record last check + inactive counter); `runClosureCheckPass` (budget ≤25 HEAD/hour
rolling — persistently, a restart does not reset it; per-record interval ≥6 h; records
from a fresh window are not checked; closure only after 2 consecutive inactives with an
interval; active resets, unknown is neutral; mass-closure guard: >50% inactive at ≥4
checks → `quarantined`, closures are not applied, the results are recorded); provenance
and dates are not overwritten on closure (`jsonb_set` lifecycle, the contract is valid —
checked); the worker runs the pass after the import cycle (`--no-closure` disables it),
`--status` shows closure statistics; «Сохранённое» shows closed ones with the badge
«Закрыта (источник)», the catalog/matching exclude them automatically.

**Checked:** 65/65 unit (HEAD classification across all statuses, counters, guard
thresholds), 17/17 integration (closure after 2 inactives with an interval; nothing_due
within the interval; active/unknown semantics; quarantine without application; the
25/hour budget with a restart; closed snapshots are valid per the contract),
check/build, a live `--status` with closure statistics, e2e 30/30 (in a stable window;
the 9th Docker death between runs — the previous blocker).

Further (by owner decision): S2-002, S3 (CV/parser), a third source, fixing Docker
Desktop (9 deaths in two days).

**What is implemented:** the jobicy policy (approved, enabled=false, terms_hash
recorded, valid_until 2026-12-23); migration 0004 (job_snapshots → multi-source:
source_id IN (himalayas, jobicy), named constraints); `fetchJobicyWindow` in the
allowlisted fetcher (pinned jobicy.com, count≤200); a mapper for the live contract
(id-number→`jobicy:{id}`, pubDate ISO+00:00→ISO, jobGeo: Anywhere→worldwide /
country→ISO / region→region_text without an invented list of countries,
jobType→employment_types, salary nullable, excerpt=jobExcerpt); `runJobicyImport` (the
window is always partial: absence ≠ closure, miss counters do not grow; a 6h poll gate;
retention 720h); the CLI `npm run import:jobicy` (refusal exit 1 while it is off); the
read paths are generalised to both sources (the catalog «Внешние источники», matching,
saved — with per-source attribution).

**Checked:** 57/57 unit (mapper/gates/idempotency/refusals), 11/11 integration
(including jobicy in the shared tables after 0004 + refusal of a foreign source),
check/build, CLI refusal without network. **e2e: 30/30 passed twice in a day in stable
windows; the current run 27/30 — three failures are 100% related to the environment**
(Docker Desktop died 6 times; three times ECONNREFUSED 127.0.0.1:54329 was recorded
while the engine was alive — the port proxy). C1-003 does not change the UI paths while
jobicy is off. Repair cycle 1/2 — a record of the environment blocker.

**Environment blocker (owner action):** Docker Desktop is unstable — the engine dies
every ~10–20 minutes, the port proxy refuses while the engine is alive. Recommendations:
update/repair Docker Desktop, check the WSL2 memory limit (.wslconfig), try
`wsl --shutdown`; I can add a db probe to doctor.

**After review:** «коммить» («commit») + separately «включай Jobicy» («turn on Jobicy»)
(enabled=true → `npm run import:jobicy` → ~200 fresh cards next to Himalayas).

S2-001 summary: auth (next-auth@4.24.15, scrypt), migration 0003 (users/profiles with
versions/saved_jobs + ownership), a manual profile, deterministic matching v1 (5 rules,
4 outcomes, reason codes, AND/OR aggregation, gates), /matched with explanations,
/saved, an API with 401/404 discipline. Checked: 51/51 unit, 10/10 integration
(ownership negatives), 30/30 e2e, check/build.

**Next task: [S1-003](tasks/S1-003-jobicy-second-source.md) — Jobicy (assigned
2026-09-25).** Live research is done; the rights matrix awaits an owner decision.

### Facts of the jobicy review (collected 2026-09-25 from live pages, as instructed by the owner)
- API (jobicy.com/jobs-rss-feed + github.com/Jobicy/remote-jobs-api):
  `GET /api/v2/remote-jobs`, without a key, count 1–200 (a window of the latest records,
  NOT a full snapshot); fields: id (number), url (the canonical Jobicy listing),
  jobTitle/companyName/jobIndustry[]/jobType[]/jobGeo/jobLevel/
  jobExcerpt/jobDescription(HTML)/pubDate(ISO+00:00)/salary*(nullable). Smoke confirmed.
- Rights: «normal integrations do not require a separate agreement»; attribution is
  mandatory («Keep Jobicy as the original source and preserve the canonical Jobicy job
  URL»); one may not pass them off as one's own, spam networks/misleading databases are
  prohibited; polling ≤1/hour, caching is encouraged; sanitise the HTML description. The
  GitHub code is MIT, but the listings are not included.
- Paid option: a Bearer key → a direct ATS URL, $0.01 per record received for the first
  time; disabled without a budget. Affiliate `?u=` — we do not use it without an owner
  decision.
- Closure: a HEAD of the listing 1–2/hour is recommended; 404/410 = inactive, other
  errors ≠ closure (the next task is lifecycle; in S1-003 the window is always partial,
  absence ≠ closure).
- terms_hash (sha256 /jobs-rss-feed, 2026-09-25):
  97e86dc4985447f754f9de36b9e72f4723d17dab6995052e35e88aff3370698c
- Recommended matrix: fetch/cache/store_full_text/store_excerpt/derive_fields/
  publish_excerpt = allowed (attribution+backlink); publish_full_text/process_with_ml/
  send_to_ai_provider/train_model/send_email/index_web_page/syndicate/bulk_export/
  direct_apply = denied; apply_route=source_required; retention 720h; poll ≥6h;
  valid_until 2026-12-23.

## Owner decisions
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Renaming Atlas → Nenaugad (2026-09-24).
- S0-001 accepted; git init, main; commits f1f2ab7…e5efe11.
- The himalayas rights matrix approved and activated (2026-09-24): 497 records, a
  checkpoint; rollback — enabled:false without a UI edit.
- S2-001 accepted 2026-09-25 (the commit awaits the owner's word).
- Mimosa: the full audit is not completed (limits; false positives on parameterised SQL
  and `.exec(`/`.match(`). Security is not claimed.
- Environment: Docker Desktop crashed 4 times on 24–25.09 — the cause of "random"
  crashes of DB/e2e; on crashes, check the engine first.

**What is implemented:** auth on next-auth@4.24.15 (JWT session, httpOnly, Credentials;
registration `/api/v1/auth/register`, scrypt passwords from node:crypto); migration 0003
(users / candidate_profiles / search_profiles with versions / saved_jobs with
ownership); a manual profile (ISO-2 country, IANA zone, availability windows, target
roles, forms of cooperation, zero-mandatory-attendance, a minimum salary with
strict/hard, show_needs_review) — saving = a new version, deleting deletes all versions;
the deterministic rules engine v1 (`src/domain/matching.ts`: GEO-01, CONTRACT-01,
REMOTE-01, SAL-01, TIME-01 with the outcomes pass/fail/unknown/not_applicable and reason
codes from spec 13.2; aggregation AND-within-option / OR-between-options; TIME-01 v1 —
the zone offset falling within the accepted ones, with a seasonal January/July check);
the pages /login, /profile, /matched (eligible + «Нужно уточнить», ineligible hidden, an
explanation per each rule), /saved; the profile/saved/matched API — 401 without a
session.

**Checked:** 51/51 unit (rules, profile validation), 10/10 integration (scrypt/email
duplicates, versions, deletion, ownership: B does not see/does not unset A's saved
items, FK to a non-existent snapshot), 30/30 e2e (registration→profile→an honest empty
/matched on fixture→404 on saving a non-existent one; 401 on private APIs without a
session), check/build. Repair cycle 1/2 (retroactively).

**Boundaries:** CV/upload — S3; TIME-01 does not count window overlaps with DST accuracy
(a versioned extension later); profiles do not leave the local database; e2e
registration writes random accounts into the local dev DB; CI received
DATABASE_URL/AUTH_SECRET at the e2e step (an ephemeral CI secret, not production).

**After acceptance:** S2-002 (hiding with reasons/applied mark, postgres-e2e) or
connecting the second Jobicy source — by owner decision.

The active himalayas policy: version 3, approved+enabled, valid_until 2026-12-23 (repeat
review), retention 720h, polling ≥24h. Rollback: `enabled: false` — the cards disappear
without a UI edit.

E2E keeps running the fixture backend (env in playwright.config) — the demo catalog
counter is valid; the postgres e2e mode — a future task.

## Owner decisions
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Renaming Atlas → Nenaugad (2026-09-24).
- S0-001 accepted; git init, main; commits f1f2ab7…e31a9bd.
- The himalayas rights matrix approved 2026-09-24 (d48bcfe); S1-001 accepted (e31a9bd).
- S1-002 committed and activated 2026-09-24 (see git log).
- Mimosa: the full audit is not completed (library_source/callgraph limits; false
  positives on parameterised SQL and `.exec(`/`.match(` — bypasses without weakening
  protection). Project security is not claimed.

**What is implemented:** the pinned transport `src/server/import/fetcher.ts` (the only
file in the guardrail allowlist: pinned host, opaque-cursor validation,
`redirect:"error"`, a timeout, a size limit, 429/5xx classification); a live cursor-walk
adapter with a page budget and a checkpoint (`himalayas-adapter.ts`, refusal when
disabled, a poll gate ≥24h, a failed run does not consume the window); migration 0002
(`job_snapshots` with a contract CHECK + `import_state`); PostgreSQL storage with
retention (720h + expires_at − 7d); the CLI `npm run import:himalayas` (refusal exit 1
while the source is off) and `npm run smoke:himalayas`; a card read path with
attribution/backlink only when the policy is enabled; the catalog UI section is "dark"
until activation. The mapper was rewritten for the live contract (guid=URL→stable ID,
Unix seconds, excerpt separately, numeric timezone hours, the full range = no
restriction).

**Checked:** 44/44 unit, 6/6 integration (test DB: idempotency, checkpoint, CHECK
constraints, retention), check/build, smoke **contract_ok** on real API records, CLI
refusal without network, e2e 24/24 without regression. Repair cycle 1/2 (retroactively,
see current.json).

**Activation (owner decision):** review the diff → `enabled: true` in the policy →
`npm run smoke:himalayas` → `npm run import:himalayas` (25 pages by default, ~500
records; the full feed ~100k — by budgeted runs) → update the e2e catalog counter.
Rollback: `enabled: false` without a UI edit; the 0002 tables remain.

**himalayas policy: the rights matrix was approved by the owner 2026-09-24** (a review
of the live API/ToS pages). `status: approved`, `enabled: false` — activation is a
separate live-adapter task. Allowed:
fetch/cache/store_full_text/store_excerpt/derive_fields/ publish_excerpt
(attribution+backlink mandatory). Prohibited: publish_full_text, process_with_ml,
send_to_ai_provider, train_model, direct_apply, send_email, index_web_page,
syndicate_google_jobs, bulk_export. apply_route=source_required, retention 720h +
expiryDate, polling ≥86400s, terms_hash recorded (sha256 himalayas.app/terms as of
2026-09-24), valid_until 2026-12-23 (repeat review).

**S1-001 result:** a real domain contract (`src/domain/source-contracts.ts`,
SourcePolicy/JobSnapshot per 03_DOMAIN_CONTRACTS.schema.json, manual validators without
third-party dependencies), an executable source policy
(`src/server/source-policies.ts`), a contract fixture of the future Himalayas adapter
with a deterministic mapper (`src/server/import/himalayas-fixture.ts`:
seconds/milliseconds, empty locations = worldwide only without contradicting the text,
salary without an invented currency), an idempotent import pipeline
(`src/server/import/pipeline.ts`: dedup by ID, content-hash, version+1 only on a meaning
change, 429/5xx/an incomplete snapshot do not close records, stale after two full passes
with an interval ≥24h, finite retry) and a UI projection with gates
(`src/domain/snapshot-projection.ts`). There is no network transport in src/
(guardrails).

Checked: 39/39 unit (9 new on the 7 S1 acceptance items), lint+tsc (49 files), build,
24/24 e2e, 3/3 test:db. Repair cycle: 1/2 (a retroactive record of a classification
defect fixed before the original implementation was finished — see tasks/current.json).

**Deliberately not done:** live fetch Himalayas (requires an owner approval of the
policy and a separate review), storing snapshots in PostgreSQL (the contract store is in
memory/fixtures; the DB schema did not change), showing himalayas cards in the UI (the
source is not approved — 0 cards contributed, no mocks).

## Owner decisions
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Renaming Atlas → Nenaugad (2026-09-24): package, compose project, CI, UI, prose.
  Preserved: the Atlas 1.1 design language artifacts, Reference/, docs/solo/context/,
  reports/ and the data contracts (atlas-fixtures, atlas_demo_jobs, atlas_starter*,
  ATLAS_ENV).
- S0-001 accepted 2026-09-24; git init, branch main, commits f1f2ab7, 7c5a404.
- The Mimosa pre-commit full audit did not complete (library_source limit, callgraph
  partial): project security is not claimed.

## Next step
Owner: review the S1-001 diff + a decision on the himalayas policy
(approve/purpose/review). After approve — a separate live-adapter task (fetch, polling,
DB storage).

### Facts of the himalayas review (collected 2026-09-24 from live pages, as instructed by the owner)
- API (himalayas.app/api, /docs/remote-jobs-api, openapi.json): free, no key; cursor
  ≤20, refresh 24h, 429 → wait ~60s, s-maxage=86400; caching on one's own backend is
  directly encouraged; attribution is mandatory (link back + mention as source);
  applicationLink can be shown with source credit; syndication to third-party sites is
  prohibited (Jooble/Neuvoo/Google Jobs/LinkedIn); locationRestrictions empty =
  worldwide; pubDate/expiryDate are Unix-ms in the schema, ISO in the prose — a
  contradiction, a live smoke test at the adapter is mandatory.
- Site ToS: a broad prohibition of automated data gathering «without prior written
  approval»; there is no attribution mechanism instead of permission. Tension with the
  API documentation; the written channel of both pages — hi@himalayas.app (also for
  raised limits).
- Recommendation to the owner: before approve — request written confirmation (option 2);
  or approve under the API terms with the matrix:
  fetch/cache/store/derive/publish_excerpt allowed (attribution+backlink),
  publish_full_text/direct_apply/ML/AI/email/seo/syndicate/ train/bulk denied,
  apply_route=source_required, retention 720h + expiryDate, polling 86400s. The decision
  and approve are the owner's only.

## Actual results of S0-001 (2026-09-24, Node v26.7.0, npm 12.0.2, Windows)

| Command | Result | Exit |
|---|---|---|
| `npm run setup` | a private `.env` created (fixture mode), no secrets printed | 0 |
| `npm run check:offline` | tokens (100 aliases), guardrails, 30/30 unit | 0 |
| `npm install` | 48 packages; a real `package-lock.json` created by npm | 0 |
| `npm audit` | 0 vulnerabilities | 0 |
| `npm run check` | 30/30 unit + Biome (43 files) + `tsc --noEmit` | 0 |
| `npm run build` | Next 16.3.6 (Turbopack), 11 routes, static output generated | 0 |
| `npx playwright install chromium` | Chromium headless shell 151.0.7922.34 | 0 |
| `npm run test:e2e` | **24/24** at 320/390/1440, port 3100 | 0 |
| `docker compose up -d --wait db` | PostgreSQL healthy at 127.0.0.1:54329 | 0 |
| `npm run db:migrate` (x2) | 1 migration; a repeat — 0 applied | 0 |
| `npm run db:seed` (x2) | 8 records; a repeat — 0 changed (idempotent) | 0 |
| `npm run test:db` | 3/3 integration on a separate `atlas_starter_test` | 0 |
| `docker compose stop db` | the container stopped, the volume preserved | 0 |

Acceptance of S0-001: items 1–6 are done and really verified; item 7 — the owner
accepted S0 (2026-09-24, «принимаю» («I accept»)).

## Repair cycle 1/2 (the only one used)
The E2E "keyboard reaches skip link and labeled search" failed: the expectation
`toHaveCount(1)` for q=SQL contradicted the deliberate substring search of
`selectCatalog` (`src/domain/job.ts:72`): «SQL» matches both cobalt-data (skills: `SQL`)
and north-backend (skills: `PostgreSQL`). The E2E scenario expectation was fixed to 2
cards (`tests/e2e/catalog.spec.ts:50`); the domain did not change — it is pinned by unit
tests. The hypothesis was recorded with `npm run task -- repair` before the repair,
counter 1/2.

## File changes
- `.nvmrc`, `package.json` (engines) — the owner's Node 26 decision.
- `package-lock.json` — created by npm, not by the model.
- `tests/e2e/catalog.spec.ts` — repair of cycle 1.
- `tsconfig.json` — the Next build itself added `.next/dev/types/**/*.ts` to include.
- `.env` — created by setup; `TEST_DATABASE_URL` filled from `DATABASE_URL` (database
  `atlas_starter_test`) without printing the secret; `DATA_BACKEND` remained `fixture`.
- `tasks/current.json` — status → `implemented`, счётчик_cycles preserved (1/2).

## Boundaries and what was not done
- Checking the postgres mode of the web application (`DATA_BACKEND=postgres` in dev) — a
  deliberate owner step per the README; qualified by the test:db integration tests.
- WCAG audit, pen test, load, restore, npm-registry digest verification — not performed.
- AI/live sources/uploads are off; there are no network AI calls. Git was initialised
  2026-09-24 (main, commits f1f2ab7, 7c5a404); after S1-001 there are no new commits —
  the S1 changes await the owner's review.
- Coding-host spend: unknown.

## Rollback
`docker compose stop db` was executed. To delete the consequences: delete
`node_modules/`, `.next/`, `package-lock.json`, `.env`; `docker compose down -v` — only
by owner decision.

## After acceptance of S1-001
The Himalayas live adapter (after policy approve: fetch, polling, DB storage of
snapshots) or S2 — a manual profile → explainable matching → saving (by owner decision).

| Area | Code | Actual verification |
|---|---|---|
| Pure rules of the synthetic catalog, config/source gate | Implemented | 30/30 unit, guardrails |
| Nenaugad UI / Next pages and routes | Implemented | build + 24/24 Playwright E2E |
| PostgreSQL migrate/seed/repository | Implemented | migrate/seed x2, 3/3 integration |
| Playwright scenarios | Implemented | Real Next, 320/390/1440 |
| Domain contracts SourcePolicy/JobSnapshot, import, projection (S1) | Implemented | 9/9 new unit per S1 acceptance |
| Live source adapter (fetch/polling/DB) | Not implemented | Requires policy approve + review |
| Runtime AI | Not implemented | Disabled gate, not a generator |
| Auth, profile, upload, letters | Not implemented | Do not accept real data |
| Budget ledger / worker | Not implemented | Mandatory before activation |
| Production / beta | Blocked | Require an owner decision |
