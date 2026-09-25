import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
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
