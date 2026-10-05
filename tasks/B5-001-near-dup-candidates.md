# B5-001 — cross-lingual near-dup candidates (the embedding part of deduplication)

**Status: in progress (in_progress), 2026-10-04.** Basis: card B5 of the brief
[docs/design/2026-09-27-matching-implementation-brief.md](../docs/design/2026-09-27-matching-implementation-brief.md)
§6 («Cross-lingual deduplication (the embedding part)»); research part 2 D2;
inventory — `docs/OPEN_GAPS.md` C11. The dependencies A4 (exact keys) and B1
(embeddings) are done.

**What the brief designed:** pairwise cosine of job embeddings (O(n²) —
acceptable up to thousands; **fix the threshold for moving to LSH now, switch
later**); candidates above the threshold → **a confirmation queue** (LLM — C5;
until then — a manual review list, **not automatic merging**).

**Verification (V4) from the brief:** a synthetic «one job EN/RU» pair → a
candidate in the queue; «two different roles of one company» → not a candidate
(a known failure of a pure threshold — hence the rule is not purely
threshold-based).

**Boundaries:** nothing is merged or hidden automatically; the product feed is
unchanged (A4 grouping in the projection remains the single point of mutation).
The queue is a CLI report for a human, like `npm run ai:holds`.

## Plan

1. `src/domain/near-dup.ts` — a pure rule: a prefilter by text cosine (O(n²),
   the LSH boundary); a gate on the cosine of **titles** (the same multilingual
   artifact — a lexical gate would break EN/RU); thresholds — measured on the
   real artifact with the numbers recorded in the module, not taste. Pairs with
   an equal A4 key are skipped (those are exact duplicates — A4's business).
2. `loadEmbeddedPostings` in `src/server/embeddings/embedding-service.ts` and
   `scripts/dedup-candidates.ts` (`npm run dedup:candidates`): a queue in JSON
   (pairs, cosines, company/source/languages), per-source `process_with_ml` is
   asked at the point of use.
3. Tests: unit (the rule, both halves of V4), integration (loading +
   permission, a fake embedder, as is customary), a separate measurement with
   the real model.
4. A queue run on the local catalog (700 posts) — the result goes into this
   task.
5. Checks: `check`, `test:db`, `build`, e2e (the product UI was not changed,
   but the run is mandatory); OPEN_GAPS C11, status.

**Rollback:** delete the module/function/script/tests; the product path is
untouched — the rollback breaks nothing.

## Result (2026-10-04)

**Status: done (implemented), 2026-10-04.** Local checks were run; acceptance
is with the owner.

**The rule** (`src/domain/near-dup.ts`, version `near-dup-l1`):
- the `textNeighbours` prefilter — pairwise cosine of full texts, O(n²); the
  LSH boundary measured and fixed (~0.24M pairs/s; 5 000 posts ≈ 53 s) —
  playbook §5b;
- the gate on the **title cosine** — by embeddings, not lexically (a lexical
  gate would break EN/RU) — it is exactly what separates a
  translation/paraphrase from «a different role at the same company» (V4,
  second half);
- pairs with an equal A4 key are skipped (exact duplicates are A4's business);
  pairs with **different hiring geography** are not candidates: A4 counts
  geography as part of identity, and merging across it would silently widen
  the eligibility gate. The real catalog confirmed it: without this veto,
  regional clones stood at the top of the queue («Python | UK» vs
  «Python | USA», cosine 0.94).

**Thresholds — measured with the real artifact, not taste** (2026-10-04, a
synthetic set; the numbers are in the module header): EN/RU translation
**0.811/0.846**; EN paraphrase 0.854/0.913; translation vs paraphrase
0.743/0.789 (the lowest true pair); different roles of one company 0.582/0.731;
a same-named template of another company 0.662/1.000; the known
false-positive class (an identical title + template text) 0.724/0.913 —
accepted deliberately; unrelated 0.365/0.659. The thresholds 0.70/0.75 lie
between the lowest true pair and the highest different-roles pair.

**CLI — a queue for a human** (`npm run dedup:candidates`,
`scripts/dedup-candidates.ts`): JSON; titles and companies are public catalog
data (description text is not printed); `process_with_ml` is asked per source
at the point of use (a refusal excludes the source entirely, as in the dense
leg); title vectors are computed lazily, only for pairs from the text
neighborhood. Nothing is merged or hidden — the product path untouched (A4
grouping in the projection remains the single point of mutation).

**A run on the local catalog** (700 posts, all with vectors of the reference
artifact): 429 pairs above the text threshold, of which 41 are exact A4
duplicates (skipped by the rule), **130 candidates**. Among the shown ones —
**0 cross-source**: the live himalayas imports (498) and jobicy (202) do not
intersect as near-duplicates today, and the queue is made up of within-source
families of one employer (NOCD by states, Kodland by markets, Elevenlabs/i4DM
by grades) — this is material for manual review, no automatic decisions. An
honest picture of the catalog, not a «victory»: the rule's ability to catch
EN/RU translation and paraphrase is proven by the model measurement and the
V4 tests.

**Tests:** unit **256/256** (+12: both halves of V4, thresholds included, the
gates separately, exact duplicates, the geo veto, determinism, refusal on
artifact/role mixing, empty input); integration **58/58** (+1: loading from
the DB — only the current artifact, tombstoned excluded, the exact pair
skipped, float4 round-trip).

**Files:** `src/domain/near-dup.ts`; `loadEmbeddedPostings` in
`src/server/embeddings/embedding-service.ts`; `scripts/dedup-candidates.ts`;
`package.json` (`dedup:candidates`); `tests/unit/near-dup.test.ts`;
`tests/integration/near-dup.test.ts`; `docs/EMBEDDING_PLAYBOOK.md` (§3 — the
re-measurement step on a model change, §5b — the scan boundary, §6 updated).

**Limitations:** the cross-language signal was measured on a synthetic pair
(there are no RU posts in the local catalog); the false-positive class
«identical title + template text» remains (a deliberate queue design — asking
a human is cheaper than skipping); the thresholds are artifact-dependent — a
model change requires re-measurement (playbook §3).

**Rollback:** delete the module, the loading function, the script, the tests
and the playbook entry; the product path untouched — the rollback breaks
nothing.
