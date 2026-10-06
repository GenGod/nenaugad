# Open gaps in the functionality that already exists (inventory)

Date: 2026-10-01. Compiled by three independent audits (code; documents; task
files) and checked by hand where the cost of a mistake is money, rights or data.
Every row carries evidence (`файл:строка`), because this list will
be used as a work order, not as an opinion.

**How to read it.** Sections A–C are gaps and defects. Section D is deliberately
deferred measurements (not defects, but not «сделано» [done] either). Section E is what awaits
**an owner decision**, not work. F–G are discrepancies of the documents with the code and
repository hygiene. Future phases (B3–B6, C*, D*) that were never started
are not included here: they are backlog, not a gap.

---

## A. Red flags: money and rights

**Status as of 2026-10-02: A1–A8 are closed** (tasks AI-004…AI-007), **and section B is closed
almost entirely** (campaign BFIX-001): B1–B8, B10, B12, B14–B20, B22 are closed;
B9, B11, B13, B23 are deferred with a reason. What exactly is closed is in the headings below; the bodies
of the items are kept as a record of what the defect was and what exactly closed it.
The items of section E (owner decisions) remain open.

### A1. ~~`LIVE_AI_ENABLED=false` — not a switch~~ — **closed 2026-10-01, [AI-007](../tasks/AI-007-owner-decisions-2026-10-01.md)**
- **Fact:** `OPENAI_API_KEY` is **present** in the environment (verified: the value was not
  printed, only presence and a plausible length), `LIVE_AI_ENABLED=false`.
- **Mechanism:** `readConfig` rejects a non-empty `LIVE_AI_ENABLED` (`src/server/config.ts:21-25`),
  but the live path depends not on it, but on the presence of a transport: `dispatchWithPrompt`
  passes `transport: openAiTransport` to the gateway (`relevance/route.ts`), the transport
  reads `process.env.OPENAI_API_KEY` (`src/server/ai/openai-transport.ts:18,31`).
  The flag «выключено» [off] turns nothing off.
- **Why this matters:** AGENTS.md requires the opposite («A key in the environment is not
  approval», «Real AI cannot be enabled by changing an env flag»). Here it is the other way round:
  the key is the switch, and the flag is decoration.
- **Done (AI-006 + AI-007):** the unguarded batch path is closed, and the flag has become
  a switch: `readConfig` reads `LIVE_AI_ENABLED` (`"true"` — on,
  absent/`"false"` — off, anything else — fail-closed), the gateway checks it first,
  before purpose, ceiling, budget and transport. A key in the environment no longer
  turns anything on. For the owner: `.env` holds `false`, so live calls refuse until
  it is set to `true`. LIVE_SOURCES deliberately did not get a flag — the source policies
  are the control.

### A2. ~~An unapproved purpose spends real money~~ — **closed 2026-10-01, task [AI-004](../tasks/AI-004-purpose-job-matching.md)**
- **Was:** `approvedPurposes: ["cover_letter"]` (`src/server/ai/provider.ts`), while the
  relevance path substituted `job_matching`; the gateway did not check purpose at all,
  `isPurposeApproved` was called nowhere outside tests.
- **Done:** the owner approved `job_matching` on 2026-10-01. The whitelist is now
  checked by the gateway **before** reading the budget (`PurposeNotApprovedError`), the spend
  bucket and the attempt counter are derived from the purpose (`PURPOSE_TASK_TYPE`), so
  they cannot be mismatched; an unapproved purpose creates neither an
  `ai_operations` row nor a hold. Tests: `tests/unit/ai-provider.test.ts`,
  `tests/integration/ai-guards.test.ts`.
- **Remains (not closed by this):** the gate itself appeared in AI-005 (2026-10-01):
  `send_to_ai_provider` was granted to all three sources, and `maySendTextToProvider`
  is asked in four places that send text out, so revoking
  the grant now really stops the flow. What remains open is **something else**:
  purpose approval and a source grant are permissions, not safeguards;
  the money protections of the batch path (A3) are still absent, and the privacy of the candidate's
  profile (the profile text goes to the provider) has not been closed by a separate decision.

