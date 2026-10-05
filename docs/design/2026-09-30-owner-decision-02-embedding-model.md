# Draft of the owner's Decision No. 2 (section 7 of the brief): embedding model

Date prepared: 2026-09-30. Branch: `feature/A1-golden-set-eval-harness`.

**Status: approved by the owner on 2026-09-30** — items 1–5 of §6 accepted in full;
Decision No. 1 (vectors: pgvector) was adopted at the same time and recorded in §7.
Applied from what was approved: the `process_with_ml` grant for `atlas-fixtures` and — by
a separate decision of the same day — for `himalayas` (analysis and caveats in §8);
`train_model` and `send_to_ai_provider` remained `denied` for all, and for jobicy
`process_with_ml` is also `denied`. The boundaries of the grants are pinned by the test
`tests/unit/source-contract.test.ts`. `terms_hash` was fixed the same day:
a normalized fingerprint, page snapshots, `npm run terms:check` and the offline test
`tests/unit/terms-fingerprint.test.ts` (§8). What remains: the change of the `compose.yaml`
image to pgvector — with the owner; the jobicy grant — a separate decision; the dependency,
the model artifact, the embeddings contract, the extension of the golden set and the
measurement — task B1. No commit was made.

Basis: [the brief](2026-09-27-matching-implementation-brief.md) (section 7, item 2;
section 5 — the open decision on vectors),
[research](../research/2026-09-26-job-matching-research.md) (part 1 method 4, part 2 A3/A5, D8).

**Scope of this document:** the recommendation, the verified facts and the verification
plan are recorded. It also contains Decision No. 1 (vectors, §7) and the analysis of the
sources' ToS (§8): both grew out of this decision, and without them item 2 is incomplete.
The model has been run by no one: all embeddings checks are `not_run`.

## 1. Recommendation

**A local model; the primary one is `Qwen3-Embedding-0.6B`; the candidate for the shadow
measurement is `microsoft/harrier-oss-v1-0.6b`; the budget reserve is
`ibm-granite-embedding-311m-multilingual-r2`. API (OpenAI, Gemini) is a
measurement baseline, not a production option.**

The reason has three points: the model meets the criteria of item 2 (MRL compatibility and
RU/EN multilingualism) under a commercially suitable license; it works in Node without a
Python service; the private text of the profile and CV does not leave the machine, and the
marginal cost is zero. The price of the API option is negligible here (see §4) — saving
money is not an argument here.

### Candidates (checked 2026-09-30 against the model cards; metrics are self-reported)

| Model | License | MRL | Context | Node/ONNX | Status in the short list |
|---|---|---|---|---|---|
| `Qwen/Qwen3-Embedding-0.6B` | Apache-2.0 | yes, 32–1024 | 32K | yes: `onnx-community/Qwen3-Embedding-0.6B-ONNX` (≈23k downloads) | **primary** |
| `microsoft/harrier-oss-v1-0.6b` | MIT | **not stated in the card** | 32K | yes: `onnx-community/harrier-oss-v1-0.6b-ONNX` | candidate for measurement (MTEB-v2 69.0 for 0.6b) |
| `ibm-granite-embedding-311m-multilingual-r2` | Apache-2.0 | yes, 768→128 | 32K | official ONNX/OpenVINO from IBM | reserve for the CPU budget |
| `deepvk/USER-bge-m3` | Apache-2.0 | no | — | community ONNX only | reserve if Russian text is the bottleneck |
| `ai-sage/Giga-Embeddings-instruct-480M-0826` | MIT | no | — | no ONNX (export required) | reserve, MTEB(rus) 70.98 per the card |
| `jinaai/jina-embeddings-v3` / `v5` | **CC-BY-NC-4.0** | yes | 8K+ | partially | exclude: non-commercial license |
| `intfloat/multilingual-e5-large` | MIT | no | **512** | yes | exclude: truncation of 4.5–6.6k character descriptions |
| `mixedbread-ai/mxbai-embed-large-v1` | Apache-2.0 | — | — | — | exclude: English-only |

