import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { runHimalayasImport } from "../../src/server/import/himalayas-adapter.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import { himalayasContractFixture } from "../../src/server/import/himalayas-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledPolicy = { ...himalayasCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const fullPage = async () => ({
  status: "ok" as const, jobs: [...himalayasContractFixture], nextCursor: null,
});

test("live snapshot import persists, is idempotent and checkpoints the cursor", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const persistence = createPostgresPersistence(pool, enabledPolicy);

  const first = await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  assert.equal(first.result, "applied");
  assert.equal(first.recordsMapped, 3);
  const rows = await pool.query<{ excerpt: string }>(
    "SELECT excerpt FROM job_snapshots ORDER BY id");
  assert.equal(rows.rowCount, 3);
  assert.ok(rows.rows.every(row => typeof row.excerpt === "string"));

  const second = await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-25T12:00:00.000Z",
  });
  assert.deepEqual(second.changes.map(change => change.change), ["seen", "seen", "seen"]);
  const state = await persistence.loadImportState();
  assert.equal(state?.lastRunAt, "2026-09-25T12:00:00.000Z");
  assert.equal(state?.nextCursor, null);
  assert.equal(state?.runCount, 2);

  // A budget-limited walk keeps the cursor checkpoint and adds no misses.
  const partial = await runHimalayasImport({
    transport: async () => ({ status: "ok" as const, jobs: [], nextCursor: "check-point" }),
    persistence, policy: enabledPolicy, now: "2026-09-26T12:00:00.000Z", maxPages: 1,
  });
  assert.equal(partial.result, "partial");
  assert.equal((await persistence.loadImportState())?.nextCursor, "check-point");
  const misses = await pool.query("SELECT full_pass_misses FROM job_snapshots");
  assert.ok(misses.rows.every(row => Number(row.full_pass_misses) === 0));
});

test("snapshot tables reject foreign sources and non-snapshot payloads", async () => {
  await migrate(pool);
  await assert.rejects(pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'other', 'x', now(), $2::jsonb)",
    ["foreign-1", JSON.stringify({ kind: "job_snapshot" })],
  ));
  await assert.rejects(pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'himalayas', 'x', now(), $2::jsonb)",
    ["bad-payload", JSON.stringify({ kind: "something_else" })],
  ));
});

test("retention deletes snapshots whose last_seen passed the policy window", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  await pool.query(
    "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
    [JSON.stringify("2020-01-01T00:00:00.000Z"), "himalayas:jobs-fixture-h-001"],
  );
  const deleted = await persistence.deleteExpired("2026-09-24T12:00:00.000Z");
  assert.equal(deleted, 1);
  const remaining = await pool.query("SELECT id FROM job_snapshots");
  assert.equal(remaining.rowCount, 2);
});