### A3. ~~The batch path goes to the provider past all safeguards~~ — **closed by switching it off 2026-10-01, task [AI-006](../tasks/AI-006-c0-part-1.md)**
- **Was:** `src/server/ai/openai-batch.ts` created its own OpenAI client;
  calls from the relevance route and the queue went past `executeGuardedOperation` — without
  a reserve, an `ai_operations` row, an attempt counter, a deadline and `uncertain`
  handling; source rights were not asked; the switch was the raw
  `process.env.OPENAI_API_KEY`.
- **Done:** the path is **closed** (brief §C0 part 1 allows «отключить до завода» [switch it off before wiring it in]).
  The module no longer imports the provider SDK at all — `submitBatch`/`checkBatch`/
  `retrieveBatchResults` throw `BatchDisabledError` before any client is created, —
  the route answers `503 BATCH_DISABLED` with a reason, the queue short-circuits.
  `scripts/guardrails.mjs` now statically allows the provider SDK only in
  `src/server/ai/openai-transport.ts`, so a home-grown client wrapper will not come back
  silently. The re-enablement plan (reserve at submit, settlement at retrieve,
  a term for the asynchronous operation, a ceiling for the batch, server-side mapping) is recorded in
  `openai-batch.ts` and in AI-006.
- **Price:** automatic background scoring is off — `submitRelevanceBatch`
  sends nothing any more. Scoring remained in the guarded synchronous path.

### A4. ~~The reserve is not an upper bound~~ — **closed 2026-10-01, [AI-006](../tasks/AI-006-c0-part-1.md)**
- **Was:** 1200 input / 400 output tokens were reserved
  (`relevance/route.ts`), while the provider was asked for `max_completion_tokens: 8192`
  (`openai-transport.ts:52`); letters reserved 1500/3000 with the same discrepancy.
- **Done:** `reservationFor(prompt)` in `provider.ts` — the input is bounded by the number of
  prompt characters (an upper bound for any tokenizer, valid for
  Cyrillic too), the output — by the transport's hard maximum. Applied in both paying
  places; the invariant «резервируется максимально допустимый путь» [the maximum admissible path is reserved] is true again and
  is covered by a test for monotonicity and for hitting the operation ceiling.

### A5. ~~The user quota is not set up, the operation ceiling is not compared~~ — **closed 2026-10-01, [AI-007](../tasks/AI-007-owner-decisions-2026-10-01.md)**
- **Was:** the owner's budget row was not created, and its absence meant «нет
  персонального потолка» [there is no personal ceiling]; the operation ceiling was printed by the seed script and was compared
  with nothing.
- **Done:** the owner's quota is **$1/month** (decision 2026-10-01) and it is created at
  registration in the same transaction as the user; `seed:budgets` backfills
  the existing ones; a missing row is a refusal `OWNER_BUDGET_MISSING`; the operation ceiling
  is compared in the gateway (`OPERATION_CEILING_EXCEEDED`). Along the way a bug was fixed in
  `ensureBudget`: the `ON CONFLICT` target did not catch the PK conflict of the global row
  (`owner_id = NULL`), so a repeated seed failed instead of being idempotent.
- **Remains:** `period = 'monthly'` is stored, but there is no calendar reset of the window —
  the ceiling applies cumulatively.

### A6. ~~Money can «зависнуть» [get stuck] in `uncertain` forever~~ — **closed 2026-10-01, [AI-007](../tasks/AI-007-owner-decisions-2026-10-01.md)**
- **Was:** `cancelOperation` was not called from product code, and there was no reaper;
  holds accumulated until they would eat the budget.
- **Done:** `npm run ai:holds` — a list of operations that hold money (id, type,
  status, attempts, amount, age) plus budget rows as the source of truth;
  `--cancel=<operationId>` releases **one named** hold. The decision deliberately stays with
  a human: releasing a hold means asserting that the provider did not charge,
  and automation could err in that direction. There is no journal of manual decisions yet.

### A7. ~~Idempotency does not work as claimed~~ — **closed 2026-10-01, [AI-006](../tasks/AI-006-c0-part-1.md)**
- **Was:** the key contained `Date.now()`, so every retry was a new paid
  operation, and the persistent attempt counter did not accumulate on this path.
- **Done:** the key is content-addressed — sha256 of the profile version and
  the sorted set of chunk post ids (`chunkOperationKey`). A repeat finds the same
  operation; terminal repeats (`WRONG_STATE`, `IDEMPOTENCY_COLLISION`)
  are recognized and skipped as `duplicateChunks`, instead of being paid for again.
  Covered by an integration test: a repeat does not call the transport, `settled_minor`
  stays 300, `held_minor` = 0. The input hash in `spending.ts` is still computed
  from the task type only — that is a separate (weaker) layer, and it is noted here,
  not hidden.