Facts about the primary model (card `Qwen/Qwen3-Embedding-0.6B`, checked
2026-09-30): Apache-2.0; «up to 1024, supports user-defined output dimensions
ranging from 32 to 1024»; 32K context; MTEB multilingual Mean(Task) 64.33;
the instruction is on the query side only — «No need to add instruction for retrieval
documents», template `Instruct: {task_description}\nQuery: {query}`.
On harrier: MIT, 0.6b = 1024 dim, 32K, MTEB-v2 66.5 / 69.0 / 74.3 (270m / 0.6b /
27b), the instruction `Instruct: …\nQuery: …` on the query, last-token pooling; MRL is not
mentioned in the card — **consider it unconfirmed until checked**.

A practical consequence for the embeddings contract (card B1): the asymmetry
«profile/CV is a query with an instruction, a vacancy is a document without an instruction»
must be pinned in the code; a silent loss of the instruction on the query side is a
quiet degradation of quality (research part 2 A3), not a failure.

## 2. Verified project facts (2026-09-30)

- **Catalog:** 700 records (himalayas 498 + jobicy 202), `description_language`
  is `en` for all, Cyrillic titles 0. `description_text`: average 4533 and
  6664 characters, p90 7662 and 9849 → about 1–2k tokens per document. Models with a
  window of 512 require truncation or chunking.
- **Golden set (A1):** 34 vacancies × 6 profiles; Russian-language vacancies 4
  (j15, j20, j21, j32) and one profile `p-ru-ml`. The profile language is not modelled —
  this is a recorded limitation (`src/data/matching-golden.ts:25`). There is little
  cross-language material for choosing a model today.
- **Current metrics (run of 2026-09-30, `npm run eval:matching` → exit 0):**
  R@5 0.742 · R@10 0.877 · NDCG@5 0.914 · NDCG@10 0.916 · MRR 1.000; the ratchet floors
  in `tests/unit/matching-eval.test.ts:48-49`.
- **The candidate profile is thin:** `residenceCountry`, `timezone`, `targetRoles`,
  `skills`, `employmentTypes`, availability windows (`src/domain/profile.ts:23-31`);
  `experience`/`education` are empty `readonly unknown[]`. So the query is short and
  the document is long — that very genre asymmetry.
- **Latency:** the p95 ranking budget is 250 ms
  (`src/domain/rank-guardrails.ts:31`) → the profile embedding must be cached by
  `profile_version` (already required by contract B1).
- **Storage:** 700 × 1024 × 4B ≈ 2.9 MB. ANN is not needed today. The
  `postgres:17.11-alpine` image has no `vector` extension: of the checked extensions only
  `pg_trgm` and `unaccent` are available, `vector` and `pg_search` are absent
  (live DB, `pg_available_extensions`, 2026-09-30) → pgvector means changing the
  image in `compose.yaml`, while `float8[]` + exact cosine works without edits. This
  weakens the link to Decision No. 1, but does not cancel it.
- **Source rights (blocker, see §5):** `process_with_ml: "denied"` for
  himalayas (`src/server/source-policies.ts:76`), jobicy (`:130`) and
  atlas-fixtures (`:28`). The spec separates «ML/embeddings» and «sending to an external
  AI provider» and forbids deriving the right to training from the right to inference
  (`docs/solo/context/01_TECHNICAL_SPEC.md:165,167`). In the registry
  `docs/solo/context/02_SOURCE_REGISTRY.json`, the same sources have
  `process_with_ml: "unknown"` — «not checked» and «not allowed» are different
  things here, and it is worth the owner recording what exactly was meant.
- **Timelines:** the himalayas and jobicy policies have `valid_until` = 2026-12-23 → a
  revision of the ToS lies ahead anyway, and the ML-processing question is naturally
  closed there too.
- **Dependencies:** `@huggingface/transformers@4.3.0` pulls in `onnxruntime-node`,
  `onnxruntime-web`, `sharp`, `@huggingface/tokenizers` (native binaries) —
  this is the very «review guardrails allowlist» from item 2. `fastembed@3.0.0` is not
  suitable as the basis of the choice: its model list has only bge-en, all-MiniLM and
  multilingual-e5-large.
- **External transport:** the only allowed module is
  `src/server/import/fetcher.ts` (`scripts/guardrails.mjs`). Downloading weights from
  Hugging Face is an external call, so a separate reviewed step is needed (a script with a
  pinned hash) or vendoring of the model catalog.
- **Phase A and embeddings:** no item of A requires embeddings — A4 deferred
  near-dup to B5 (`src/domain/dedup.ts:11`), A6-002 made the dictionary version and
  left the embedding neighbourhood to B1/B5
  (`src/domain/negative-preference.ts:36-38`). Decision No. 2 is the A→B gate.

