# AI-001 — guards for paid operations (before any provider)

**Result:** a resilient spend-control core in the main DB — atomic budget
reservation, persistent attempt counters, a deadline, uncertain charges,
commit-time revalidation and a global kill switch — tested negatively and
for concurrency; no real provider is connected.

**Not included:** the SDK, the key, a real model call, provider/price choice,
queue-as-a-service, letters (the S4 contract stays disabled).

**Context:** AGENTS Boundaries (the full list of protections before activation); SP 9
(operations/attempts, worst-case reservation, decimal, held+settled+new<=limit,
SDK retry off, uncertain, do not lose holds, kill switch); spec 19.2 AI-boundary.

## Acceptance
1. Migration 0009: `ai_operations` (owner, task_type, idempotency_key UNIQUE,
   status, deadline_at, attempt_count, input_hash, created_at) and
   `ai_budgets` (scope: global|owner, period, approved_limit_minor,
   settled_minor, held_minor — integer minor units). CHECK on
   non-negativity; unique keys.
2. Atomic reservation: a single transaction with a row-lock reads `settled+held+new_worst
   <= approved_limit` and increments `held`; parallel reservations do not
   spend one remainder (an integration test on two concurrent);
   the DB being unavailable → refusal, not "we will try without a reservation".
3. Attempts are persistent: dispatch is recorded before the call; the attempt
   counter of an operation is not reset by a retry wrapper or by a new
   idempotency key; maximum attempts per type (from SP 9: extraction 2, cv 2,
   letter 4).
4. Uncertain: a failure between dispatch and result → status `uncertain`, the
   reservation is held, a blind repeat is forbidden (a negative test).
5. Commit-time revalidation: before the transition to `settled`, the owner,
   idempotency key, status and deadline are rechecked (a conditional UPDATE); an
   expired deadline stops new steps but does not "make the request free".
6. Kill switch: a global budget record with `approved_limit_minor = 0`
   blocks all new reservations immediately; user quotas — the same
   mechanics with scope=owner.
7. The gateway (`src/server/ai/gateway.ts`) — the single point of future calls:
   fail-closed without a provider; a transport interface is injected for tests
   (a mock with delay/failure/uncertain); SDK retry is off by contract.
8. All tests offline (mocks), integration ones on the test DB; e2e unchanged
   (AI is not visible in the UI).

**Risk:** high (money) — but the guards themselves are safe: they only
forbid. **Rollback:** do not reset the tables; the gateway stays disabled.