### A8. ~~Working-DB defect: 12 of 700 `job_snapshots.id` are unreachable by primary key~~ — **healed 2026-10-01, [AI-007](../tasks/AI-007-owner-decisions-2026-10-01.md)**
- **Was:** an index lookup returned 0 where a scan found the row (12/700); for these
  records saved, hidden, letters and FK inserts did not work.
- **Done:** `REINDEX TABLE job_snapshots` (65 ms) + `REINDEX DATABASE atlas_starter`
  (152 ms, insurance for the indexes that were not checked by name); the reachability
  audit — **0 unreachable out of 2182**; `npm run embeddings:index` picked up
  12/12 vectors (for himalayas 498/498).

---

## B. Gaps in the shipped functionality (by code)

| # | What is not finished | Evidence |
|---|---|---|
| B1 | ~~**Click reports are not wired up**~~ — **closed 2026-10-02 (BFIX-001):** the main link of the matching card journals a click (`src/components/click-reporter.ts`, `tracked-job-link.tsx`). The catalog feed keeps no journal at all — that is part of question B23 | — |
| B2 | ~~**`propensity` in the product is always NULL**~~ — **closed:** computed on the server when the impression is recorded, from the cached scores the feed is sorted by (best batch score → 1); without a score — an honest NULL | `src/server/events-service.ts` |
| B3 | ~~**The journal labels stayed `v0-*`**~~ — **closed:** server-side versioned feed-order labels (`src/domain/feed-order.ts`: `feed-ai-score-then-catalog@1`, `feed-catalog-order@1`); the client picks the feed from a closed set | — |
| B4 | ~~**`showNeedsReview` is not applied on any read path**~~ — **closed:** with the flag off the tab is not rendered, `?tab=review` falls into match (`resolveFeedTab`) | — |
| B5 | ~~**Vacancy requirements are not shown in the UI**~~ — **closed:** `MatchedJob.requirements` and the «Требования вакансии» [Vacancy requirements] block in «Основание» [Basis] (must/nice, verdicts, «не хватает» [missing]) | — |
| B6 | ~~**The role boost is a substring match**~~ — **closed:** word boundaries + documented head synonymy (developer≈engineer); measured gain NDCG@5 0.914→0.919 · NDCG@10 0.916→0.920, the ratchet thresholds were raised | `src/domain/match-ranker.ts` |
| B7 | ~~**The ghost marker exists only in the matching card**~~ — **closed:** `readSnapshotCards` carries closure, `SnapshotCard` draws the same honest marker | — |
| B8 | ~~**The «На чём основано» [What it is based on] panel is not rendered**~~ — **closed:** the panel is on the letter page (profile roles and country, vacancy or general mode) | — |
| B9 | **Letter repair loop** — **deferred 2026-10-02:** letters are closed by the personal data boundary (`PERSONAL_DATA_BOUNDARY`) until a local model; code without a reachable consumer is forbidden by the project rules | `src/server/ai/personal-data-boundary.ts` |
| B10 | ~~**Side-by-side version comparison and tab-conflict protection (If-Match)**~~ — **closed:** GET returns ETag `"version"`, PATCH accepts `If-Match` (a miss → 412), in the UI — «Сравнить» [Compare] with two panels | — |
| B11 | **There is no account deletion** — **deferred 2026-10-02:** deletion is a high-risk zone (AGENTS.md), a separate review and owner acceptance are required | S2-001 «Не входит» [Not included] |
| B12 | ~~**The DST-accurate arithmetic of the 12-month window is not done**~~ — **closed:** TIME-01 samples the 15th of each month of the reference year (`RULESET_VERSION` 3); the Ramadan shift is now unknown, not a false pass | `src/domain/matching.ts` |
| B13 | ~~**Jobicy without vectors**~~ — **closed 2026-10-02 (owner decision No. 4):** the `process_with_ml` right was granted after re-reading the Fair Use; jobicy policy v4→v5, `npm run embeddings:index -- --source=jobicy` indexed **202/202** posts, the dense leg covers the source | — |
| B14 | ~~**`/api/health` and `npm run doctor` report untruths**~~ — **closed:** actual values (`auth: "implemented"`, `uploads` from config, `realSources`); doctor became testable (`doctorReport`) | — |
| B15 | ~~**`src/server/ai/README.md` claims AI is not connected**~~ — **closed:** the README was rewritten for the actual contour (gateway, transport, boundary, batch closed, operations) | — |
| B16 | ~~**`scripts/smoke-ai.ts` is not wired into any npm script**~~ — **closed:** `npm run smoke:ai` (creates its own budget rows; refuses without `LIVE_AI_ENABLED=true`), mentioned in `src/server/ai/README.md` | — |
| B17 | ~~**Dead code promising functionality**~~ — **closed:** `Unavailable`, `disabled.ts`, `registeredRankerIds`, `RANKER_VERSIONS`, `describeLocalArtifact`, `embeddingCacheKey`, `resetOpenAIClient` were removed; `isOpenAIConfigured` is no longer exported | — |
| B18 | ~~**Errors are swallowed where it hides a failure**~~ — **closed:** the worker logs `attemptRecorded`, a submit failure in the profile route is logged; the batch's eternal retry remains in the closed (unreachable) path and is part of the re-enablement plan | — |
| B19 | ~~**`totalCostMicroCents` is always «0»**~~ — **closed back in [AI-006](../tasks/AI-006-c0-part-1.md):** the cost is returned from the settled sum of the ledger; the only remaining «0» is the «всё из кэша» [everything from cache] path, where there was no call | — |
| B20 | ~~**`propensity` and `rankerVersion` in the journal are accepted from the client as is**~~ — **closed:** a payload with `propensity` is rejected (400), the label is taken by the server from the feed key (B3) | — |
| B21 | ~~**`custom_id → snapshot_id` is taken from the request body**~~ — closed together with the batch path in [AI-006](../tasks/AI-006-c0-part-1.md): writing the results is unreachable (503), so the client can no longer choose which vacancy gets which score. On re-enablement the mapping is kept on the server (as the queue already does in `ai_batch_queue.custom_id_mapping`) | — |
| B22 | ~~**CV reading and deletion are available with `UPLOADS_ENABLED=false`**~~ — **closed:** a shared gate `uploadsDisabledResponse` on all four CV handlers + a static check in `scripts/guardrails.mjs` | — |
| B23 | ~~**The ranker, seen-set, requirements and dedup are not in the product path**~~ — **closed 2026-10-02 (owner decision No. 4, task B23):** `/matched` sorts by the shipped ranker v4 (measurement: NDCG@10 **0.892** vs **0.421** for the catalog order); hides feed the preference downgrade, closure — ghost; the journal writes the ranker version; the shadow — champion v4, the candidate is optional | — |
| B24 | ~~**Jobicy geography ignores the posting text**~~ — **closed 2026-10-06, [B24-001](../tasks/B24-001-jobicy-text-geography.md):** a worldwide `jobGeo` label is now tested against the description and excerpt (`src/server/import/geography-text.ts`). A residence rule narrows it to the named countries, or leaves them unknown when it names a region or a state; an explicit exclusion keeps worldwide minus those countries. The label and the text both stay as evidence, and `geography-source-vs-text` is recorded. Country and region labels are unchanged. Over the 202 local jobicy posts no record changes: all five "Anywhere" posts say worldwide in their text too | — |
| B25 | ~~**Jobicy country labels lose their countries**~~ — **closed 2026-10-06, [B25-001](../tasks/B25-001-jobicy-country-labels.md):** a `jobGeo` label is read part by part through the shared country dictionary (`countryCodeOf` in `src/server/import/geography-text.ts`). A label of countries only is the complete list ("Canada, USA", "Portugal"). By owner decision, a label that also names a region ("EMEA, LATAM, Canada, USA") keeps its countries as an incomplete list (`exhaustive: false`), and GEO-01 now reads completeness: a named country passes, anyone else is `unknown`, never `fail` (`RULESET_VERSION` 4). The card says the list is incomplete, and dedup keeps such a list apart from the complete one. Over the 202 local jobicy posts exactly the 52 labels change (43 complete lists, 9 incomplete); the 12 region-only labels stay unknown, and no stored snapshot of either source changes its GEO-01 outcome | — |
| B26 | **The himalayas text check is narrower than it looks** — found 2026-10-06 by B24-001. One pattern, "must be based in" plus one or two capitalized single words: "must reside in the US", "open to candidates based in" and every multi-word country are missed, and "United States" in its map can never match. Today it is inert: the shared detector finds no contradiction in any of the 31 worldwide himalayas posts. Moving himalayas onto `readTextGeography` changes its catalog, so it is a separate task | `src/server/import/himalayas-fixture.ts:88` (`RESTRICTED_COUNTRY_PATTERN`) |
| B27 | ~~**Himalayas location restrictions never reach GEO-01**~~ — **closed 2026-10-06, [B27-001](../tasks/B27-001-himalayas-location-countries.md):** each `locationRestrictions` entry resolves to a country by its name through the shared dictionary, or else by a well-formed `alpha2` code, and goes into `allowed_countries`. A list with an unresolved entry is incomplete (the B25 rule). A non-empty list never becomes worldwide: the old code dropped an entry without a name, so `[{}]` mapped to worldwide. The names stay the region text and become the evidence quote; `allowed_subdivisions` is empty. Re-mapping the 498 local posts changes exactly the 466 with restrictions (460 complete lists; 6 hold names outside the dictionary, and the stored data has no codes). GEO-01 moves only from unknown to pass or fail, and the 7 wrong dedup groups split. Stored records keep the old mapping until an import re-reads them | — |
| B28 | **A geography-only re-map re-pays extraction and re-embeds unchanged text** — found 2026-10-06 by B27-001. The import fingerprint covers the whole snapshot (`src/server/import/pipeline.ts:39`), so a mapping change that touches only geography (B24, B25, B27) gives a record a new version and content hash. The paid extraction ledger keys on `snapshot_version`, and the worker's pass extracts every version it has no row for (`scripts/worker.ts:88`): once live AI is on, each such re-map pays again for the same title and description, against the ledger's own rule "never a silent re-charge of the same input" (migration 0019). The budget caps bound it, but do not prevent it. The embedding index also re-embeds on any `content_hash` change although its text is the title and description only (local CPU, no money). Today nothing is paid: live AI is off and `job_llm_fields` is empty | `src/server/ai/extraction-service.ts:47`, `src/server/embeddings/embedding-service.ts:138` |