## 3. External facts and sources (checked 2026-09-30)

- Qwen3-Embedding: <https://huggingface.co/Qwen/Qwen3-Embedding-0.6B>
  (card: license, MRL 32–1024, 32K, MTEB multilingual 64.33, instruction
  template); ONNX: <https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX>.
- Harrier: <https://huggingface.co/microsoft/harrier-oss-v1-0.6b>
  (MIT, 596M, 1024 dim for 0.6b, 32K, MTEB-v2 66.5/69.0/74.3).
- Granite r2 (MRL 768→128, official ONNX) and USER-bge-m3 (Apache-2.0,
  a Russian fine-tune of bge-m3) — cards on Hugging Face.
- Gemini Embedding 2: <https://ai.google.dev/gemini-api/docs/embeddings>
  (8192 tokens, output 128–3072, MRL).
- OpenAI: <https://developers.openai.com/api/docs/pricing> (3-small $0.02,
  3-large $0.13 per 1M tokens), data policy —
  <https://developers.openai.com/api/docs/guides/your-data> («не используется
  для обучения, если явно не согласиться» [not used for training unless you explicitly agree]).
- Voyage: <https://docs.voyageai.com/docs/faq> (by default stores and uses
  the data for training; can be disabled by an option) — the reason not to consider it as a
  default for private text.

What these sources **do not have** (and therefore is not asserted): an independent
Russian-language head-to-head between the candidates; a Russian evaluation for harrier;
a confirmed MRL for harrier; latency measured on this machine. All of this is
the work of a spike and a measurement, not ready knowledge.

## 4. Why API is not the primary option

A full reindex of ~800 documents at ~1.5k tokens = 1.2M tokens, i.e.
≈ $0.02 (OpenAI 3-small), ≈ $0.16 (3-large), ≈ $0.24 (Gemini, batch ≈ $0.12).
**Money is not the deciding factor.** What decides: privacy (the text of the profile and CV goes to a third
party), a second policy edit (`send_to_ai_provider` is currently `denied` for both
sources) and the work on the AI contour: budget reservation, quotas, a commit gate for the
embeddings path are not built today. The local path costs one policy edit
and requires no money machinery. It is reasonable to keep API as an offline quality
baseline: cents per run and no access to private text, if the run
is on synthetic data — but it too requires a separate `send_to_ai_provider` grant for the
fixtures, which does not exist today.

## 5. The blocker that precedes any model choice

Local embedding of vacancy text is `process_with_ml`, and today it is
forbidden for all three sources, including the synthetic fixtures. Formally this
blocks even an offline measurement on the golden set. The order of actions:

1. The owner decides on `process_with_ml` (scope: local inference; `train_model`
   remains `denied`; the minimum is atlas-fixtures for offline eval, then himalayas and
   jobicy, if their text is embedded).
2. Record in the matrices what exactly this means (`denied` → `allowed`), with a
   reference to item 2 of section 7 and a date; take the ToS revision by 2026-12-23 into account.
3. For the API option — a separate decision on `send_to_ai_provider` + purpose in the
   matrix + the contour. Do not start the API path without this step.

**Status as of 2026-09-30:** steps 1–2 are done for `atlas-fixtures` — the grant is in the
diff (policy version 1→2, `reviewed_at`, a reference to the decision) and a test that
fails on a silent extension of the grant to live sources. For himalayas and jobicy
no grant was issued: no answer on the ToS has been received, their `process_with_ml` remains
`denied` and is checked by the test.

## 6. What the owner is asked to approve (wording of the decision)

For the protocol — five items, one line each:

1. `process_with_ml: allowed` within the scope of local inference (without training) —
   first atlas-fixtures, then himalayas and jobicy; `train_model` — `denied`.
2. A local model: `Qwen3-Embedding-0.6B` (Apache-2.0) as the primary one;
   `harrier-oss-v1-0.6b` — a candidate for the shadow measurement; `granite-311m-r2` —
   the CPU cost reserve.
3. The new dependency — as a separate reviewed diff: a pinned version, a guardrails
   allowlist, a pinned weights hash, a separate reviewed download path.
4. The choice is confirmed by measurement, not by benchmarks: extend the golden set
   with cross-language pairs (RU profile ↔ EN vacancy), then a shadow run A9 →
   a frozen eval A1 → switching per playbook B1 with a rollback window.
