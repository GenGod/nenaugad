# S1-004 — import regularization: a worker with a schedule and backoff

**Result:** one long-lived local worker (`npm run worker`) itself launches the
imports of the approved sources on their poll intervals, survives failures
with exponential backoff and jitter, pauses a source after a series of
failures and shows the state; idempotency — in the DB, as in spec 7.

**Not included:** a queue/Redis (one ready-made mechanism is not needed — the
worker cycle is the schedule), Retry-After parsing (the base backoff of
15 min covers the documented ~60 s — we never violate the header),
notifications beyond logs, a separate service process (a run in a terminal/OS
scheduler — an owner decision).

**Context:** spec 7 (at-least-once + idempotency in the DB), 17 (concurrency 1,
backoff with jitter, max attempts, a pause instead of an infinite retry, a
circuit breaker per source, visibility of last success/next run/errors);
SP 3 (one mechanism for background tasks, without a universal orchestrator).

## Acceptance
1. Migration 0005: `import_state` += `last_attempt_at`, `consecutive_failures`;
   attempts are persisted (a worker restart does not reset the backoff).
2. Scheduler (pure): next-due = max(last_run+interval, last_attempt+
   backoff(n)); backoff 15 min × 2^(n−1), cap 6 h, jitter ±20%; a source is
   paused after 5 consecutive failures — until `--resume <source>`.
3. Worker: sequential attempts (concurrency 1), JSON logs without secrets,
   `--once`, `--status`, `--resume`, graceful shutdown (SIGINT/SIGTERM).
4. One degraded source does not stop a second one (per-source state).
5. Repeated runs are idempotent (the existing gates and versioning);
   a failed attempt does not consume the poll window (last_run_at is not
   touched).
6. Tests: unit — schedule/backoff/pause; integration — a worker run with fake
   transports, the persistence of failures, resume; e2e unchanged.
7. Enabling the worker for permanent operation (an OS scheduler/terminal) —
   an owner decision; by default the worker does nothing with sources
   disabled.

**Risk:** ordinary. **Rollback:** stop the worker; do not roll back the
migration blindly.
**Data:** only public feeds; the spend is zero (free APIs).