---

## C. Promised by a later task and not done (provenance in the task files)

| # | Promise | Who promised | State |
|---|---|---|---|
| C1 | Requirements cache («кэш — задача A10» [cache — task A10]) | A2-001 item 2 | A10 is done, there is no cache: `grep cache src/domain/requirements.ts` → empty |
| C2 | Wiring the ranker into the product path | A2-001, A6-002 item 1, A9-001 item 1 | Not done; owner decision No. 11 keeps AI sorting. The gates (A9) are ready |
| C3 | Replacing the `v0` journal label with a versioned ranker | A6-001 item 4 (promised in A9) | Done 2026-10-02 (BFIX-001): server-side feed-order labels (B3) |
| C4 | `propensity` not NULL in the product | A8-001 item 2 (promised in A10) | Done 2026-10-02 (BFIX-001): server-side computation (B2) |
| C5 | Client-side sending of impressions and clicks | A8-001 item 1 | Impressions — done (A6-001); clicks — done 2026-10-02 (BFIX-001, B1) |
| C6 | Displaying requirements in the UI (the data is ready) | A2-001 item 5 | Done 2026-10-02 (BFIX-001, B5) |
| C7 | Evidence panel in the letter | S4-002 acceptance 3 | Done 2026-10-02 (BFIX-001, B8) |
| C8 | Letter repair loop (beta gate) | S4-001/S4-002 «Не входит» [Not included], SAFETY_GATES:9 | Not done (see B9) |
| C9 | DST-accurate window computation | S2-001 «Не входит» [Not included] | Done 2026-10-02 (BFIX-001, B12) |
| C10 | Account deletion | S2-001 «Не входит» [Not included] | Not done (see B11) |
| C11 | Near-dup deduplication (the embedding part) | A4-001 «Не входит: B5» [Not included: B5] | Done 2026-10-04 (B5-001): the rule (text+title+geo-veto) and a CLI queue, the thresholds are measured; there are no cross-source pairs in the local catalog right now |
| C12 | Survival model instead of age heuristics | A5-001 «Не входит: B6» [Not included: B6] | Done 2026-10-04 (B6-001): hazard window + buckets + an honest line, behind guardrails; the constants are provisional — there are no observed closures in the catalog yet, the structure and the synthetic tests are ready for a re-fit |
| C13 | ESCO for the skills reference | A3-001 item 4 | Done 2026-10-04 (ESCO-001): the skills part is connected — 50 canon links, the v3 alias delta, attribution in the footer; there are no RU labels in ESCO |
| C14 | Event journal retention | A8-001 item 3, A6-001 item 3 | Done 2026-10-02 (decision No. 4 + RET-001): TTL 12 months, a purge pass in the worker |
| C15 | Retention of closed source records | S1-005 «Не входит» [Not included] | Done 2026-10-02 (decision No. 4 + RET-001): a tombstone without text instead of deletion |
| C16 | Digest frequency cap | A7-001 item 2 | Not done (there is nothing to limit yet — there are no sends) |
| C17 | Digest email channel | A7-001 item 1 | Impossible: `send_email` denied in all matrices |