5. The profile embedding is a derivative of personal data: it is deleted together with
   the profile (integration test, B1 V2); the model version is in the cache key; the
   mixing of versions in one request is forbidden (fail-closed).

Below is the same with scope, anchor points in the code, the way of checking and the
rollback. Everything not checked today is marked `not_run`.

### 6.1 The `process_with_ml` permission

**Approved:** the three sources are given `process_with_ml: allowed` within the scope of
local inference (embedding text on our machine). `train_model` remains
`denied` for all — training on upstream text is switched off in the MVP; `send_to_ai_provider`
remains `denied`, the local path does not need it; `publish_full_text` does not change.

**Scope and boundaries.** Three independent grants, each a separate decision:
(a) `atlas-fixtures` — synthetic, unencumbered by third-party rights, it unlocks
offline eval on the golden set (without it no model can be measured);
(b) `himalayas`; (c) `jobicy` — upon the revision of the ToS, the `valid_until` term
of 2026-12-23 arrives anyway. The honest outcome for (b)/(c): if the ToS is silent —
the value is `unknown`, the operation remains blocked, the dense leg of B1 works
only on the synthetic catalog, and this is recorded in the decision rather than hushed up.
The spec explicitly distinguishes ML/embeddings and sending to a provider and forbids deriving the
right to training from the right to inference (`01_TECHNICAL_SPEC.md:165,167`).

**What changes in the repository.** `src/server/source-policies.ts`: the values of
`process_with_ml`, a policy version bump (himalayas 3→4, jobicy 2→3), `reviewed_at`
and `approval_reference` with a reference to the decision and the date. Synchronization with
`docs/solo/context/02_SOURCE_REGISTRY.json`, where `unknown` currently stands — otherwise the
two documents diverge on what exactly is forbidden (the source of truth is
the executable matrix). The embedding code must ask
`permissionFor(policy, "process_with_ml", now)` at the point of use and
refuse on anything other than `allowed`: the function exists (`src/server/source-policies.ts:163`),
there are no ML calls yet — they will appear in B1.

**Retention is part of this item.** `max_retention_hours: 720` is not a declaration:
snapshots older than the window are deleted (`src/server/storage/snapshots.ts:102`, the test
`tests/integration/snapshots.test.ts:66`). A vector is a derivative of text with a
limited term, so it must go away together with the snapshot (FK
`ON DELETE CASCADE`, as with `job_relevance_scores` and `job_events`). Otherwise a
source with a 30-day window keeps an eternal derivative copy of the text.

**How it is checked.** Unit: without the grant the ML operation is rejected, with the grant —
allowed (`permissionFor`), add it to `tests/unit/source-contract.test.ts`
(the policy values are already checked there). Integration: deletion of a snapshot by
retention takes the vector with it — an extension of `tests/integration/snapshots.test.ts`.

**Risk and Rollback.** The edit is constants and the policy version; rollback — restore `denied`.
There is no legal risk for synthetic data; for live sources it is borne by the owner,
which is why the grants are separate.

**The open question was closed by the owner on 2026-09-30.** Whether the ToS of
himalayas/jobicy permits ML processing of stored text: himalayas has no direct
permission, but the API documentation names AI tools as the audience — the owner accepted this
reading and the grant was issued (§8); for jobicy the evidence is stronger, but no grant has
been issued yet — that is a separate decision of the owner. Written confirmation from himalayas
remains recommended, but does not block B1.

### 6.2 Model

**Approved:** the reference model is `Qwen/Qwen3-Embedding-0.6B`; the candidate for
measurement is `microsoft/harrier-oss-v1-0.6b`; the CPU reserve is
`ibm-granite-embedding-311m-multilingual-r2`. «Primary» means: the contract B1 is
written for it; a change is a planned playbook, not a rewrite.

**Contract (all parameters checked against the card on 2026-09-30):** last-token
pooling; L2 normalization; dimension 1024, MRL 32–1024 is available but is **not**
enabled now (700 × 1024 × 4B ≈ 2.9 MB, ANN is not needed); the window 32K — our documents
are 1–2k tokens, there is no truncation; the instruction is on the query only:
`Instruct: {task_description}\nQuery: {query}`, the document — without instruction;
a silent loss of the instruction = a quiet degradation of quality (research part 2 A3).

