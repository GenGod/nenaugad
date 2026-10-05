# Research: algorithmic and AI matching of jobs to a resume (2026-09-26)

Research for designing Nenaugad matching (remote-only, candidate-facing,
job catalog). The material was gathered by three parallel subagents (web search + source
analysis, ~30 search queries, ~20 pages examined), consolidated and verified in the
main session. Subagent tokens: ~1.63M (cost: unknown).

## Industry summary in one paragraph

Consensus of the sources: production matching is built as a **cascade**, not a single model —
entity extraction and normalization → deterministic eligibility filters → hybrid
retrieval (BM25 + embeddings, rank fusion) → rerank (cross-encoder or LLM) →
diversity/explainability → feedback loop. Pure-LLM scoring of the entire corpus does not scale
in cost and latency; purely lexical search loses synonymy; embeddings do not catch
hard constraints. LLM is displacing the NER stack in field extraction (LinkedIn, CIKM 2025),
skills-first normalization is common practice (LinkedIn, Eightfold), regulation (EU AI
Act Annex III.4, NYC LL144) makes explainability part of the architecture. Auto-apply
startups are dying (Sonara closed in 2024); durable value is filtering,
explanation, preparation.

## Top 10 methods (in cascade order)

### 1. Entity extraction and normalization — the foundation of everything
LLM extraction of structured fields into a single schema: from a resume — skills, years
of experience, seniority, education; from jobs — requirements, salary, remote policy.
Then normalization of skills to a taxonomy (ESCO — 29 languages, free; O*NET;
Lightcast Open Skills) + an alias dictionary (js = JavaScript = ECMAScript). Normalization
is done at ingest, not at runtime. Critically: fields absent from the text (salary
«competitive») get an explicit `unknown`, the model must not invent them — here
hallucination is especially harmful. LinkedIn replaced its stack of task-specific NER models
with a single LLM query understanding (arXiv:2509.09690). Extraction errors multiply down the
pipeline, which is why this is method No. 1 and not a trifle.

### 2. Hard eligibility filters with three-valued logic (pass / fail / unknown)
Deterministic checks BEFORE any scoring: the intersection of the employer's remote zones and
the candidate's regions, timezone ±N hours, job language, right to work/visa,
salary expectations (only when both sides gave a range). `unknown` is neither pass nor
fail: the job is shown with the label «not specified», does not fall into «guaranteed
suitable». This is an exact match to Nenaugad's principles (eligibility ≠ relevance,
unknown is not pass/fail). Mixing eligibility and relevance is a typical mistake:
an «80% match» for a job with a visa barrier is useless. Complexity is low, but a
careful data model for `unknown` is needed.

