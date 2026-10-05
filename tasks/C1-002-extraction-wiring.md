# C1-002 — wiring extraction into the pipeline (pass, worker, import scripts)

**Status: implemented, 2026-10-04.** There has been no live run — it is only possible
with `LIVE_AI_ENABLED` on, and that remains an explicit owner action.

## What was done

1. **`src/server/ai/extraction-pass.ts`** — the periodic form of the run: one cycle
   for the worker, import scripts and CLI. Rules:
   - the owner switch comes first: with `LIVE_AI_ENABLED` off, the pass answers
     `live_ai_disabled` and **touches nothing** (no text, no money) — this is the
     normal state today, not a failure;
   - refuges (`lifecycle: "tombstoned"`, RET-001) are skipped: there is no text, and
     there is nothing to pay an empty prompt for. The filter is by `lifecycle` from
     the contract, not by `tombstoned_at`: the card reader does not return that
     column (a lesson from the implementation);
   - `no_permission` on an expired policy — a refusal before a single line;
   - **a budget refusal stops the pass entirely** with a code
     (`OWNER_BUDGET_MISSING`/`BUDGET_UNAVAILABLE`/`BUDGET_EXCEEDED`) — continuing is
     pointless, all remaining posts would fail the same way; `npm run seed:budgets`
     provisions the extractor row (`u_extraction_001`, it is not a candidate);
   - `settledMicroCents` counts **only fresh** pass spend: the `already_*`
     answer comes from the record and names the old payment (the defect was caught
     by an integration test — before the fix the cost doubled);
   - a per-pass limit (the worker takes 25 posts per source per tick).
2. **Worker**: after a successful source import — the pass (not fatal for the import);
   the `extraction` event is logged only when something actually happened
   (flag off is the norm, visible in `--status`, now with a `liveAi` field).
3. **Import scripts** (`import:himalayas`, `import:jobicy`): the pass after a
   successful walk, a compact summary in the printed JSON (`summarizeExtractionPass`).
4. **`seed:budgets`**: provisions the extractor row explicitly (the ledger refuses
   when the owner row is missing — A5).
5. **CLI** moved to the shared pass (the duplicate cycle and the auto-provisioning of
   money removed); on a budget refusal it prints a hint about `seed:budgets`.

## Checks (exit 0)

- `check` **273/273** + lint + typecheck; `build`; `guardrails` (scanner caveat: not
  an isolation audit); `test:db` — **two runs in a row**, including the new file
  `tests/integration/extraction-pass.test.ts` (+3 tests: the flag off touches
  nothing; the pass extracts only what is missing, skips tombstones, honors the
  limit and does not pay for repeats; `no_permission` on an expired policy and
  `budget_refused` with `OWNER_BUDGET_MISSING` when the row is missing).
- Live (no spend): `extract:fields --source=himalayas --limit=1` → an honest
  `live_ai_disabled`; `worker --status` → `liveAi: false` for every source.

## What remains

**The first live run** — only via an explicit owner action: `LIVE_AI_ENABLED=true`
+ a key, then `npm run seed:budgets` (once) and
`npm run extract:fields -- --source=himalayas --limit=5` as the first small step.
Each post ≈0.03–0.05 cents, the operation ceiling is not being approached.

**Rollback:** remove the pass calls from the worker/import scripts (the product path
returns to the status quo), delete `extraction-pass.ts`; the `job_llm_fields` table
stays empty and harmless, or is dropped together with migration 0019.
