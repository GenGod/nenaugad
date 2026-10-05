# Owner Decision No. 3 (brief section 7, item 3): the reranker

Date: 2026-10-01. Branch: `feature/A1-golden-set-eval-harness`.

**Status: the owner's answers have been received; activation is impossible until the preconditions of §4.**
Three questions were open after B1/B2 (brief section 7 item 3: «Reranker: local
bge-reranker or API; latency budget»). The answers are recorded verbatim; below is what
they mean in practice, what they cost at the verified prices, and what must happen
before the first real provider call.

**Document boundaries:** the decision, the verified facts and the preconditions are recorded.
The reranker is not implemented and not measured: not a single line of B3 code, not a single
token sent to the provider.

## 1. The owner's answers (2026-10-01)

1. **What to rerank with and where it works:** «берём API вариант, т.к. API будет дешевле.
   имеющийся OpenAI подойдёт?» [we take the API option, since the API will be cheaper.
   would the existing OpenAI fit?]
2. **Latency budget:** «добавляем предупреждение и поднимаем бюджет до тех
   пор, пока не появится более мощный GPU» [we add a warning and raise the budget until
   a more powerful GPU appears].
3. **A question created by the B2 measurement** (rerank input: «after RRF» vs BM25):
   «можем отложить на потом?» [can we postpone it for later?] — postponed, see §6.

## 2. What «API» means within ADR-001

**Verified fact:** ADR-001 forbids «a separate vector DB service, queues,
a model router, a new API layer», and the brief, in the list of rejected approaches, directly
names «an external rerank service (ADR-001)»
(`docs/design/2026-09-27-matching-implementation-brief.md:509`). So Cohere
Rerank / Jina v2 / Voyage rerank as the «API option» are not
chosen by the owner's decision: that is a second external service. Within ADR-001, «API» = the already
approved OpenAI transport (`src/server/ai/openai-transport.ts`, AI-002, 2026-09-25).

**But OpenAI has no rerank endpoint.** There is no cross-encoder (a model that reads a pair
«query+document» in full) in OpenAI's API: there are embeddings (bi-encoder — already
covered by the local model B1) and generative models. So the «B3 formula» changes
substantially:

| As in the plan (§B3) | As it comes out with the chosen transport |
|---|---|
| Cross-encoder rerank of top-50 (`bge-reranker-v2-m3` locally or API) | **LLM rubric scoring** with structured output — this is method 7 from research, that is, phase C mechanics |
| Pair score «profile ↔ job» from cross-attention | A model judgment score against criteria, with schema validation and grounding on the extracted fields |
| Local model, zero text transfer | The job text **and the profile text** go to the provider |

This is not nitpicking about wording: the two mechanisms have different properties — a cross-encoder
gives a deterministic pair score and does not «explain», an LLM gives a rubric, an explanation and
a risk of output instability. Plus the LLM path requires temperature=0, schema validation
and (per research) separate control — none of which was in the B3 plan, because the plan
assumed a cross-encoder.

**Practical conclusion:** «B3 via OpenAI» is a phase C task in mechanics and
gates. It cannot go before C0: C0 is a precondition of phase C, and it also fixes
the existing path (§4).

## 3. Price: arithmetic at the verified prices

Provider prices — verified 2026-09-25 (`src/server/ai/provider.ts`):
`gpt-6-luna`, input **$0.10/MTok**, output **$0.50/MTok**. Caps: operation
**1 cent**, user quota **50 cents/month**, environment budget **$10**.

The sizes are ours, from the Decision No. 2 measurement: posts of 4.5–6.6k characters ≈ **1.2–1.7k tokens**;
profile B1 ≈ 0.2–0.3k tokens with the rubric.

One scoring pass over a result set (top-50 candidates in one request — the variant that fits
within the operation cap):

| Item | Tokens | Price |
|---|---|---|
| Input: 50 × 1.2–1.7k post + profile and rubric | 60–86k | $0.0060–0.0086 |
| Output: 50 × ~30 (score + short explanation) | 1.5k | $0.00075 |
| **Total per result set** | | **≈ $0.0068–0.0094 (0.7–0.94 cents)** |

Consequences that must be seen before the decision to enable:

* **The 1-cent operation cap** is eaten almost entirely: a result set passes «with a tight fit»,
  and any lengthening (top-100, longer descriptions, a bigger rubric) breaks through it.
* **The 50 cents/month user quota** turns into **≈ 53–72 scored
  result sets per user per month**. Twenty page reloads a day — and
  the quota runs out in three days. For reranking in the product, the quota must be revisited —
  that is a separate owner decision, not an implementation detail.
* **50 separate calls instead of one** give the same tokens, but 50 operations with
  their own attempt counters and a latency of 50 network round trips; one
  big request is cheaper both in quota and in time.
* **A dedicated rerank API is cheaper by roughly a factor of 3.5–4.7** (on the order of $2/1000
  searches ≈ $0.002 per result set of 50) and gives ~250 result sets per 50 cents. But this is exactly
  the «external rerank service» rejected by ADR-001: the price of following the ADR is roughly
  four times more per result set and a four times tighter quota. Stated so that the choice is
  conscious and does not look like «the API is cheaper in general».

