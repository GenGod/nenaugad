# B69-001 — the worker stops on time and survives a database restart

**Status: implemented and tested locally, 2026-11-06; committed at the owner's word ("commit and merge") and merged into `main`; not pushed, not accepted.** Started from [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md)
B69, found while running the worker in Docker for DEVX-005 (2026-11-06) and kept out of that
task on purpose: these are application changes, DEVX-005 changes only Docker files.

## Problem

1. **A tick with the batch path closed still scans every profile.** The worker calls
   `checkForStaleAnalyses` (`src/server/ai/batch-queue-service.ts`) on every tick unless it
   runs with `--no-batch`. The function lists every user with a `candidate_profiles` row and
   runs `matchedForUser` for each, although `isBatchEnabled()` is `false` by construction
   (A3) and `submitRelevanceBatch` then returns `null` for every user it is given. With 365
   local profiles at about 2 s each a tick takes about 13 minutes, so a SIGTERM is not
   answered within compose's 5-minute stop grace period and the worker is killed. DEVX-005
   runs the worker with `--no-batch` to avoid it.
2. **A connection the server ends while idle crashes the worker.** The pool `localPool`
   (`scripts/db.ts`) returns has no `error` listener. When PostgreSQL ends an idle connection
   (`docker compose restart db`: `terminating connection due to administrator command`,
   SQLSTATE 57P01), pg-pool re-emits the error from `Client.idleListener` on the pool; with no
   listener Node throws it and the process exits with a stack. The app's two pools
   (`storage/postgres.ts`, `snapshotPool`) already have a listener; this one does not.

## Acceptance (fixed before the code)

1. While the batch path is closed, `checkForStaleAnalyses` returns an empty list before it
   queries anything: no user list, no profile read, no `matchedForUser` call. Test: a pool
   stand-in that rejects every query gets `[]` and records no query (without the fix the
   first query is the user list, so the test fails there, before any `matchedForUser`).
2. The worker's batch step stops at the next user when a shutdown was asked for, as the
   source loop already does. No test: the worker loop has no harness, and the step has no
   users while the path is closed.
3. `localPool` attaches an `error` listener. An idle connection the server ends is logged as
   one JSON line `{ ts, event: "db_pool_error", code }` on stderr and does not throw; the next
   query on the same pool opens a new connection and succeeds. Test on the isolated test
   database: `pg_terminate_backend` on the pool's idle connection (the same 57P01 a restart
   sends), then a query on that pool.
4. The line carries the error code only. A code that is not a short upper-case token (an
   SQLSTATE or a Node errno), or no code, is logged as `DATABASE_POOL_ERROR`; the message,
   the connection string, the user and the host are never logged. Unit test with a fake
   emitter.
5. Unchanged: `submitRelevanceBatch` and `processPendingBatches` with the path closed;
   every existing test passes.

**Risk: normal** (worker robustness; no money, auth, deletion, upload or source rights).
**Data:** the isolated test database and a labelled stand-in pool; nothing reaches a provider.

**Not included:**
- A restart while a query is in flight, or a tick that starts while the database is still
  down: that query rejects and `main` ends with `worker_failed` (exit 1, a code, no stack);
  compose's `restart: unless-stopped` starts it again. Catching a failed tick and going on
  is a decision of its own: it would also keep a worker alive through a persistent error.
- The per-user loop inside `checkForStaleAnalyses` gets no stop check: it cannot run while
  the path is closed, and A3's re-enable must bound it.
- The other steps of a tick (retention, closure, extraction) are not measured here.
- Docker files. Once this lands, DEVX-005's worker service no longer needs `--no-batch` in
  `compose.yaml`; that edit belongs to DEVX-005's branch.

## Plan

1. Failing tests for acceptance 1, 3 and 4.
2. `checkForStaleAnalyses` returns `[]` while `isBatchEnabled()` is false.
3. A small `src/server/storage/pool-errors.ts` (no `pg` import, so the unit tests stay
   offline) logs the code; `localPool` attaches it.
4. The worker's batch step breaks on `shuttingDown`.
5. `npm run check:agent` while iterating; `npm run check`, `npm run test:db` and
   `npm run test:coverage` at the end.

**Rollback:** revert the change; nothing is migrated or written outside tests.

## Result (2026-11-06)

- `checkForStaleAnalyses` returns `[]` before any query while `isBatchEnabled()` is false.
- The worker's batch submit loop breaks on `shuttingDown` (acceptance 2, no test).
- New `src/server/storage/pool-errors.ts` `logPoolErrors(pool, write?)`: one line
  `{ ts, event: "db_pool_error", code }` on stderr; a code is logged only if it matches
  `^[A-Z0-9_]{1,32}$`, anything else is `DATABASE_POOL_ERROR`. `localPool` attaches it, so it
  covers the worker and every script that uses `localPool`.
- Tests: `tests/unit/pool-errors.test.ts` (2, fake emitter); `tests/integration/worker.test.ts`
  (+2: a refusing pool stand-in gets `[]` with no query; `pg_terminate_backend` on the pool's
  idle connection is logged as `57P01` and the next query runs on a new connection).

**Red before green.** Before the change, the stale-scan test failed with `UNEXPECTED_QUERY`
(the user list) and the pool test with an uncaught `terminating connection due to
administrator command`; the unit test failed on the missing module. One mutation: logging any
string code unchecked fails the unit test's token case. The first draft of the unit test named
its connection string `SECRET_URL`, which the committed-secret scan in
`tests/unit/production-mode.test.ts` caught; renamed `CONNECTION_STRING`.

## Checks (final code)

| Command | Result |
|---|---|
| `npm run check:agent` | exit 0 |
| `npm run check` | exit 0 (unit 469/469, lint, typecheck) |
| `npm run test:db` equivalent | exit 0, 157/157 |
| `npm run test:coverage` equivalent | exit 0, 626/626; 87.86 / 89.32 / 94.94 (ratchet 87/89/94, no whole step up, unchanged) |

This worktree has no `.env` and had no `node_modules`: `npm ci --prefer-offline` from the
unchanged lockfile (two install scripts blocked by npm's allowScripts: onnxruntime-node's
Linux CUDA download and protobufjs's version check). The DB suites ran as `node
--env-file-if-exists=<the main checkout's .env> --test --test-concurrency=1 …` with
`PG_TOOLS_CONTAINER=nenaugad-db-1`, as DEPLOY-003 did; a first run without that variable failed
the 12 backup-restore tests with `PG_TOOL_NOT_FOUND` (no pg_dump on PATH), nothing else.

**Not run:** `npm run build` and `npm run test:e2e` (the change touches no page or route);
the worker itself in Docker with `docker compose restart db` (the owner's DEVX-005 stack was
running; it was left alone). **Mock/live:** a labelled stand-in pool and a fake emitter; the
pool test uses the real isolated test database; no provider call. **Spend:** none visible;
coding-host spend unknown.

## Limitations

- A restart in mid-query, or a tick that starts while the database is down, still ends the
  worker with `worker_failed` (not included above).
- The worker's shutdown check in the batch loop is untested.
- The scan's per-user loop is unbounded once A3 re-enables the path.

**Next small task:** drop `--no-batch` from the worker service in DEVX-005's `compose.yaml`
once this is merged; then, if the owner wants it, a tick-level catch so a failed tick is logged
and the worker waits for the next one.
