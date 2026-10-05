# AI-006 — C0, part 1: repair of the existing AI path

**Result:** the unguarded paid path is closed, the guarded one is repaired, and
three holes in the money machinery that the audit found live are closed. For the
batch path the option "disable until wired" was chosen (brief §C0 part 1
explicitly allows: «завести за `executeGuardedOperation` … или отключить до
завода» ["wire it behind `executeGuardedOperation` … or disable until wired"]) —
with a re-enablement plan, not a promise.

**Out of scope:** wiring the batch behind the gateway (that is a separate task:
see the "Batch re-enablement plan"), the owner quota and the operation ceiling
(A5), the release of `uncertain` holds (A6), `LIVE_AI_ENABLED` as a switch (A1),
the privacy of the candidate profile.

## What changed

### (б) The batch path is closed — and with it the recording hole (в)

- `src/server/ai/openai-batch.ts`: **the `openai` SDK is no longer imported** —
  `submitBatch` / `checkBatch` / `retrieveBatchResults` throw `BatchDisabledError`
  before any client is created. The dead client is removed, not "left disabled":
  a guardrail must not get by with a stale import. `isBatchEnabled()` returns
  `false` with a recorded reason (`BATCH_DISABLED_REASON`).
- The clean parts needed at re-enablement are kept and covered by tests:
  `buildJsonl` and the new **`parseBatchOutput`** — it, unlike the previous
  parser, counts `malformedLines` and `unknownCustomIds`, that is, it
  distinguishes "the model returned nothing" from "we lost the answer".
- `src/app/api/v1/relevance/route.ts`: both batch branches (submit and
  check/retrieve) answer `503 BATCH_DISABLED` with the reason and a hint about
  the guarded synchronous path. This also closes (в): the mapping `custom_id →
  snapshot_id` is no longer accepted from the request body, because the recording
  of results is unreachable too.
- `src/server/ai/batch-queue-service.ts`: submit and poll short-circuit when the
  path is closed and do not pretend "nothing to do" — `null` here is honest
  (nothing was sent), and the reason lies in one place.

### (г) Idempotency without clocks

- The operation key in the synchronous batch is now **content-addressed**:
  `chunkOperationKey(profileVersion, snapshotIds)` — a sha256 of the profile
  version and the sorted set of the chunk's post ids. `Date.now()` is removed: a
  repeat of the same request (a retry, a double click) finds the same operation,
  not a new paid one.
- A repeat whose operation is already in a terminal state is recognized and
  skipped: `WRONG_STATE` (the computation is finished — the scores are already in
  the cache) and `IDEMPOTENCY_COLLISION` (a terminal failure; the money layer by
  construction does not repeat) count as `duplicateChunks`, not as an error and
  not as new spend.
- Single analysis uses the same key (post + profile version).

### (д) Honest cost and visible refusals

- `totalCostMicroCents` — now the **sum of what was actually settled** from the
  ledger (the `settledMinor` of each chunk), not the constant `0`. Single
  analysis returns `costMicroCents`.
- The silent `catch { /* chunk failure doesn't stop the rest */ }` is replaced
  with explicit accounting: `failedChunks` (the model answered with something
  other than what can be saved) and `duplicateChunks` land in the response.
  Ledger refusals that mean "stop" (`BUDGET_EXCEEDED`, `BUDGET_UNAVAILABLE`,
  `ATTEMPTS_EXHAUSTED`, `DEADLINE_EXPIRED`, a missing transport, a revoked
  purpose) are no longer swallowed — the request stops and returns a code (402
  for money, 409 for states, 403 for policy, 503 for transport not in place).

### A4: the reservation is again an upper bound of the request

- `reservationFor(prompt)` in `provider.ts`: the input is bounded by **the number
  of characters of the prompt** (no tokenizer gives more tokens than characters —
  this is an upper bound, not an estimate, and it is true for Cyrillic too), the
  output — the transport's hard maximum (`maxOutputTokens`), because that is
  exactly how much the request is entitled to ask for. The previous fixed
  1200/400 were not an upper bound: the transport could ask for 8192 on output.