## 4. Preconditions before the first real token (verified in code 2026-10-01)

None of this is done; together they mean that B3-API today cannot
make a single call. **Clarification dated 2026-10-01 (audit of the existing
functionality, `docs/OPEN_GAPS.md` A1–A7):** the existing AI path, however, already
*can* spend money — the environment has `OPENAI_API_KEY`, and `LIVE_AI_ENABLED=false`
disables nothing, because the live path depends on the presence of a transport, not on
the flag; the purpose `job_matching` is not approved, but executes; the batch path goes past the gateway;
the reservation is less than the requested token maximum. This is not a B3 precondition, but an open
defect of the existing functionality — see section A of the inventory.

1. **C0, part 1 — repairing the existing path** (Owner Decision No. 10 prescribed
   it ahead of schedule; it has not been done). Verified in code:
   * the `executeGuardedOperation` gateway (`src/server/ai/gateway.ts:31`) **does not check
     the purposes whitelist** — the function has no purpose parameter at all;
     `isPurposeApproved` (`provider.ts:47`) is not called anywhere except tests;
   * `src/server/ai/openai-batch.ts` pulls the SDK directly (`import OpenAI from
     "openai"`, its own client on line 10) and does not call `executeGuardedOperation`
     at all — that is, the batch path reaches the provider past the budget, the counters and the deadline;
   * the `custom_id → snapshot_id` mapping and idempotency — from the original C0 list,
     I did not re-check them in detail, because the first two items already block.
2. **A new task_type/purpose.** Today `TaskType = "job_extraction" |
   "cv_extraction" | "cover_letter" | "job_matching"` (`src/server/ai/spending.ts:20`),
   and the DB has a CHECK on the same list (migration 0011). A new type is needed
   (`rerank`), a migration, a value in the `approvedPurposes` whitelist and an owner
   decision on each item separately — as was done for `cover_letter`.
3. **Source rights.** `send_to_ai_provider` is `denied` for **all three** sources
   (`src/server/source-policies.ts:34,92,152`). Without the grant, the job text
   cannot be sent, that is, there is nothing to rerank. These are three separate decisions
   (fixtures, himalayas, jobicy), and they are not derivable from `process_with_ml`.
4. **Profile privacy — an open sub-question that the decision does not close.**
   Rubric scoring requires **both** sides: the candidate's profile text goes
   to the provider. Decision No. 2 (§6.5) chose a local model precisely so that this
   would not happen, and forbade mixing versions/logging the text. So an explicit
   answer is needed: do we allow the profile to be transferred to a third party for the sake of rerank — or
   does rerank work only on the job and coarse profile features (then the quality of
   judgment is lower and that must be measured, not promised).
5. **Quota and operation cap** (§3) — to be revisited as a separate decision.

## 5. Latency: the owner's decision and a clarification

Decision: «добавляем предупреждение и поднимаем бюджет до тех пор, пока не
появится более мощный GPU» [we add a warning and raise the budget until
a more powerful GPU appears].

**A clarification on substance.** The rationale «until a GPU appears» applies to the **local**
reranker: there the bottleneck is our CPU (measured on an adjacent model: ~0.7 s per one
live post per pass, and a cross-encoder scores pairs — top-50 turns into tens of
seconds). In the chosen **API variant** our CPU is not involved: the time is determined by
the provider (one request with ~60–86k input tokens), and a GPU will not speed it up. That is,
raising the budget «until a GPU» makes no sense — what makes sense is a separate **stage**
budget with a warning, and the hardware has nothing to do with it.

**The form proposed for adoption (and why it is not in code yet):**
* the budget `p95 ≤ 250 ms` (`src/domain/rank-guardrails.ts:31`) remains **hard** and
  unchanged: it measures our deterministic part, and the existing
  test must not be weakened (AGENTS.md: do not weaken checks for green).
* the provider stage has **its own** boundary: exceeding it produces a **warning**
  (`warnings` in the guardrails report), not a failure, with a recorded reason.
* the mechanism (`warnings` + soft threshold) is **not added now**: it has no
  consumer — the stage does not exist, and the numbers cannot be measured. The project forbids
  speculative code without a consumer («do not pass stubs off as implementation»). It will enter
  B3 as one task, where it will have a measured threshold.
* as soon as a GPU appears and the local variant becomes fast — the question is reopened
  on numbers, not on the memory of a decision.

## 6. The postponed question from B2 (recorded so that it is not lost)

**What is postponed:** the rerank input. The plan says «rerank top-50 **after RRF**», but the B2
measurement showed that RRF fusion is **worse** than BM25 alone (NDCG@10 0.827 vs 0.881), and with
weights the matter is monotone: the smaller the contribution of the dense leg, the better. So the
fused list is not the best input, and «after RRF» rests on the plan, not on a measurement.