**A version is an artifact, not a name.** `model_version` pins the exact ONNX set
including quantization (int8 and fp32 are not numerically interchangeable), plus the hash of the files.
Node path: `onnx-community/Qwen3-Embedding-0.6B-ONNX`, int8/q4f16 ≈ 0.6 GB.

**What is not decided here:** vector storage (Decision No. 1) and the reranker (item 3
of section 7). The exclusions are recorded so as not to come back to them: jina v3/v5 —
CC-BY-NC (non-commercial), `multilingual-e5` — a 512-token window, `mxbai` — English
only.

**What changes in the repository.** A line in `docs/DEPENDENCIES.md` (model, version,
license, source) following the convention of the file; an embeddings version constant in the
style of `RANKER_VERSION` (A9); the cache key `(model_version, instruction_version,
profile_version)`.

**How it is checked.** V1 — the card against the contract (done here; repeat when the
model changes). Spike: a real run on the target machine (16 CPU) — latency and
quality, status `not_run`.

**Risk and Rollback.** The choice is reversible as long as there is no production index: «model
rollback» = not enabling the candidate. **Open question:** MRL for harrier is not stated — if it
is needed and is confirmed by measurement, harrier cannot become the primary one without an
explicit deviation from the criterion of §7.2.

### 6.3 New dependency

**Approved:** the embeddings code comes in as one task with a pinned dependency
version, an updated allowlist and a pinned model artifact.

**Scope.** The candidate is `@huggingface/transformers@4.3.0` (it pulls in
`onnxruntime-node@1.30.0`, `onnxruntime-web`, `sharp@^0.35.4`,
`@huggingface/tokenizers`, `@huggingface/jinja`; native binaries — check the
prebuilds win32-x64 and linux-x64) **or** the low-level pair `onnxruntime-node` +
`@huggingface/tokenizers` without `sharp` — the spike decides; fewer native
dependencies — a smaller review surface. Guardrails today catches only
forbidden SDKs, it will not stop a new dependency, so the permission
is added as an explicit line with a date — as was done for `openai` (2026-09-25).

**The model weights are not an npm package.** Downloading from Hugging Face is external
transport, and it is allowed only in `src/server/import/fetcher.ts`. So: either vendoring of
the model catalog outside git with a pinned sha256, or a separate reviewed script
(`npm run models:fetch`) with hashes; no downloads at runtime.

**Offline and disableability.** `npm run check:offline` must work without the model →
in unit tests a deterministic fake embedder (the mock is labelled), the real
model — only in an explicitly enabled local mode and in the measurement script. The system
without the model must remain correct: the layer is inert, like the A9 shadow.

**How it is checked.** `npm run check` (including guardrails), `npm run test:db`,
`build`, `e2e` in the context of B1. Today everything is `not_run` — there is no code.

**Risk and Rollback.** Remove the dependency and the model catalog: the layer disappears, the
output does not change, because before the switching it is not on the hot path.

### 6.4 The choice is confirmed by measurement

**Approved:** the model is confirmed on the A1 set extended with cross-language
pairs, via the A9 shadow run; the order — extend the set → shadow → frozen
eval → switching per the playbook.

**Scope.**
- *Extending the set:* today the Russian material is 4 vacancies (j15, j20, j21, j32)
  and 1 profile (p-ru-ml) out of 34×6 — this will not be enough to distinguish the models.
  Add pairs «Russian profile ↔ English vacancy» and «English profile ↔ Russian
  vacancy»; the labelling is by judgement, not by computation (principle A1);
  the ratchet is rebased with a recorded reason. Limitation: the profile language is not
  modelled in the contract (`src/data/matching-golden.ts:25`) — the pairs are added
  as fixtures with an explicit label.
- *Measurement:* the A9 ranker registry + `npm run eval:shadow` / `eval:matching`. Acceptance
  conditions: NDCG@10 not below the floor (0.916478), guardrails pass (empty share,
  closed/duplicates/unapproved in the top-10 = 0, p95 ≤ 250 ms), R@10/MRR do not
  degrade. The API baseline on synthetic data — optional and cheap, but it requires the
  `send_to_ai_provider` grant for the fixtures, which does not exist now.
- *Playbook B1:* shadow column → dual-write → frozen eval → check of
  search accuracy (at 700 — exact cosine, ANN is not needed) → switching
  by alias → rollback window; the version in the cache key; mixing versions is forbidden.