- Applied in both places that pay: synchronous relevance and letter generation
  (there it was 1500/3000 with the same discrepancy).

### Guardrail

- `scripts/guardrails.mjs`: the provider SDK is allowed **only** in
  `src/server/ai/openai-transport.ts`. Now `grep "from \"openai\"" src/` returns
  exactly one file, and this is checked statically — the A3 defect class ("one's
  own client wrapper next to the gateway") will not return silently.

## Checks

- `npm run check` → exit 0 (**233/233** unit, previously 230; biome; tsc);
  `npm run guardrails` → pass.
- `npm run test:db` → exit 0 (**52/52**, the new test "a repeat on the same key
  does not charge twice": the second call throws `WRONG_STATE`, the transport is
  not called once, `settled_minor` = 300, `held_minor` = 0).
- `npm run build` → exit 0; `npm run test:e2e` → **96 passed**.
- New unit tests: the reservation as an upper bound and its monotonicity; the
  batch closed (both locks — the switch and the throwing stubs); the batch parser
  counts broken lines and unknown ids.

## Batch re-enablement plan (so that the disabling does not become forgetting)

1. `TaskType`/purpose: the batch is the same `job_matching` task and does not
   need a separate purpose; but the 1-cent operation ceiling does not cover a
   batch over the whole catalog (≈1.05M input tokens ≈ 1.05 cents) → either chunk
   the request by 1 cent (≈285 posts per chunk at 1.5k tokens), or an owner
   decision about a ceiling for the asynchronous operation.
2. Reservation at submit + settlement at retrieve (two different transactions/
   requests), the operation id in the `ai_batch_queue` row (a column), not in
   memory.
3. Deadline/`uncertain` for the asynchronous operation: the batch window is 24 h
   against `OPERATION_DEADLINE_MS = 120 s` — a separate deadline and an explicit
   rule are needed ("the batch did not finish → the hold remains, a human sorts
   it out").
4. Mapping: the server stores `custom_id → snapshot_id` (as the queue already
   does) and never accepts it from the client.
5. Retries: `MAX_ATTEMPTS` for the batch (one submission attempt, because a
   repeated submission duplicates the payment).

## Limitations

1. **The automatic background stopped scoring**: `submitRelevanceBatch` was
   called from profile saving and from the worker — now it does nothing. Scoring
   remains available to the user as an explicit synchronous request (the guarded
   path). This is a deliberate loss of a function for the sake of no unguarded
   spend.
2. The route-level wiring (the 503/402/409 statuses, the chunk key, the counters)
   was verified by types, the linter and reading, but is **not covered by an
   integration test** of the route itself: the project has no tests on Next
   routes (a session and a Request are needed). The testable parts are extracted
   into pure functions and covered — `reservationFor`, the key, the parser, the
   ledger behavior.
3. A5 (the owner quota not created, the operation ceiling not compared) and A6
   (`uncertain` holds not released) remain open: they are not in the list (а)–(д)
   of part 1 and require a decision/a script, not only code in the paths.
4. A1 remains: `LIVE_AI_ENABLED=false` is still not a switch. But after this task
   **only** the guarded path can spend, so the price of the question fell from
   "any request" to "a request through the gateway".
5. `scripts/smoke-ai.ts` (B16) untouched: it is still not wired into the npm
   scripts. Its invocation goes through the gateway and now correctly refuses on
   a revoked purpose.

## Risk and rollback

The risk is low: closing a path is a prohibition, not a permission; the guarded
path keeps working and is covered by tests. Rollback — `git revert` of this task
(it would return the unguarded batch path together with the mapping hole — that
should not be done without the plan items) or pointwise: return
`isBatchEnabled()` to `true` — and even then the wiring behind the gateway is
still needed, otherwise the spend is outside the budget again.
