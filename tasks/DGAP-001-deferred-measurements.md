# DGAP-001 — deferred measurements and constants (inventory section D)

**What this is.** The owner directed closing section D of
[docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md): items deferred as «не дефекты, но и не
проверено» ["not defects, but not verified either"]. The principle: close what
closes by measurement; the rest remains, but with an honest reason.

**Status:** implemented (2026-10-02).

## What was closed by measurement

1. **Golden set coverage gaps** — set v3 → v4 (34 → 39 jobs):
   - `golden-j35` — geography *not specified*: GEO-01 stays unknown (not worldwide
     and not a rejection), the job goes into «нужно уточнить» ["needs
     clarification"]; judged 2 for p-devops-eu (A2-001 item 4 asked exactly for
     the unknown path, verified by a metric).
   - `golden-j36` / `golden-j37` — cross-lingual semantic cases: Russian text
     without a single Latin token (ML and QA automation), judged 3 for
     p-ru-ml and 2 for p-qa-us / p-data-asia (B1-001 item 2, B2-001 items 1-2).
   - `golden-j38` / `golden-j39` — a second freshness twin pair: a different age
     (100 days versus 2) and a different profile (frontend), judgments 2/3
     (A5-001 item 2).
   - All 5 new jobs were judged for all 6 profiles; the guards "unjudged shown 0"
     and "relevant but hidden 0" remain zeros.

2. **The cross-lingual and semantic measurement on the live model** (`npm run
   eval:dense`, `npm run eval:retrieval`; the local Qwen3-Embedding-0.6B from
   `models/`):
   - BM25 **does not find** the semantic cases at all — they stay in `uncovered`
     (6 of 30 shown for p-ru-ml): the lexical leg has nothing to latch onto;
   - dense finds them and places them mid-list: `golden-j37` — #6 for p-qa-us,
     `golden-j36` — #15 for p-ru-ml; the v4 ranker — #11 and #12 respectively;
   - the aggregate on set v4: dense NDCG@10 0.766 · BM25 0.810 · fused k=60 0.771 ·
     **ranker v4 0.892** → the §6.4 conclusion «не переключать» ["do not switch"]
     is confirmed on the grown set; the weight grid is still monotonically better
     without dense (dense 0 · bm25 1 → 0.810);
   - complementarity (top-10, 38 relevant): both legs 27 · dense only 2 ·
     BM25 only 1 · neither 8.

3. **The ratchet thresholds were rebased with a recorded reason** (the set grew
   and brought hard cases that v4 is not supposed to solve): R@5 0.742261 →
   0.610606, R@10 0.877380 → 0.850378, NDCG@5 0.918614 → 0.874763, NDCG@10
   0.920153 → 0.892047; the history is in the header of
   `tests/unit/matching-eval.test.ts`.

4. **Impressions in the journal:** e2e physically cannot cover them
   (playwright.config: `DATA_BACKEND=fixture`, the feed is honestly empty), so the
   minimal closure — the payload of both reports is pinned by a unit test
   (`tests/unit/journal-payloads.test.ts`), the collectors extracted into
   `src/components/journal-reporter.ts`. E2E on the real backend — a separate
   infrastructure task (a postgres profile for Playwright): named, not issued.

## What remains and why

- **Constants waiting for data** (the freshness half-life, the −12/−6 thresholds
  and "stack ≥4", the ghost weights −20/−25, the BM25→DB threshold 5000): changing
  them without data is not allowed; **data collection is now possible** — the
  journal has been writing clicks and server-side propensity since BFIX-001
  (2026-10-02). Until accumulation, the constants stay untouched.
- **Single-machine measurements** (p95, the shadow on fixtures, the champion — the
  catalog order): these are closed by a second machine and traffic, not by code.
- **The profile language field** is absent — that is a product decision (a
  language filter), not a measurement; the set judgments deliberately do not
  involve language (the set header).
- **Cost/hardware** (reindexing ≈30 min, ONNX memory, a 625 MB artifact outside
  git, onnxruntime-node without postinstall): artifact properties, they remain as is.
- **BM25 df over the query pool** — deliberate mechanics with a recorded crossover threshold.
- **Letter copy** (`S4-002` acceptance 4): the replacement of «Заполнить профиль»
  ["Fill in the profile"] with «Понятно, правлю вручную» ["Understood, editing
  manually"] — deliberate, recorded in the status; requires no code.

## Checks (2026-10-02)

`npm run check` → exit 0 (unit **240/240**, biome 210, tsc clean); `npm run test:db`
→ exit 0 (**55/55**); `npm run build` → exit 0; `npm run test:e2e` → **96 passed**;
`npm run eval:matching` → set v4, guards 0/0, the thresholds rebased;
`npm run eval:dense` / `eval:retrieval` → the numbers above (live model). Costs:
coding-host — `unknown`.