- *The «do not switch» condition:* if the dense leg gives no measurable gain or
  breaks latency — B1 is not enabled, retrieval is carried by B2 (BM25+RRF), the cross-language
  gap is documented honestly.

**What changes.** `src/data/matching-golden.ts` (pairs),
`tests/unit/matching-eval.test.ts` (ratchet), a candidate ranker in the A9 registry.

**How it is checked.** By the run itself; today `not_run` — there is neither a model nor a
grant. **Open question:** who labels the cross-language pairs — the owner's judgement
or the executor's per the A1 rules.

### 6.5 Privacy and integrity of vectors

**Approved:** the embedding of the profile and CV is a derivative of personal data;
it is deleted together with the profile or CV; the model version and the instruction template
are in the cache key; the mixing of versions in one request refuses (fail-closed); there are no
vectors and no text in logs, events, URLs and client payloads.

**Anchor points (checked).** Profile deletion already exists —
`src/server/profile-service.ts:73-75` (`DELETE FROM search_profiles`,
`candidate_profiles`); CV — `src/server/cv/service.ts:64,73`
(`cv_uploads`, FK `ON DELETE CASCADE`, `migrations/0007_cv_uploads.sql:3`).
The profile vector must be deleted in the same transactions. Vacancy vectors — behind the
snapshot by the `ON DELETE CASCADE` convention (`migrations/0011_relevance_scores.sql:3-4`,
`0014_job_events.sql:20-21`), because retention deletes snapshots
(`src/server/storage/snapshots.ts:102`).

**Boundaries.** Logs and output: the A9 discipline «the shadow line is numbers only»
also extends to embeddings; the spec requires not putting CV into a public URL,
HTML, analytics and logs (`01_TECHNICAL_SPEC.md:498,518`). The API path is not started in this
decision: if it ever appears, that is separate grants
(`send_to_ai_provider`) and a separate contour with budgets.

**How it is checked.** Integration: «deleted profile/CV → no vector»; «snapshot
deleted by retention → no vector». Unit: mixing `model_version` → refusal;
in the shadow log there are no non-numbers (A9 pattern).

**Risk and Rollback.** Before the model is enabled there is nothing to violate; after that —
rollback = switch off the layer and delete the vectors (the data is derivative, there is no loss).

## 7. The owner's Decision No. 1 (vectors): pgvector — adopted 2026-09-30

**Decision:** vectors are stored in pgvector rather than in `float8[]` + cosine in SQL/Node.

**What this changes.** The DB image in `compose.yaml` changes to pgvector: the tag
`pgvector/pgvector:0.8.6-pg17` (version pin; the tag registry has `pg17`,
`pg17-bookworm`, `pg17-trixie` and the versioned variants `0.8.6-pg17` — checked
2026-09-30). The major is the same (17), so the current volume is compatible; the extension
is enabled by a migration (`CREATE EXTENSION vector`), the next free number is
0016. Checks: `npm run test:db` on an isolated DB; the line about the image and the extension
version — in `docs/DEPENDENCIES.md`.

**Boundaries of authority.** `compose.yaml` is outside the executor's authority (the brief,
section 5: «смена образа Docker — изменение `compose.yaml`, которого исполнитель
касаться не может» [changing the Docker image is a change to `compose.yaml` that the executor cannot touch]).
The edit is prepared and applied by the owner or by a separate
explicit permission; the migration and the code are part of B1.

**Why this does not contradict §2.** With 700 records ANN is not needed, and `float8[]`
would be sufficient today. pgvector is chosen as a direction: HNSW/ivfflat are
available without a second DB (ADR-001 is not violated), MRL dimension truncation fits
`vector(n)` naturally, and when the catalog grows the decision will not have to be made a second time.
The V1 scope check is closed by fact: 700 records, the target mode — up to
several thousand.

**Risk and Rollback.** The risk is the change of the local DB image; the volume is compatible by
major, before the migration there are no pgvector types in the schema. Rollback: restore the
previous image and, if necessary, `DROP EXTENSION`.

**Applied on 2026-09-30.** The owner replaced the tag in `compose.yaml`
(`postgres:17.11-alpine` → `pgvector/pgvector:0.8.6-pg17`); the container was recreated
(`docker compose up -d`), the volume preserved — the data is in place (700 vacancies, 355
users, 124 profiles), the server reports PostgreSQL 17.11 (Debian). The migration
`migrations/0016_pgvector.sql` (`CREATE EXTENSION IF NOT EXISTS vector`) was applied
to the working and the test DB; `vector 0.8.6` is installed in both;
`npm run test:db` → exit 0 (44/44). No vector table was created — that is B1.

