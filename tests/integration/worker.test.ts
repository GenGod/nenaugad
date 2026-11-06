import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { localPool, migrate } from "../../scripts/db.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { checkForStaleAnalyses } from "../../src/server/ai/batch-queue-service.ts";
import { isBatchEnabled } from "../../src/server/ai/openai-batch.ts";
import { himalayasCandidatePolicy, jobicyCandidatePolicy } from "../../src/server/source-policies.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

const enabledHimalayas = { ...himalayasCandidatePolicy, enabled: true };
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };

test("worker attempt bookkeeping persists across restarts (0005 columns)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM import_state WHERE source_id = 'himalayas'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
  const himalayas = createPostgresPersistence(pool, enabledHimalayas);
  const jobicy = createPostgresPersistence(pool, enabledJobicy);

  // Fresh source: no state yet.
  assert.equal(await himalayas.loadImportState(), null);

  // A failure records the attempt without touching the poll window.
  await himalayas.recordAttempt(false, "2026-09-25T12:00:00.000Z");
  await himalayas.recordAttempt(false, "2026-09-25T12:20:00.000Z");
  let state = await himalayas.loadImportState();
  assert.equal(state?.consecutiveFailures, 2);
  assert.equal(state?.lastAttemptAt, "2026-09-25T12:20:00.000Z");
  assert.equal(state?.lastRunAt, null);
  assert.equal(state?.runCount, 0);

  // A "restart" is just a new persistence instance: backoff state survives.
  const restarted = createPostgresPersistence(pool, enabledHimalayas);
  state = await restarted.loadImportState();
  assert.equal(state?.consecutiveFailures, 2);

  // Success resets the streak; an explicit resume clears it too.
  await restarted.recordAttempt(true, "2026-09-25T13:00:00.000Z");
  assert.equal((await restarted.loadImportState())?.consecutiveFailures, 0);
  await restarted.recordAttempt(false, "2026-09-25T14:00:00.000Z");
  await restarted.recordAttempt(false, "2026-09-25T14:20:00.000Z");
  await restarted.resumeAttempts();
  assert.equal((await restarted.loadImportState())?.consecutiveFailures, 0);

  // Sources are isolated: jobicy counters are untouched by himalayas attempts.
  await jobicy.recordAttempt(false, "2026-09-25T12:00:00.000Z");
  assert.equal((await jobicy.loadImportState())?.consecutiveFailures, 1);
  assert.equal((await restarted.loadImportState())?.consecutiveFailures, 0);
});

test("with the batch path closed, a tick's stale-analysis scan queries nothing (B69)", async () => {
  assert.equal(isBatchEnabled(), false);
  // Labelled stand-in: a pool that records and refuses every query. The scan used to list
  // every profile and run matchedForUser for each (about 13 minutes over 365 profiles);
  // without the early return its first query, the user list, is refused here, so the test
  // fails before any matchedForUser call could read through its own pool.
  const queries: unknown[] = [];
  const refusing = {
    query: async (...args: unknown[]) => { queries.push(args); throw new Error("UNEXPECTED_QUERY"); },
  } as unknown as Pool;
  assert.deepEqual(await checkForStaleAnalyses(refusing), []);
  assert.equal(queries.length, 0);
});

test("an idle connection the server ends is logged by code and the pool reconnects (B69)", async t => {
  await migrate(pool);
  const errors: string[] = [];
  t.mock.method(console, "error", (line: unknown) => { errors.push(String(line)); });
  // Its own pool, so the connection it leaves idle is the one the server ends.
  const victim = localPool(process.env.TEST_DATABASE_URL, true);
  try {
    const before = await victim.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const pid = before.rows[0]?.pid;
    assert.equal(typeof pid, "number");
    assert.equal(victim.idleCount, 1);
    // pg_terminate_backend ends the backend the way a fast shutdown does (`docker compose
    // restart db`): FATAL 57P01, "terminating connection due to administrator command".
    // Without a pool listener pg-pool re-emits it unheard and Node throws it.
    const ended = await pool.query<{ ok: boolean }>("SELECT pg_terminate_backend($1::int) AS ok", [pid]);
    assert.equal(ended.rows[0]?.ok, true);
    const deadline = Date.now() + 5000;
    while (errors.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(errors.length >= 1, "the ended connection was reported on the pool");
    const logged = errors.map(line => JSON.parse(line) as Record<string, unknown>);
    for (const line of logged) {
      assert.deepEqual(Object.keys(line).sort(), ["code", "event", "ts"]);
      assert.equal(line.event, "db_pool_error");
    }
    assert.equal(logged[0]?.code, "57P01");
    // pg-pool dropped the ended client: the next query opens a new connection.
    const after = await victim.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    assert.equal(typeof after.rows[0]?.pid, "number");
    assert.notEqual(after.rows[0]?.pid, pid);
  } finally {
    await victim.end();
  }
});
