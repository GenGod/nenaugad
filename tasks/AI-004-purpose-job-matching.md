# AI-004 — purpose `job_matching`: approved by the owner and executed for the first time

**Result:** the owner approved the purpose `job_matching` (2026-10-01), and — more
important than the approval itself — the purposes whitelist stopped being dead
code: the gateway checks the purpose **before any money**, and the operation type
(the spend bucket and the attempt counter) is derived from the purpose, so they
can no longer be desynchronized. An unapproved purpose creates neither an
`ai_operations` row nor a budget hold.

**Why this was not "just add a line to the list":** before this task
`isPurposeApproved` was not called anywhere outside tests, and the gateway accepted
any `taskType` — that is, the relevance path executed `job_matching` without
approval, and there would have been nothing to add to the list with: nobody read
the list.

**Out of scope, and not resolved by this decision:**

1. **The batch path still goes to the provider past the gateway**
   (`src/server/ai/openai-batch.ts`) — there is no reservation, attempt counter,
   deadline or `uncertain` handling there. This is the next item of C0-part-1.
2. **The right to transmit source text is not granted.** `send_to_ai_provider` =
   `denied` for all three sources (`src/server/source-policies.ts:34,92,152`).
   Approving a purpose is "what may be entrusted to the model", not "whose text
   may be sent": AGENTS.md requires three approvals (source/purpose/provider), and
   the decision closed only the second. While the grant is absent, the relevance
   path sends job text against the rights matrix — this is an open item, not a detail.
3. `LIVE_AI_ENABLED=false` still switches nothing off: the enabler is the presence
   of a key and transport (`docs/OPEN_GAPS.md` A1).
4. The reservation is below the requested maximum of tokens, the owner quota is
   not set up, the operation ceiling is not compared, `uncertain` holds are not
   released, idempotency does not work (`OPEN_GAPS` A4–A7).

## What changed

- `src/server/ai/provider.ts` — `ApprovedPurpose = "cover_letter" | "job_matching"`,
  `approvedPurposes: ["cover_letter", "job_matching"]`, a comment with the decision
  date and the explicit caveat «одобрение purpose ≠ право на текст источника»
  ["purpose approval ≠ the right to the source text"].
- `src/server/ai/gateway.ts` — `PurposeNotApprovedError` (`AI_PURPOSE_NOT_APPROVED`);
  the `taskType` parameter was replaced by `purpose: string` (checked at runtime — a
  purpose is data that can be revoked, not only a type); the `PURPOSE_TASK_TYPE`
  mapping derives the spend bucket from the purpose; the check comes first,
  before reading the budget and before `reserveBudget`.
- Callers: `src/app/api/v1/relevance/route.ts` (`job_matching`),
  `src/app/api/v1/cover-letters/[id]/generations/route.ts` (`cover_letter`),
  `scripts/smoke-ai.ts`.
- Tests: `tests/unit/ai-provider.test.ts` (the list in full + `job_matching`
  approved, `cv_extraction`/`job_extraction` — not); `tests/integration/ai-guards.test.ts`
  (an unapproved purpose is rejected: no operation row, the hold stayed zero,
  settled unchanged).

## V0–V6 protocol (brief)

- **V3.** `npm run check` → exit 0 (**229/229** unit, biome, tsc);
  `npm run test:db` → exit 0 (**51/51**); `npm run build` → exit 0;
  `npm run test:e2e` → **96 passed**.
- **V4.** An unapproved purpose is rejected **before** money moves (integration:
  no `ai_operations` row by key, `held_minor` = 0, `settled_minor` unchanged); the
  approved `job_matching` passes and is written to its own bucket
  (`PURPOSE_TASK_TYPE`), not a foreign one.
- **V5.** Existing checks not weakened: the gateway tests were updated for the new
  parameter shape (purpose instead of taskType); the assertions about reservation,
  settles, `uncertain` and the kill switch are preserved verbatim.

## Limitations

1. `cv_extraction` and `job_extraction` remain unapproved and are now structurally
   inexpressible as purposes (they are absent from the mapping). If they are
   needed — a separate decision, as was the case with `job_matching`.
2. The live path behavior did not change: `job_matching` was allowed de facto and
   became allowed de jure. That is, this decision does **not** stop the spending —
   it makes the permission explicit and verifiable. Only a grant/revocation of the
   key can stop it (see "Out of scope" items 1-3).
3. The date and the wording of the decision are recorded in the code and here; a
   separate decision document was not created — following the `cover_letter`
   pattern (AI-002, 2026-09-25), where the approval lives in the task file and in
   the code.

## Risk and rollback

Low risk: the change is additive (a newly approved purpose) plus a stricter check
that rejects none of the existing calls. Rollback — `git revert` of this task's
files: the whitelist becomes dead code again and the list its former self; the
live path behavior is unaffected.
