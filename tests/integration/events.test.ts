// Integration tests for the interaction journal (design item A8).
//
// The properties that matter are ownership and deletion, not row counts: one
// candidate's events must never be visible or writable through another
// candidate's session, and deleting a profile must delete its behavioural trace.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { countEventsForUser, deleteEventsForUser, recordClicks, recordImpressions } from "../../src/server/events-service.ts";
import { deleteAllProfiles } from "../../src/server/profile-service.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { jobicyContractFixture } from "../../src/server/import/jobicy-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

function uniqueEmail(): string {
  return `ev-${randomBytes(6).toString("hex")}@example.invalid`;
}

async function seedSnapshot(now: string): Promise<string> {
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now,
  });
  const result = await pool.query("SELECT id FROM job_snapshots ORDER BY id LIMIT 1");
  const id = (result.rows[0] as { id: string } | undefined)?.id;
  assert.ok(id, "the import must produce at least one snapshot");
  return id;
}

test("A8: impressions carry position and an honest (nullable) propensity", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const owner = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const written = await recordImpressions({
    pool, userId: owner.id, rankerVersion: "v2-test",
    items: [{ snapshotId, position: 0, propensity: 0.42 }],
  });
  assert.equal(written, 1);
  const row = await pool.query(
    "SELECT event_type, position, propensity, ranker_version FROM job_events WHERE user_id = $1",
    [owner.id],
  );
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0]?.event_type, "impression");
  assert.equal(row.rows[0]?.position, 0);
  assert.equal(Number(row.rows[0]?.propensity), 0.42);
  assert.equal(row.rows[0]?.ranker_version, "v2-test");
  // A null propensity is stored as null: unknown stays unknown in the journal.
  await recordImpressions({
    pool, userId: owner.id, rankerVersion: null,
    items: [{ snapshotId, position: 1, propensity: null }],
  });
  const rows = await pool.query(
    "SELECT propensity FROM job_events WHERE user_id = $1 AND position = 1",
    [owner.id],
  );
  assert.equal(rows.rows[0]?.propensity, null);
});

test("A8: ownership — one candidate's events are invisible and unwritable for another", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const alice = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const bob = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await recordClicks({ pool, userId: alice.id, rankerVersion: null, items: [{ snapshotId, position: 3, propensity: null }] });
  assert.equal(await countEventsForUser(pool, alice.id), 1);
  assert.equal(await countEventsForUser(pool, bob.id), 0);
  // Bob's own write stays his: the service takes the owner from the caller
  // (the API route passes the session user), never from the payload.
  await recordClicks({ pool, userId: bob.id, rankerVersion: null, items: [{ snapshotId, position: 1, propensity: null }] });
  assert.equal(await countEventsForUser(pool, alice.id), 1);
  assert.equal(await countEventsForUser(pool, bob.id), 1);
});

test("A8: deleting a profile deletes its behavioural trace", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await recordImpressions({ pool, userId: user.id, rankerVersion: null, items: [{ snapshotId, position: 0, propensity: null }] });
  assert.equal(await countEventsForUser(pool, user.id), 1);
  await deleteAllProfiles(pool, user.id);
  assert.equal(await countEventsForUser(pool, user.id), 0, "profile deletion must leave no events behind");
  // The dedicated helper stays available for the account-deletion path.
  assert.equal(await deleteEventsForUser(pool, user.id), 0);
});

test("A8: an event for a snapshot that does not exist is rejected, not silently stored", async () => {
  await migrate(pool);
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await assert.rejects(
    () => recordImpressions({
      pool, userId: user.id, rankerVersion: null,
      items: [{ snapshotId: "jobicy:does-not-exist", position: 0, propensity: null }],
    }),
    (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "23503",
  );
  assert.equal(await countEventsForUser(pool, user.id), 0);
});