### 3. Lexical retrieval: BM25 with the query built from the resume
Jobs are documents (Postgres `tsvector` is enough for the MVP; BM25F — field weights:
the title matters more than the body). The query is built from discriminative terms, role titles
and normalized resume skills (not the whole text at once — length imbalance). Pros:
cheap, fast, explainable, accurate on technologies/abbreviations («C#», «AWS»), does not
require training. Cons: blindness to synonyms («ML developer» vs «machine learning
engineer»), morphology. Complexity: low.

### 4. Vector dense retrieval (bi-encoder + pgvector)
A two-tower model (BGE-M3 — the de facto standard for multilingualism incl. Russian;
E5; or API: Cohere embed-multilingual with `search_query`/`search_document` types).
The job embedding is computed once at ingest and stored in a `vector` column
(pgvector, HNSW); the profile embedding — on save; ANN search — milliseconds.
Catches synonymy, paraphrases, multilingual pairs «Russian resume ↔ English
job». Cons: misses exact key requirements, does not catch hard constraints,
changing the model = full reindexing (plan it as a migration, model versions in the
data). Complexity: medium.

### 5. Hybrid search + Reciprocal Rank Fusion
BM25 and dense search run in parallel (after the eligibility pre-filter), the lists
are merged by RRF: score(d) = Σ 1/(k + rank), k≈60 — it works on positions, not on
incomparable scales. The alternative is a weighted fusion of normalized scores
(alpha-fusion). Complementarity: BM25 holds exact requirements, vectors hold
synonymy; afterward, each pattern «the document won in only one leg».
The Postgres FTS + pgvector + RRF pattern in a single SQL — without a separate vector DB.
Hyperparameters (k, alpha) are to be calibrated on labels. Complexity: low-medium, the best
«gain per unit of effort» after the filters.

### 6. Cross-encoder rerank of top-K (bge-reranker, Cohere Rerank)
Cascade: retrieval of ~50-100 candidates → cross-encoder rerank → top 5-10. Cross-attention
matches the job's specific requirements against specific experience in the resume — something
a bi-encoder fundamentally cannot do. Models: `bge-reranker-v2-m3` (local, multilingual),
Cohere Rerank 3.5, Jina v2 (API). The largest accuracy gain with a minimal
pipeline rebuild; rerank dozens, not thousands. Cons: price/latency per pair,
domain shift MS MARCO → HR texts. Complexity: low (API) — medium (self-host).

### 7. LLM rubric scoring with structured output (LLM-as-judge)
The final top-10: a prompt rubric → JSON {score, reasons, missing_skills, red_flags}
at temperature=0 + schema validation + grounding on the extracted fields. Zero-shot
is viable (MDPI Electronics 2025). It gives explainability and missing skills almost
for free, understands unconventional careers. Cons: non-determinism, hallucinations
(cured by validation against the extracted fields), seconds and money per pair → only at the
top of the cascade. In Nenaugad this is «real AI»: first the protections per SP (ownership, approved
provider/purpose, atomic budget reservation, quotas, persistent counters, deadline,
uncertain billing, cancellation, commit-time revalidation) — enabling by flag
is forbidden. Complexity: implementation low, operation medium.

### 8. Learning-to-rank on pair features (when data appears)
XGBoost/LightGBM (lambdarank) on features: BM25 score, cosine, share of matched
normalized skills, seniority gap, «X years required» vs actual tenure,
freshness, behavioral signals. Fast inference, interpretability via feature
importance. The blocker is data: resume→job interactions are sparse (ConFit,
WSDM 2024, calls this the key problem of the domain), behavioral bias (position bias,
popularity). Defer until events accumulate. Complexity: high (data, not
the model).

### 9. Skills knowledge graph: adjacent roles and query expansion
A «skills ↔ occupations» graph over ESCO + enrichment with jobs (de Groot et al.,
arXiv:2109.02554): link prediction «how relevant a skill is to an occupation», node
similarity — career trajectories, term weighting. Applications: query expansion
(the candidate's adjacent skills with weights — rescues the holder of an equivalent but
unmentioned skill), explainability «matched via the adjacent skill X», career-path
features. Expensive edge maintenance. Complexity: high — stage 2+, when there are
normalization pipelines from method 1.

### 10. Feedback loop, personalization and result diversity
Events from day one (impression/click/save/apply/hide/dwell), even without
using them. Hide is a separate strong negative signal (do not mix it with «did
not click»: position bias). Implicit feedback is more predictive than explicit preferences (Reusens
2017; CareerBuilder co-clicks/co-apps graph; LinkedIn activity embeddings — +10%
applications, +5% hires in JYMBII). Feature-based weights first, ML later. Diversity:
quotas per-company/per-title (cheap) → MMR λ≈0.7 over embeddings on the top-k (Elastic
recommends 0.7); exploration — in the tail of the results, not in the top. Cold start is covered by
content matching on the resume + onboarding of 3-5 questions + popularity as a component.
Private by default: signals serve the results, not the candidate's «visibility».

## System aspects

### Must-have for the MVP
1. Three-valued `unknown` logic in all filters (product, not a feature).
2. Freshness: `first_seen_at` separate from `posted_at`; closure on 404/disappearance at
   the source (soft on one signal, hard on two); an honest label «N days
   ago»; age decay later.
3. Deduplication of exact duplicates: a normalized key (company + title +
   location), a canonical job with a `source_ids` array, primary source selection.
4. Ghost jobs hygiene before matching: estimates of ~39-40% of 2024 jobs being ghost; the signs —
   age of 30+ days, «evergreen» reposts, absence from the career page.
   A service that leads to a dead job loses trust irreversibly.
5. Cold start: content matching on the resume (the main mechanism) + short onboarding;
   do not show emptiness — soften filters with an unknown label before returning zero.
6. Template explainability from normalized fields: «matching: React, PostgreSQL;
   missing: Kubernetes; remote: EU timezones; 2 days ago». Explain unknown too:
   «right to work not specified — we could not verify eligibility». Match score
   is to be shown only after calibration; an uncalibrated «87%» is false precision.
7. Privacy: profile private by default, field minimization, export/deletion.
   EU AI Act Annex III.4 classifies targeting of job ads as high-risk (the deadline for
   high-risk obligations has been moved to December 2027): build transparency,
   logging, human oversight into the design in advance. Fix the qualification with
   a lawyer.
8. Normalization of skills and salaries at ingest; currency/rate, gross/net, «competitive»
   = unknown.
9. Base cascade: filters → BM25 (+ opt. vectors) → RRF → rerank.
10. Event collection from day one.

### Important, but can come later
- Near-dup deduplication (MinHash/LSH) and spam heuristics (anomaly in one
  company's postings, salary far above market for the title, «always hiring»).
- Age decay instead of bins; priority re-crawl by traffic.
- Feedback weights in the ranker; MMR and diversity quotas; exploration slots.
- Offline benchmarks Recall@k / NDCG@10 on a labeled set (references: HF
  `cnamuangtoun/resume-job-description-fit`, XING benchmark, ConFit) + a manual audit
  «through the candidate's eyes»; A/B — when there is traffic.
- Multilingual embeddings as a separate decision; embedding model versions.
- LLM scoring of the top (method 7) — after the AI boundaries are implemented and
  tested.

### Fine-tuning
- Exploration/multi-armed bandits; IPS correction of offline estimates (exposure bias,
  Criteo RecSys 2018).
- Calibrated displayed match score (probabilistic scale).
- Reranker distillation (RankGPT: 440M > supervised 3B) as the price grows.
- Personal λ/weights, online learning, the full EU AI Act program.

### Pitfalls (what breaks the system)
- Pure-LLM scoring of the whole corpus: cost and latency are linear in pairs.
- Apply rate / CTR as the target metric: they grow from clickbait, inflated salaries and
  easy apply — that is, from what harms the candidate. Guardrails: hide rate, share
  of applications with a response, repeat sessions, time-to-first-relevant.
- Uncalibrated public score; LLM hallucination of unknown fields.
- Mixing eligibility and relevance in one score.
- Evaluating offline scores on the old ranker's logs without correction for impressions.
- Auto-apply: Sonara closed (2024), the market responds with an «AI vs AI» arms race; for
  Nenaugad it is forbidden by principle.

## Recommended architecture for Nenaugad

```
Job ingest:   parsing → single schema (unknown fields) → skills normalization
  → dedup → freshness fields → embedding (pgvector, model version)
Profile:      resume parsing → the same schema → profile embedding
Serving:      hard filters pass/fail/unknown
              → BM25(tsvector) + ANN(pgvector) → RRF
              → cross-encoder rerank top-50          [stage B]
              → (opt.) LLM scoring of top-10 + missing skills  [stage C, behind AI boundaries]
              → quotas/MMR → serving with template explanations
Background:   event collection → later LTR (method 8), KG expansion (method 9)
```

Stages: **A** — a deterministic MVP without any AI (schema, filters, BM25, RRF,
dedup, freshness, template explainability) — fully in the spirit of the current synthetic
catalog; **B** — embeddings + rerank (open-source locally or API after
approval); **C** — LLM extraction and LLM scoring — only after the SP 1.0 protections
are implemented and tested. Quality evaluation at stage A: Recall@k/NDCG on a
labeled set + manual audit.

## Key sources

Cascade/retrieval: SBERT Retrieve & Re-Rank (sbert.net), Weaviate Hybrid Search docs,
ConFit WSDM 2024 (arXiv:2401.16349), pgvector. Ranking: RankGPT (arXiv:2304.09542),
Metarank/Vespa LTR. Entities and graphs: ESCO (esco.ec.europa.eu), arXiv:2109.02554,
Survey on Skill Identification. Industry: LinkedIn JYMBII + Learning to Retrieve
(arXiv:2402.13435) + CIKM 2025 (arXiv:2509.09690), Indeed engineering blog (2016),
Eightfold engineering blog. Engineering: CareerBuilder graph recommendation
(arXiv:1801.00377), Reusens 2017 (implicit feedback), MMR (Carbonell & Goldstein 1998;
Elastic/Qdrant blogs), Gilotte RecSys 2018 (arXiv:1801.07030, exposure bias).
Regulation: EU AI Act Annex III (artificialintelligenceact.eu/annex/3), Article 26,
EEOC guidance 2023. LLM matching: MDPI Electronics 2025 (zero-shot resume-job),
arXiv:2504.02870. Datasets: HF `cnamuangtoun/resume-job-description-fit`, XING
(arXiv:1812.08947), Kaggle LinkedIn Job Postings.

Full references are in the subagent reports (session 2026-09-26).

---

# Part 2: non-obvious ways to improve (round 2, 2026-09-26)

The second round — three subagents (~1.17M tokens, cost unknown) across tracks: (1) retrieval/matching
innovations, (2) the two-sided model and behavioral intelligence, (3) production engineering
at low traffic. Each received a digest of part 1 and searched beyond the known cascade.
The hypotheses were formulated by the main session, the sources were verified by the subagents.

## A. How we compute the match

1. **Requirement decomposition + evidence + NLI** — the JD is cut into atomic requirements
   (must-have / nice-to-have), each matched separately against the resume with a search for
   «evidence» (an evidence span), the scores are aggregated with weights; negations and contradictions
   («US citizenship required» vs the resume) are caught by an NLI model (DeBERTa-v3-mnli) as a
   cheap pre-check. A whole-text score smears critical mismatches across
   cosine similarity; decomposition is the only approach that naturally expresses
   pass/fail/unknown. Literature: the person-job fit line (arXiv:1810.04040, ACM TOIS
   2020), NLI resume screening. There is no canonical paper «decomposition+NLI for jobs» —
   an open field. The most valuable find of the round.
2. **HyDE** (arXiv:2212.10496) — an LLM generates a hypothetical ideal
   job from the resume, and the job is embedded, not the resume; it solves the genre asymmetry
   «short resume ↔ long JD». Hallucinations are not critical (a contrastive encoder suppresses
   false details). Cache per profile version → not an LLM call on every search. A third signal in RRF.
   An application to job search already exists (jsonresume/job-search).
3. **Instruction embeddings** (E5-Mistral, arXiv:2401.00368; GTE-Qwen) — the resume↔JD
   asymmetry is encoded by an instruction to the query («Given a resume, retrieve matching job
   descriptions…»); the instruction template is to be fixed in code as part of the embedding
   contract. Without the instruction, quality drops noticeably.
4. **Doc2query catalog expansion** (docTTTTTquery; query2doc arXiv:2303.07678) — JDs
   are appended with synthetic «candidate queries» at ingest: offline,
   amortized, free at runtime; the index grows ~×3.
5. Later: **Matryoshka embeddings** (arXiv:2205.13147) — coarse-to-fine rerank without
   a second model, native to pgvector; choose an MRL-compatible embedder in advance.
   **Rocchio profile** — «more like this / less like this» with a single formula
   (α·resume + β·centroid(saves) − γ·centroid(hides)) on top of pgvector, without ML.
   **LLM synthetic hard negatives** (SyNeg, Syntriever arXiv:2502.03824) for
   fine-tuning the retriever without real CVs — with an explicit synthetic label.

## Rejected (checked, not to take)

- **SPLADE / learned sparse** — up to +23% NDCG over BM25, but there is no inverted index in
  Postgres (ParadeDB or an external engine is needed); revisit as the catalog grows.
- **ColBERT late interaction** — pgvector cannot do multi-vector MaxSim, storage
  grows by an order of magnitude, the advantage disappears on long documents; the niche is covered by
  cross-encoder rerank.
- **Generative retrieval / semantic IDs** — breaks on a changing catalog,
  unreproducible baselines. Not to be considered.
- **Daily/weekly application timing** — the evidence is weak (the primary source
  TalentWorks is unavailable, confounding), for the remote domain the factor is devalued
  by timezones. Recency — yes, timing — no.
- **Full bilateral GNN** (DPGNN, RecSys'22, arXiv:2208.08612) — strong results
  only for the owners of logs from both sides of the market; unavailable to us.

## B. What we optimize (the objective function)

1. **EV ranking** (Su, Bayoumi, Joachims, arXiv:2106.01941): optimize
   expected mutual matches, not clicks; one-sided ranking can be Θ(n)
   times worse than the optimum because of crowding (everyone applies to the same jobs). score =
   relevance × p(employer response) × urgency. Phase 1 — fixed multipliers
   on top of the existing rerank: a ghost flag as a crude p(response), hazard as urgency.
   Phase 2 — trained models on self-reported outcomes («did the employer respond within 2
   weeks? yes/no/not yet» — private, cheap collection). Goodhart risk: the target metric is
   «applications with an outcome», not applications.
2. **p(employer response)** — proxy features are already in the stack (ghost heuristics, age,
   reposts); analogy: Airbnb down-ranks listings with a low response rate. Ground truth
   (public Greenhouse/Lever statuses) is a new source and requires purpose-specific
   approval.
3. **Survival model of job lifetime** — the hazard curve naturally yields both «hurry up»
   (will close soon) and «ghost» (has been up for 120 days); train on the proxy «disappearance
   from the feed»; in the UI only coarse buckets, not «N days left».
4. **Two-sidedness as a principle** — score = min/harmonic mean («the candidate
   fits» × «the job probably would have admitted»); GNN implementation — until outcome data.

## C. Cheap serving mechanics (maximum effect per unit of effort)

1. **Seen-set management** — filter explicit dismissals forever; «saw, did not click»
   — TTL 7–14 days, returned only when the job changes (repost, salary);
   a digest «new since the last visit». Jobs are perishable, the user's
   state changes: «did not click» ≠ «not interested». Low cost, the effect on
   perceived quality is direct.
2. **Negative preferences** — first a weight downgrade over the embedding neighborhood
   of the hidden item; structural filters (company/type) only after a clarifying question at
   hiding time («hide the job / the company / such sources»). ACM passive-negative
   feedback: passive negative is a useful signal in its own right.
3. **Stretch match slot** — jobs with a closable gap of ≤2 skills, an explicit reason
   «only X is missing»; there is no direct research on the effect — measure it by hides and
   «opened and left instantly», do not mix it into the main rank before measurements.
4. **Adjacent-role slot** — 1–2 slots «have you looked toward X» from skill adjacency without
   an LLM; serendipity ≠ diversity: MMR spreads items within the distribution, the adjacent slot
   takes them beyond its boundary (Kotkov 2016; Serendiptionnaire RecSys'24). Measure
   by saves and absence of hides, not clicks.

## D. Engineering and evaluation at low traffic

1. **Push matching** — every new job is scored at ingest against all profiles
   → personal alerts/digests; the main generator of events at zero
   organic traffic; when sending, filter by job status (do not
   recompute candidates on closure).
2. **Dedup with an eye on reality**: 50–80% of records in job databases are duplicates
   (Textkernel). MinHash for same-language + a multilingual embedding for
   cross-language + LLM confirmation of candidates (a true duplicate may have only
   37% shingle overlap). On a small catalog — a full pairwise cosine O(n²).
3. **Weak supervision** (Snorkel data programming) — heterogeneous labeling functions:
   rules (skill overlap, salary window, grade, location) + LLM-LF + distant
   supervision; weak labels — for training, not for final eval; a human gold set of
   100–200 pairs is needed for calibration. Active labeling = disagreement of three sources +
   stratification of segments.
4. **LLM-judge as a third evaluation signal** — with a protocol against the 12 documented
   biases (CALM): swap-consistency, a jury from a different model family, a pointwise
   rubric instead of pairwise preference. It does not predict conversion — a third signal
   after the gold set and manual audit.
5. **Team-draft interleaving** — a replacement for A/B for click comparisons at low traffic
   (~100x fewer samples according to secondary data from Netflix/Microsoft; the Wikimedia case
   is confirmed); only paired click metrics, not application conversion.
6. **Log propensities from day one** — one field in the event (a normalized impression
   score / impression counts) — without it, off-policy evaluation will never become
   possible. Defer OPE itself until there is traffic.
7. **Rollout safety**: shadow mode + on-request guardrails (share of empty result sets,
   share of closed/duplicate items in the top-10, p95 latency, share of jobs outside approved
   sources) are available without traffic — guardrails are computed per request, not as an average
   across users; a percentage canary — as traffic grows.
8. **Embedding model migration playbook**: shadow index → dual-write → a frozen
   eval set (versioned like code) → checking the ANN recall shift → switching
   by alias → a rollback window; never mix versions in one query; the model version
   — in the cache key; reindex idempotent, with checkpoints per batch.
9. **Precompute top-K** — a profile_topk table + job queue; only for alerts and
   cache warming, not for interactive search (on a small catalog realtime is cheap).

## Implementation priority (round 2)

1. Requirement decomposition + NLI pre-check — the core of matching, native pass/fail/unknown semantics.
2. Seen-set + negative preferences — cheap, a direct effect on perceived quality.
3. Push matching/alerts — a generator of events and value from day one.
4. HyDE + instruction embeddings — fix the contract when choosing the model.
5. EV multipliers of phase 1 (ghost × urgency on top of relevance).
6. Cross-lingual dedup + LLM confirmation.
7. Evaluation stack: human gold of 100–200 + weak supervision + LLM-judge with bias controls;
   interleaving and shadow/guardrails as growth happens.
8. Later: survival model, stretch/adjacent slots as measurable experiments,
   Matryoshka / Rocchio / synthetic fine-tuning data.

Key sources of round 2: arXiv:2106.01941 (matching markets), arXiv:2212.10496
(HyDE), arXiv:2401.00368 (E5-Mistral), arXiv:2205.13147 (Matryoshka), arXiv:1810.04040
+ ACM TOIS 2020 (person-job fit decomposition), arXiv:2208.08612 (DPGNN), Snorkel
(Ratner et al. 2017), CALM / llm-judge-bias.github.io (12 biases of LLM judges), Textkernel
(50–80% duplicates), Radlinski & Craswell WSDM 2013 (interleaving), Kotkov et al. 2016
(serendipity), Stanford IR book (Rocchio), frutik knowledge base + AWS (migration
playbook), Airbnb/PriceLabs (response-rate ranking). Full references are in the subagent
reports (session 2026-09-26, round 2).