**Rehearsal of the image change (2026-09-30, on a copy of the production volume).** The image
`pgvector/pgvector:0.8.6-pg17` carries exactly the same PostgreSQL **17.11** (Debian 12
build, glibc; the current one is 17.11 musl/Alpine), so the data directory is compatible
directly, without a dump and `pg_upgrade`. The volume copy (79.4 MB) came up on the new
image in ~1 s and served the data as is: 700 vacancies, 355 users,
124 profiles, 4 CVs; `CREATE EXTENSION vector` → `vector 0.8.6`; a cosine query
(`<->`) works; there are no collation warnings in the logs, and the safety net
`REINDEX DATABASE` took **35 ms**. The production volume was not touched during the rehearsal.
The order of enabling: replace the image tag in `compose.yaml` → `docker compose up -d`
(the named volume is preserved; `docker compose down -v` deletes it — do not do
that) → migration 0016 with `CREATE EXTENSION vector`. The extension is NOT enabled by
the image itself: until the migration is applied, there is nothing vector-related in the DB and
the application works as before. The downloaded image takes 627 MB on disk.

## 8. ToS of himalayas and jobicy: check of 2026-09-30

**Method.** The raw pages were captured with curl and parsed by text:
`himalayas.app/terms`, `himalayas.app/api`, `himalayas.app/docs/remote-jobs-api`,
`jobicy.com/jobs-rss-feed`, the README of `github.com/Jobicy/remote-jobs-api`. Nothing was
sent and nothing was called from the application code. An attempt to compare the editions with the
archive (Wayback, snapshot of 2026-09-01) returned 429 — **could not be checked**.

**jobicy — ML processing looks covered.** Fair Use (the README and the same wording on the page):

- «You may use Jobicy listings in your own products and user experiences without
  requesting individual permission»;
- «You may create your own interfaces, summaries, categories, search experiences,
  and additional context around listings»;
- «Cache responses where appropriate and do not run automated polling more
  frequently than once per hour»;
- «Most integrations, including job boards, newsletters, career tools, AI
  assistants, and internal applications, can use the public API without a separate
  agreement»; the page also invites adding vacancies to «apps, websites, AI tools,
  and automated workflows» and keeps an MCP server for AI assistants.

Obligations: keep the canonical Jobicy URL and do not pass the listings off as one's own
(already in the policy). Ranking, search and embeddings read as «search
experiences» and «AI tools»; the words «embeddings»/«machine learning» are absent, training of a
model is explicitly not permitted — `train_model: denied` remains.

**himalayas — ambiguous, a question to the source is needed.** The API documentation:

- «The Himalayas Remote Jobs API is designed for developers, researchers, job
  board operators, content creators, and **AI tools** that need machine-readable
  remote job data from Himalayas»;
- «If you are building a complete mirror of the feed, re-run the walk from the
  start periodically to pick those up» — a mirror and storage of the feed are assumed;
- attribution: «include a visible link back to himalayas.app and mention that the
  data is sourced from Himalayas».

The site's general terms, however, forbid what is not directly attributed to the API programme:
cl. 29 («you may not modify, copy, reproduce, republish… any material from this
Site»), cl. 30 (data mining / scraping / automated gathering on this Site),
the license «personal, non-commercial transitory viewing only». Clauses 51–52 and
104–107 describe their own AI services (including voice interviews via
OpenAI) and do not relate to our rights. **There is no direct permission for ML processing of
stored text in the API terms; nor is there a direct prohibition.** This is exactly the
`unknown` case, i.e. the operation is blocked until an answer.

**What is proposed.** (1) For jobicy — issue `process_with_ml: allowed`, recording the
Fair Use quotes in `approval_reference`; attribution and the canonical URL are preserved.
(2) For himalayas — ask `hi@himalayas.app` in writing (the address is published for
integration support) or keep the prohibition: without a grant the dense leg works on
jobicy and the fixtures, and himalayas is 498 of the catalog's 700 records.
(3) At the revision by 2026-12-23, store not only the `terms_hash` but also a snapshot of the
page: today the hash does not work as a check that «the terms have not changed» (the layout
is dynamic and deployment-dependent: for jobicy two consecutive captures gave different hashes,
for himalayas the hash of 2026-09-24 is not reproducible).

