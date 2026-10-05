# B3-001 — the reranker: everything done that does not require owner decisions

**Status: partially done (measured/prepared), 2026-10-04.** The only open
sub-question of B3 that does not run into owner decisions has been measured. The
rerank implementation is blocked **by construction**: owner decision No. 3 chose
the API path, which per ADR-001 turns into LLM scoring of phase C, and until four
separate owner decisions (§4.2–4.5 of the doctrine) plus its preconditions exist,
it can neither be built nor called.

## Why B3 was not started "as a reranker"

Brief card B3: a cross-encoder rerank of top-K (`bge-reranker-v2-m3` locally or
via API), input — top-50 "after RRF", output — the score of the "profile ↔ job" pair.

Owner decision No. 3 (2026-10-01): **«берём API вариант»** ["we take the API
option"], latency — «поднимаем бюджет до GPU» ["we raise the budget to a GPU"].
The decision doctrine (§2) showed that the chosen transport (OpenAI, the only one
approved by ADR-001) has no rerank endpoint, that is, "B3-API" = LLM scoring by
rubric (method 7 of the research) with all the attributes of phase C:
temperature=0, schema validation, grounding. The local cross-encoder was not
chosen for this task (and the doctrine ties its reopening to the appearance of a
GPU runtime — that is MODEL-002).

## What was done (the only thing not waiting for decisions)

**The §6 question of the doctrine — "the reranker input" — has been measured.**
`npm run eval:retrieval` on golden set v4 (2026-10-04, dictionary v3, reference
time 2026-09-29):

| input (top-K) | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| the ranker v5 order (shipped) | 0.611 | **0.850** | 0.875 | **0.892** | 1.000 |
| BM25-l1 | 0.595 | 0.734 | 0.765 | 0.810 | 1.000 |
| fused RRF k=60 | 0.590 | 0.755 | 0.735 | 0.771 | 0.833 |
| dense-l1 | 0.575 | 0.823 | 0.707 | 0.766 | 0.806 |

Conclusion: **"rerank top-50 after RRF" is not confirmed by the measurement** —
fused is weaker than both BM25 and the ranker order on all metrics; the input of
the future rerank should be planned from the **ranker order**. Doctrine §6 itself
warned about this risk («если B3 построить на fused-списке по инерции, он стартует
с более слабого списка и может не улучшить NDCG@10 по причине, к реранкеру не
относящейся» ["if B3 is built on the fused list out of inertia, it starts from a
weaker list and may fail to improve NDCG@10 for a reason unrelated to the
reranker"]) — now these are numbers.

An additional constraint, important for estimating the future gain: 8 of the 38
relevant posts **do not get into the top-10 of any leg** (complementarity: both 27,
dense-only 2, BM25-only 1, neither 8). A reranker reorders the candidate list and
will not reach these 8 with any rubric — another retriever covers them, not a rerank.

## What blocks the implementation (owner decisions, with the code correction of 2026-10-04)

1. Purpose/task_type `rerank` (migration + whitelist) — an owner decision.
2. ~~`send_to_ai_provider` rights ×3~~ — **closed 2026-10-01 (AI-005): the right
   was granted to all three sources** (`source-policies.ts:38,102,170`); this task
   first repeated the doctrine's outdated claim — corrected and recorded.
3. Profile privacy: whether to send the profile text to a third party (or a rerank
   without the profile — then the quality of the judgment must be measured, not promised).
4. The quota (raised 2026-10-01 to $1/mo — ≈106–147 feeds; the §3 arithmetic of
   the doctrine at 50 cents is historical) and the operation ceiling (1 cent is
   almost entirely consumed by one feed) — a revision by a separate decision.
5. Labeling of the cross-lingual extension of the golden set (§8.2).

The §4.1 precondition (C0 part 1) was **closed** earlier by task AI-006: the batch
path is closed (503 with a reason and a re-enable plan), the purposes whitelist is
checked by the gateway before money moves; section A of the inventory is fully closed.

## Checks

Product code was not changed: the measurement ran via the existing command
`npm run eval:retrieval` (exit 0). The other checks were not re-run due to the
absence of changes in `src`/`tests` — this is recorded honestly, not presented as
run. A rollback is not needed (there are no changes).

## Next step

Owner decisions on items 1–5 (the package — §9 of decision doctrine No. 3). After
them B3 decomposes into: one rubric + one measurement run on the chosen input (the
ranker order), a task_type migration, grants, a quota revision — that is, B3 as a
phase C task, starting with C0 (already done).