**Why postponing is safe:** all three input variants (BM25 alone, fused, ranker
order v4) are already measurable with one command `npm run eval:retrieval`; the decision can be re-made
at any moment before enabling, and it costs nothing.

**The cost of the postponement, so that it is not invisible:** if B3 is built on the fused list out of
inertia, it starts from a weaker candidate list and may «fail to improve NDCG@10»
for a reason unrelated to the reranker. Recorded here as a known risk.

## 7. What has not been verified and not decided

- **Rerank quality is not measured** (there is nothing to measure: there is no code). The estimate
  «will improve NDCG@10» — from research, not from our own measurement.
- **The latency of one request with 60–86k input tokens on `gpt-6-luna` is not
  measured.** The «seconds» estimate is an assumption; before enabling, one
  trial call is needed (after the preconditions of §4).
- **The prices of dedicated rerank APIs** are taken by order of magnitude from research and were not
  re-checked on 2026-10-01; in the decision they serve only to compare orders.
- **The token estimate** rests on the Decision No. 2 measurements (1.2–1.7k tokens per post) and
  assumes that rerank receives the full description; if cutting by excerpt, the price
  drops, and the quality of judgment is a matter of measurement.
- **Grants and purpose are not issued**, the task_type migration is not made, C0 part 1 is not
  repaired.

## 8. What next (proposed order)

1. **C0, part 1** (repairing the AI path) — per Decision No. 10 it was going ahead of schedule
   anyway; now it has also become the entry point to B3-API. This is the next concrete step, and
   it does not require new owner decisions.
2. Cross-language expansion of the golden set (the labeling question is open) — without it
   there is nothing to confirm that rerank or the dense leg gives any gain at all.
3. Then B3 as a phase C task: a new purpose, `send_to_ai_provider` grants,
   a decision on profile privacy (§4.4), revision of the quota (§4.5), one rubric,
   one measurement run.

## 9. Update 2026-10-04 (after the preconditions were executed)

**Precondition §4.1 is closed:** C0 part 1 was executed by task AI-006 (the batch path was closed
with the «disable before commissioning» option — a 503 with a reason and a re-enablement plan;
the purposes whitelist is checked by the gateway before money; three holes in the money machinery are
closed). Section A of the inventory is fully closed (AI-004…AI-007).

**The §6 question (rerank input) is measured** — `npm run eval:retrieval` on golden set v4
(2026-10-04, dictionary v3, reference time 2026-09-29):

| input (top-K) | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR |
|---|---|---|---|---|---|
| ranker v5 order (shipped) | 0.611 | **0.850** | 0.875 | **0.892** | 1.000 |
| BM25-l1 | 0.595 | 0.734 | 0.765 | 0.810 | 1.000 |
| fused RRF k=60 | 0.590 | 0.755 | 0.735 | 0.771 | 0.833 |
| dense-l1 | 0.575 | 0.823 | 0.707 | 0.766 | 0.806 |

The answer to the postponed question: **«rerank top-50 after RRF» is not confirmed** — fused
is weaker than both BM25 and the ranker order on all metrics; the best available candidate list
today is the ranker's own order. The rerank input should be planned from it, not from
the fused list (§6 itself named this risk — now it is numbers). Additionally: 8 of 38
relevant posts do not make it into the top-10 of **any** leg (complementarity: both 27,
dense-only 2, BM25-only 1, neither 8) — the reranker will not reach them by construction; this is
work for a different retriever, not for the rerank, and it limits its ceiling.

**What remains open is the owner's decisions (§4.2–4.5) and the labeling question §8.2
(with a code correction dated 2026-10-04):**

1. **The `rerank` purpose/task_type**: a CHECK migration on task_type + a value in
   `approvedPurposes` — an owner decision (following the `cover_letter` pattern).
2. ~~Source rights `send_to_ai_provider`~~ — **closed 2026-10-01 (AI-005):
   the right was granted to all three sources** (`source-policies.ts:38,102,170`). Early
   revisions of this item and §4.3 called it denied — that was true on the date of the
   doctrine, but ceased to be true on the same day. Verified in code 2026-10-04.
3. **Profile privacy** (§4.4): do we allow the profile text to be transferred to a third
   party for the sake of rerank — or does rerank work without the profile (then the quality of
   judgment must be measured, not promised). Remains open.
4. **Quota and operation cap** (§3): the owner's quota was raised by the decision of 2026-10-01
   to **$1/month** (in §3 the arithmetic is recorded at 50 cents — historical); at
   $1 this is ≈106–147 scored result sets per user. The operation cap of
   **1 cent** has not changed and for a top-50 result set it still almost entirely goes to it.
   The decision to revisit it is separate and remains open.
5. **Labeling of the cross-language expansion of the golden set** (§8.2) — the question is open.

Until these decisions B3 remains unimplemented **by construction** (and not out of inertia): not
a single provider call, not a single line of reranker code. The only thing executed without
decisions is the measurement above (task
[B3-001](../tasks/B3-001-reranker-input-measurement.md)).