---

## D. Deliberately deferred measurements and constants (not defects, but not verified either)

**Update 2026-10-02 (DGAP-001).** What can be closed by measurement has been closed:
the set's coverage gaps and the cross-language/semantic measurement. The rest by its own
nature awaits data, a second machine or a product decision — and that is named.

- **Constants chosen by judgement await data:** the freshness half-life
  (`A5-001` item 1), the negative-preference thresholds −12/−6 and «стек ≥4» [stack ≥4] (`A6-002` item 2),
  the ghost weights −20/−25 (`A10-001` item 2), the BM25-in-DB switchover threshold (5000, `bm25.ts`).
  *Data collection is now possible: the journal writes clicks and the server-side propensity since
  2026-10-02 (BFIX-001); changing the constants — after accumulation, not before.*
- ~~**Set coverage**~~ — **closed 2026-10-02 (DGAP-001):** set v4 (39
  vacancies) added a vacancy with an *unspecified* geography (`golden-j35`, GEO-01
  unknown by the metric), two cross-language semantic pairs without Latin script
  (`golden-j36/j37`) and a second freshness twin pair at another age and profile
  (`golden-j38/j39`); the ratchet thresholds were rebased with a recorded reason.
- ~~**Cross-language quality is not measured**~~ — **measured on a live model:** BM25
  does not find the semantic cases at all (uncovered), dense finds them and places them in
  the middle (`golden-j37` #6 for p-qa-us, `golden-j36` #15 for p-ru-ml); the aggregate
  for set v4 — dense NDCG@10 0.766 · BM25 0.810 · fused 0.771 · **v4 0.892**,
  «не переключать» [do not switch] confirmed on the grown set. There is still no language field in the profile
  — that is a product question (language filter), not a measurement.
- ~~**The semantic case is not checked on a real model**~~ — **checked:**
  «Инженер по машинному обучению» [Machine Learning Engineer] (j36) and RU QA (j37) have not a single
  Latin token, BM25 does not match them in principle, dense reaches them (the numbers above);
  the v4 ranker places them #12/#11 respectively. The full report is DGAP-001.
- **Single-machine measurements:** unchanged — p95 on one profile and 46
  vacancies (`A9-001` item 3), `eval:shadow` on fixtures (`A9-001` item 4), the champion in
  the shadow — the catalog order (`A9-001` item 5); closed by a second machine and traffic.
- **Impressions E2E:** e2e runs on the fixture backend (`playwright.config`:
  `DATA_BACKEND=fixture`), where the feed is honestly empty, — impressions are physically not
  sent there. A minimal closure was done: the payload of both reports is pinned
  by a unit test (`tests/unit/journal-payloads.test.ts`); e2e on a real backend is
  a separate infrastructure task (a postgres profile for Playwright).
- **Cost and hardware:** unchanged — re-indexing ≈ 30 min CPU; ONNX KV outputs
  eat memory in batches (`B1-001` items 3-4); `onnxruntime-node` without
  postinstall (`B1-001` item 5); a 625 MB artifact outside git.
- **BM25 computes df over the query pool** (`B2-001` item 5) — deliberately, the break-even threshold
  is recorded; on set v4 it is confirmed that of the two legs BM25 alone is stronger than
  the fusion (0.810 vs 0.771), and the weight grid does not change that conclusion.
- **Letters:** the replacement of the `S4-002` acceptance-4 copy («Заполнить профиль» [Fill in the profile] →
  «Понятно, правлю вручную» [Got it, I'll edit it manually]) — is deliberate, recorded in the status; it requires no code.

---

## E. Awaiting an owner decision (not the implementer's work)

Closed by the 2026-10-01 decisions: the purpose `job_matching` (AI-004), the
`send_to_ai_provider` grants (AI-005), the fate of the batch path — closed until it is brought behind the gateway
(AI-006), the key in the environment — it stopped being a switch, the flag became one (AI-007),
the $1/month quota and the operation ceiling (AI-007), candidate privacy — «всё внутри
контура» [everything inside the contour] (AI-007), `REINDEX` (AI-007).

**Closed by the 2026-10-02 decisions (batch No. 4,
[docs/design/2026-10-02-owner-decisions-04-batch.md](../docs/design/2026-10-02-owner-decisions-04-batch.md)):**
the feed switches to ranker v4 (measured: NDCG@10 0.892 vs 0.421 for the catalog
order) — implementation by task B23 (**executed**); the batch path and scoring remain
closed until a local generative model, the task evaluating it is **executed**
(MODEL-001: on this machine and CPU runtime the 1.5–1.7B candidates do not
serve the rubric — 0/6 valid JSON without a wrapper, Spearman −0.156 with prefill;
the GPU runtime is a separate owner decision);
`process_with_ml` for jobicy was granted (policy v4→v5 after re-reading the Fair Use,
`embeddings:index --source=jobicy` indexed 202/202 posts — B13 is closed);
retention — the journal for 12 months + a tombstone for closed records (task RET-001,
**executed**: migration 0018, anonymization instead of deletion, revival on
re-listing, a purge pass in the worker).

Remaining:

1. **Written confirmation from himalayas** (`hi@himalayas.app`, recommended) —
   an owner action, not the implementer's.
2. **Hide reason codes and structural «не показывать компанию X» [do not show company X] filters** (item 6) —
   **owner decision 2026-10-02: leave as is** (vacancy hiding +
   weighted downgrade of the neighbourhood already work); revisit as data accumulates.
3. **ESCO** (item 5) — the terms were **read verbatim** (handbook §5, extracted from
   the official PDF 2026-10-02): the mandatory attribution «This service uses the
   ESCO classification of the European Commission.» + «Any modified or adapted
   version … must be clearly indicated as such»; the occupations part — ISCO/ILO
   («with permission»), the skills part — EU (Decision 2011/833/EU).
   **Owner decision 2026-10-02: connect the skills part** — task
   [ESCO-001](../tasks/ESCO-001-import-skills.md). **Executed 2026-10-04:**
   artifact v1.2.1 (13 939 skills) with sha256 pins and `--check`/
   `--propose` modes, 50 canon links + the v3 alias delta (neutral on the golden
   set), attribution in the footer and in `docs/DEPENDENCIES.md`. A clarification: ESCO
   **has no Russian language** — the RU part remains the project's own work.
4. **Email channel** for alerts (item 7) — **owner decision 2026-10-02: stays
   in-app**; email is a separate task later (`send_email` denied in the matrices).
5. **Retention/limits, thresholds and weights** from section D — as data appears.

## F. Documents versus code (stale claims)

**Closed 2026-10-02 (FDOC-001):** all the listed documents were brought in line with the code.
Historical records were not rewritten — where a document recorded the state of the environment
or the decisions of a stage, «устарело/выполнено позже» [stale/done later] notes were added with references.
The rows are kept as a record of where the documents diverged from the code.

| Document | What it claimed | What was done |
|---|---|---|
| `docs/ARCHITECTURE.md:45,19,9-12` | «AI/profile/upload не реализованы» [AI/profile/upload are not implemented]; «любой live/production флаг отклоняется» [any live/production flag is rejected]; «unit не имитируют идемпотентность» [the unit tests do not simulate idempotency] | An ADR update at the top + «устарело 2026-10-02» [stale 2026-10-02] notes in place; the ADR decisions were not changed |
| `docs/SAFETY_GATES.md:5-9` | CV / Paid AI / letters — «Не реализовано» [Not implemented] | The status column was rewritten to match the facts; the gates themselves were not changed, the beta is still not accepted |
| `README.md:9-10,32,139` | «auth, CV, реальные источники, платный AI не реализованы» [auth, CV, real sources, paid AI are not implemented] | The README was brought to the actual state (header, delivery boundary, «что в коде» [what is in the code], structure, checks, CI) |
| `AGENTS.md:22` | «No authentication, CV upload, live source, paid AI, financial ledger or worker yet» | The «What exists» paragraph was updated; the file's rules were not touched |
| `reports/COVERAGE.md:11-15` | privacy/upload, budgets, letters — «Не реализовано» [Not implemented] | The table was rewritten to match the facts; «не реализовано» [not implemented] remains only for restore (SP-T22) |
| `reports/DELIVERY.md:23-28` | the lockfile was not created, lint/build/test:db were not run | The preparation environment is marked as lifted (installation and checks performed, S0 accepted); the record is kept |
| `docs/DEPENDENCIES.md:5-18` | there are no rows for `next-auth@4.24.15` and `openai@7.23.0` | The rows were added with decision-based justifications |
| `src/server/ai/README.md:1-4` | «AI ещё не подключён, нет SDK и сетевых вызовов» [AI is not connected yet, there is no SDK and no network calls] | Fixed earlier in B15 (BFIX-001) |

Additionally (outside the table): `START_HERE.md` received a status header — it remains
an archived record of the first day, but no longer looks like a description of the current code.

---

## G. Repository hygiene

- ~~**Uncommitted** (on the branch `feature/A1-golden-set-eval-harness`): decision No. 2 and
  the terms fingerprint (from the previous session), migrations 0016/0017, group B (B1-001,
  B1-002, B2-001) and decision No. 3, plus a one-line edit in `scripts/eval-shadow.ts`.
  `npm run check` is green in the tree (229/229, biome, tsc).~~ — **closed
  2026-10-01**: everything is committed (`48d991f`, `d3b992f`, `95501f9`) and pushed to
  `origin/main`; the `main` working tree is clean (except the ignored `models/`), the branch
  was renamed to `main`. Per the last commit's report: `check` 235/235, `test:db`
  55/55, `build` 0, `e2e` 96.
- **`next-env.d.ts`** was rewritten by Next during a dev/e2e run (`.next/types` →
  `.next/dev/types`); the file is generated.
- **Dead exports and unwired scripts**: see B16, B17 — half of them
  promise functionality that does not exist (these are precisely the «заглушки» [stubs]), half are simply
  needed by no one.
- **Test-DB migration registry entry**: the row `0017_job_embeddings.sql` was
  deleted once from `atlas_schema_migrations` of the isolated test DB, because
  the migration file was edited after it had already been applied (the migration is not released). The working
  DB is not affected, 0017 was not applied to the working DB.
- **Disk cost**: `models/` ≈ 625 MB (in `.gitignore`), `node_modules`
  grew by `@huggingface/transformers` + `onnxruntime-node` + `sharp`.
- **`migrations/0005_import_attempts.sql`** is named «import_attempts», but creates no such
  table — it only adds columns to `import_state`.

---

## H. What deliberately is not in this list

B3 (reranker — decision No. 3 was taken; C0-part 1 is closed by AI-006, the input is **measured 2026-10-04**
([tasks/B3-001](../tasks/B3-001-reranker-input-measurement.md): the best input is the ranker
order, «после RRF» [after RRF] is not confirmed); the `send_to_ai_provider` grants were issued by AI-005;
awaiting owner decisions — purpose, profile privacy, quota/ceiling (§9 of the doctrine of
decision No. 3)),
B4 (NLI pre-check — **evaluated 2026-10-04 with a negative result**:
[tasks/B4-001](../tasks/B4-001-nli-precheck.md); a re-attempt — together with C2),
C1 (LLM field extraction — **executed 2026-10-04** (C1-001 + C1-002), the purpose
`extraction` was approved: validator + provenance record + guarded service + a pass
wired into the worker and the import scripts; **the live run awaits the owner enabling
`LIVE_AI_ENABLED`**; the CV part is a separate task), C2–C3 (LLM phases),
D2/D5/D7
(Rocchio/MMR, trained EV, OPE), source Category B taxonomy/filters,
paid Bearer and affiliate at jobicy, OCR and AI extraction from CVs, public deploy,
a branch of code outside `src`/`scripts` outside the repository. These are future phases: they
were not started and were not passed off as done — unlike the items above.