**The owner's decision (2026-09-30):** for himalayas we use ML processing; jobicy —
not yet; `terms_hash` — fix it. The analysis and quotes above are considered the basis:
for himalayas there is no explicit permission, but the API documentation names AI tools as the
audience, and the owner accepted this reading.

**How `terms_hash` was fixed (implemented and checked on 2026-09-30).** Now it is the
sha256 of the **normalized text** of the page (`src/server/terms-fingerprint.ts`:
comments/scripts/styles are removed, block boundaries become newlines,
entities are decoded one level, whitespace is collapsed, empty lines are
dropped). The read and approved edition of the terms lies next to it:
`docs/sources/terms/himalayas-terms.txt`, `jobicy-feed.txt` and the manifest
`docs/sources/terms/snapshots.json`. `npm run terms:check` captures the live pages,
compares the fingerprints and prints the place of the first divergence: exit 0 — not changed,
1 — changed (a human is needed), 2 — could not be checked (404/network). The offline test
`tests/unit/terms-fingerprint.test.ts` links the policy, the manifest and the snapshot —
a divergence fails without the network. Checked consecutively: both pages «unchanged» where
the old hash diverged on unchanged terms.

**An honest implementation detail.** The normalization decodes entities one level
and is therefore not idempotent, so the integrity of the snapshot is checked by a plain sha256
of its text, and not by re-normalization; the test records this explicitly. And:
`terms_hash` is a change detector, not a confirmation of rights: a matching fingerprint
means «the terms are the same», not «the terms still permit».

**What is left for people.** The himalayas grant was issued under ambiguous terms —
written confirmation from `hi@himalayas.app` remains a recommended step
that removes the ambiguity, but no longer blocks B1. For jobicy the grant has not been issued,
although its Fair Use is the most direct of the three sources; this is a separate decision
of the owner, recorded in the policy as a comment.

## 9. Verification plan for the future B1 (status: `not_run`)

- V1: the model's properties checked against the card before the code (done here; when the
  model changes — again).
- V2: the profile embedding is deleted together with the profile; vacancy text is processed
  locally, without an external provider.
- V3: `npm run test:db` on the new schema.
- V4 (invariant): mixing `model_version` in one request → fail-closed.
- V4 (quality): A9 shadow run + frozen A1 before and after; the layer without the model is
  inert; the ratchet is not weakened.
- Spike (a separate short task): measurement of latency and quality on the target machine
  (16 CPU, i5-13450HX, 34 GB RAM, Node 26) — int8/q4f16 ≈ 350–620 MB on disk.

## 10. Honest limitations and uncertainties

- There is no independent RU↔EN comparison of the candidates; all metrics above are self-reported
  model cards, so the choice is confirmed only by our own measurement.
- MRL for harrier is not confirmed; for Qwen3 it is confirmed (32–1024).
- Latency on this machine has not been measured; external estimates from blogs have not been checked.
- The Russian-language specialists (Giga-Embeddings, USER-bge-m3) are strong in
  Russian per the cards, but require export to ONNX and have not been checked in English.
- Downloading the weights is external transport outside the allowed module; the current
  design barrier, not a trifle.
- The cost of subagent research and the coding-host spending is `unknown`, as is
  accepted in the project; presenting it as an actual bill is unacceptable.

## 11. What is next

Decisions No. 1 and No. 2 were adopted on 2026-09-30. The order:

1. The owner applies the change of the `compose.yaml` image to
   `pgvector/pgvector:0.8.6-pg17` (or gives explicit permission) — after that the
   migration 0016 with `CREATE EXTENSION vector` and `npm run test:db`.
2. ML grants: `atlas-fixtures` and `himalayas` — issued; on jobicy the decision is with
   the owner. Written confirmation from himalayas (`hi@himalayas.app`) —
   recommended, does not block. The terms are re-checked by `npm run terms:check`;
   at the revision by 2026-12-23 — read the changes and, if necessary,
   rebase the snapshots (`npm run terms:check -- --write` + a policy edit).
3. Task `B1-001`: the dependency, the model artifact, the embeddings contract, dense
   retrieval, the model change playbook, a spike with latency measurement on the target
   machine.
4. Extending the golden set with cross-language pairs — a small separate task,
   it can go in parallel.
