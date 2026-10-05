# EDEC-001 — owner decision batch #4 (section E of the inventory)

**What this is.** Section E of [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) — decisions, not
implementer work. Task: collect questions with facts and measurements, get
answers, implement what is implementable via code/policy, and register the
remaining tasks.

**Status:** implemented (2026-10-02).

## Package and answers

Full breakdown — [docs/design/2026-10-02-owner-decisions-04-batch.md](../docs/design/2026-10-02-owner-decisions-04-batch.md).
Owner answers (2026-10-02):

1. **Feed** → «Да, переключить на v4» [Yes, switch to v4]. Key measurement: catalog
   order NDCG@10 **0.421** against ranker v4 **0.892** (golden v4, 39 × 6).
   Implementation — task B23.
2. **Batch/privacy** → «Закрыто + задача оценки локальной модели» [Closed + a task
   for local model evaluation]. AI-007 privacy is not revoked; scoring and letters
   wait for a local generative model — MODEL-001.
3. **jobicy `process_with_ml`** → «Сначала перечитать условия» [First re-read the
   terms], then «Да, выдать» [Yes, grant it].
   **Done in this session:**
   - Fair Use re-read: «designed for … research tools, **AI products**…»;
     «**AI assistants** … without a separate agreement» — the same wording on which
     2026-10-01 granted the stronger `send_to_ai_provider`.
   - jobicy policy v4 → v5: `process_with_ml: allowed`, `reviewed_at`
     2026-10-02, `approval_reference` extended with decision #4; `terms_hash`
     unchanged (the terms text is the same), `train_model` remains denied.
   - Tests updated to the decision: `tests/unit/jobicy.test.ts`,
     `tests/unit/source-contract.test.ts`, `tests/integration/embeddings.test.ts`
     (the old "denied" check inverted with the decision recorded).
   - `npm run embeddings:index -- --embedder=local --source=jobicy` →
     `{result: "ok", embedded: 202, stored: 202}` — **B13 closed de facto**.
4. **Retention** → «Журнал 12 мес + tombstone» [Log 12 months + tombstone].
   Implementation — RET-001.

Items E.5–E.7 (company filters, ESCO, email) remain open — answers are
expected; recommendations in §9 of the package.

## Registration of next tasks

| Task | What | From decision |
|---|---|---|
| B23 | `/matched` on ranker v4 (+ log, shadow, tests, before/after measurement) | §1 |
| RET-001 | Log TTL 12 months + tombstone of closed records (migration) | §4 |
| MODEL-001 | evaluation of a local generative model (hardware/speed/quality) | §2 |

## Checks

`npm run check` → exit 0; `npm run test:db` → exit 0 (including the updated
embeddings test); `npm run test:e2e` → 96 passed; `npm run embeddings:index
--source=jobicy` → ok, 202/202. Spend: coding-host — `unknown`.
