# AI contour (`src/server/ai`)

AI is connected and works through a single guarded entry point; by default it is off and
refuses fail-closed. This file is a reading order for the code. The gap inventory is in
`docs/OPEN_GAPS.md`.

## The single entry point

`gateway.ts` — `executeGuardedOperation`. Every paid call goes through here, and
before any movement of money the following is checked in order:

1. `LIVE_AI_ENABLED === "true"` (owner decision 2026-10-01). A key in the environment
   turns nothing on; the switch is the flag, other values are fail-closed.
2. The purpose is in `approvedPurposes` (`provider.ts`): today `cover_letter`
   (AI-002) and `job_matching` (AI-004). A new purpose is a separate owner decision.
3. The worst-case cost does not exceed the operation ceiling (1 cent).
4. An atomic reserve of the global and personal budgets (`spending.ts`);
   a missing personal row is a refusal, not «нет потолка» [no ceiling].
5. The attempt is persisted before dispatch; the operation attempt counter is the only
   retry budget, SDK auto-retry is off.
6. Deadline, `uncertain` (the hold is kept, there are no blind repeats) and settlement —
   in the same `ai_operations` row.

## Transport

`openai-transport.ts` is the **only** module allowed to use the provider SDK
(a static check in `scripts/guardrails.mjs`). Exactly one attempt per dispatch;
network errors, timeouts and a response without usage — `uncertain`.

## Personal data boundary

`personal-data-boundary.ts`: only the vacancy text may be sent to the provider.
Operations that need candidate data (`cover_letter`, `job_matching`)
refuse with `PERSONAL_DATA_BOUNDARY` until a local model serves them —
owner decision 2026-10-01. A consequence, named honestly: scoring and letters
are closed today by design, not by oversight.

## OpenAI Batch

Closed (AI-006): `openai-batch.ts` does not import the SDK, the route answers
`503 BATCH_DISABLED`, the queue short-circuits. The re-enablement plan (reserve at
submit, settlement at retrieve, a term for the asynchronous operation, a ceiling,
server-side mapping) is recorded in the module; enabling it is an owner decision.

## Operations

- `npm run seed:budgets` — the global budget and personal quotas (idempotent;
  for new users the row is created at registration).
- `npm run ai:holds` — the list of operations holding money; `--cancel=<id>` releases a
  hold the provider did not charge, and `--settle=<id> --amount=<μ$>` books the charge of
  an uncertain call from the provider's usage page (`--above-reservation` for one above
  its worst case). Both are a human decision, not a reaper's.
- `npm run smoke:ai` — one guarded live call to the provider. It spends real
  money; it refuses while `LIVE_AI_ENABLED != true`; it creates its own budget
  rows, so it works on a fresh DB.
- Guard tests: `tests/unit/ai-provider.test.ts`,
  `tests/integration/ai-guards.test.ts`.

The `disabled.ts` stub was deleted: do not create a second switch. Live sources
deliberately have no flag — the control lies in the source policies.
