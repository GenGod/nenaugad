# B2-001 — BM25 and RRF fusion: implemented, measured, no switch proposed

**Result:** the second retrieval leg (BM25) and position-based fusion (RRF) are
implemented, covered by tests and **measured on the frozen A1 set** together with
the dense leg. The outcome of the measurement settles the question left open
after B1: fusion did not justify itself on the current set — **BM25 alone beats
any fusion of the two legs** (NDCG@10 0.881 against 0.827 at equal weights), and
the more weight is given to the dense leg, the worse it gets.

**The practical conclusion under the rule of §6.4 ("the do-not-switch
condition"):** the feed is switched neither to the fused order nor to the BM25
leg. No variant reaches the v4 ranker's thresholds (NDCG@10 0.916), and the fused
order is also below the best single leg. The priority of the next step shifts:
B3 (a cross-encoder rerank) and extending the set with cross-language pairs —
where the dense leg should win but the current set cannot show it (4 Russian
jobs, a profile without a language field).

**Out of scope:** switching the production feed (owner decision #11), the
cross-encoder (B3), the cross-language extension of the set (a separate task),
learning/calibrating the fusion weights by regression (data is needed, not 6
profiles).

**Dependencies:** A1 (threshold untouched), B1 (the dense leg and the vectors),
A9 (guardrails).

## What was added

- `src/domain/bm25.ts` — BM25 in Node over the pool already filtered by the
  eligibility gate (no extension needed, no owner decision required, no index
  that can go stale exists). Formulas (V1, verified 2026-09-30): the IDF
  `log(1 + (docCount - docFreq + 0.5)/(docFreq + 0.5))` — the javadoc of Lucene
  `BM25Similarity`; `k1 = 1.2`, `b = 0.75` — the Lucene/Elasticsearch defaults
  ("Practical BM25, part 2"), **not tuned** here. The tokenizer keeps compound
  technical tokens (`c#`, `c++`, `node.js`, `.net`) and adds their parts (≥2
  characters), so "node" finds "node.js" and "c" does not match everything.
  Documents sharing no terms with the query are **not returned**: a position
  list that contains everything would hand fusion credit in the merge for what
  the leg did not find. The break-even threshold is recorded
  (`BM25_IN_NODE_POOL_LIMIT = 5000`) — beyond it the leg moves to PostgreSQL, and
  that is a separate decision.
- `src/domain/rrf.ts` — RRF over positions, `k = 60` (Cormack, Clarke,
  Buettcher, SIGIR 2009), plus leg weights; a document with a zero sum of
  contributions does not enter the result (a zero weight = the leg is
  withdrawn), negative weights are an error.
- `src/domain/retrieval-eval.ts` — the shared measurement of legs: the
  eligibility gate is applied before the leg, the metrics are the same as in A1,
  plus **complementarity** (how many relevant each leg found on its own) —
  without it the question "why fuse" has no answer.
- `scripts/eval-retrieval.ts` + `npm run eval:retrieval` — the three legs side
  by side, a sweep of `k`, a weight sweep, complementarity, latency; `--json`
  for machine reading.
- Tests: `tests/unit/retrieval-fusion.test.ts` (10 tests, including the matrix
  from the brief: "C#" is found by BM25; fusion lifts a document that won one
  leg; frequency saturation is non-linear).

## Measurement (2026-09-30, the real model, the frozen A1 set)

| Leg | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| dense (B1) | 0.663 | 0.843 | 0.760 | 0.804 | 0.806 |
| **BM25** | 0.660 | 0.877 | 0.827 | **0.881** | **1.000** |
| fused, k=60 | 0.680 | 0.836 | 0.800 | 0.827 | 0.833 |
| ranker v4 (for comparison) | 0.742 | 0.877 | 0.914 | 0.916 | 1.000 |

- **Complementarity (top-10, 32 relevant):** both legs 24 · dense only 1 ·
  BM25 only 2 · neither 5. That is, there is a real fusion margin (3 of 32), but
  the quality of the ordering falls because of it.
- **Weight sweep (NDCG@10 / R@10):** dense 1·bm25 1 → 0.827/0.836 · 2·1 →
  0.822/0.860 · 1·2 → 0.864/0.836 · 1·3 → 0.868/0.877 · **0·1 (BM25 alone) →
  0.881/0.877**. Monotonic: the smaller the dense leg's contribution, the
  better. This is the answer to the question "is dense useful in fusion **on
  this set**" — no.
- **k sweep:** 10/30/60 → 0.827, 100 → 0.833. There is no winner (a difference
  of 0.006 across 6 profiles — noise); `RRF_K` stays 60 until a distinguishable
  win appears.
- **Latency:** BM25 — 3–4 ms for all 6 profiles (in Node, no index); dense —
  ~110–120 ms per profile (cold query); embedding 34 documents — 1.1 s.

## Protocol V0–V6

- **V0.** A separate task; the DB schema was not changed (BM25 stores nothing).
- **V1.** The formulas were verified against primary sources (the Lucene
  javadoc, elastic.co) — not derived from memory; the constants were not
  "tweaked" to the set.
- **V2.** The leg does not widen the pool (the eligibility gate is applied
  before it), documents without matches are not returned, the fusion explanation
  is positions, not invented probabilities.
- **V3.** `npm run check` → exit 0 (**229/229** unit, previously 219);
  `npm run test:db` → exit 0 (51/51); `npm run build` → exit 0;
  `npm run test:e2e` → 96 passed; `npm run eval:retrieval` → exit 0;
  `npm run eval:matching` → exit 0 (the thresholds did not move, the ranker
  untouched).
- **V4.** The matrix from the brief: "C#" is found by BM25 (unit), fusion lifts
  a document that won one leg (unit), frequency saturation is sublinear (unit,
  with the honest caveat: on a small pool keyword-stuffing still wins — this is
  recorded by a test, not hidden); the complementarity and the sweeps — on the
  real set.
- **V5.** The A1 ratchet untouched; existing tests not weakened.
- **V6.** This file + `IMPLEMENTATION_STATUS.md` + `tasks/current.json`.

## On the honesty of the counter

Two of my **own expectations in tests** turned out wrong and were fixed in the
very first run: the threshold at which a leg's weight flips the fusion (it
turned out to be ≈ k, not 3), and the fate of a document with a zero weight (it
stays in the list with a zero sum — fixed in the code: it does not enter). There
was no defect in the code behind them. They could not be recorded as repair
cycles under the rule: the task counter was being held by B1-002 at the time.
Recorded here so that the count is not hidden.

## Limitations

1. **The semantic case from the brief ("ML developer" is found by the dense leg
   without an exact occurrence) is not checked against the real model**: the
   test double is lexical and does not demonstrate that property, and there is
   no suitable pair in the golden set. This remains a limitation of the
   measurement, not an assertion.
2. **The cross-language case is not measured** (4 Russian jobs, a profile
   without a language field) — exactly where the dense leg should win. The set
   does not distinguish the models, and this is an open item of §6.4 (who
   labels the pairs).
3. **Fusion is implemented but not used**: the fused order is nowhere in the hot
   path. The weights and k are default constants; tuned values require a set
   that distinguishes the legs.
4. BM25 without stop words and without stemming: the IDF already dampens
   frequent terms, and a stop list/stemmer is a question of measurement; for now
   this is a deliberate minimum with a recorded reason.
5. BM25 computes df over the query's pool, not over the catalog: as the pool
   grows this changes the IDF (in the limit it converges to the catalog). The
   break-even threshold is recorded in the module.

## Risk and rollback

The risk is low: nothing is wired into the feed, no new dependencies and no
tables. Rollback — `git revert` of the B2 commit: the two domain modules and the
measurement CLI are removed, the product does not change at any step.
