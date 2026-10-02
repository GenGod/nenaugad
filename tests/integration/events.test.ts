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
import { countEventsForUser, deleteEventsForUser, purgeExpiredEvents, recordClicks, recordImpressions } from "../../src/server/events-service.ts";
import { deleteAllProfiles, saveProfileVersion } from "../../src/server/profile-service.ts";
import { storeScore } from "../../src/server/relevance-service.ts";
import { FEED_ORDERS } from "../../src/domain/feed-order.ts";
import { EVENT_RETENTION_MONTHS } from "../../src/domain/events.ts";
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

const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], skills: [], employmentTypes: ["employment_full_time"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};

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

test("A8/B2/B20: impressions carry position, a server-computed propensity and the feed label", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const owner = await registerUser(pool, uniqueEmail(), "long-enough-password");
  // No profile and no scores yet: an unknown probability stays NULL, never 1.0.
  const written = await recordImpressions({
    pool, userId: owner.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  assert.equal(written, 1);
  const row = await pool.query(
    "SELECT event_type, position, propensity, ranker_version FROM job_events WHERE user_id = $1",
    [owner.id],
  );
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0]?.event_type, "impression");
  assert.equal(row.rows[0]?.position, 0);
  assert.equal(row.rows[0]?.propensity, null, "no score to normalise: null, not an invented number");
  assert.equal(row.rows[0]?.ranker_version, FEED_ORDERS.match,
    "the label is the server-owned feed order, not a client string");

  // With cached scores the propensity is computed server-side from the batch's
  // best score (B2): 80 -> 1, 40 -> 0.5. The client never supplies a number (B20).
  await saveProfileVersion(pool, owner.id, PROFILE_INPUT);
  const two = await pool.query("SELECT id FROM job_snapshots ORDER BY id LIMIT 2");
  const ids = (two.rows as { id: string }[]).map(entry => entry.id);
  assert.equal(ids.length, 2, "the fixture import must leave at least two snapshots");
  for (const [index, id] of ids.entries()) {
    await storeScore({
      pool, userId: owner.id, profileVersion: 1, modelId: "test-model",
      score: { snapshotId: id, score: index === 0 ? 80 : 40, matchedSkills: [], missingSkills: [], explanation: "" },
    });
  }
  await recordImpressions({
    pool, userId: owner.id, feed: "match",
    items: ids.map((id, position) => ({ snapshotId: id, position })),
  });
  const scored = await pool.query(
    "SELECT snapshot_id, propensity FROM job_events WHERE user_id = $1 AND event_type = 'impression' AND propensity IS NOT NULL",
    [owner.id],
  );
  const byId = new Map((scored.rows as { snapshot_id: string; propensity: string }[])
    .map(entry => [entry.snapshot_id, Number(entry.propensity)]));
  assert.equal(byId.get(ids[0]!), 1, "the best score normalises to 1");
  assert.equal(byId.get(ids[1]!), 0.5, "half the best score normalises to 0.5");
});

test("A8: ownership — one candidate's events are invisible and unwritable for another", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const alice = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const bob = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await recordClicks({ pool, userId: alice.id, feed: "match", items: [{ snapshotId, position: 3 }] });
  assert.equal(await countEventsForUser(pool, alice.id), 1);
  assert.equal(await countEventsForUser(pool, bob.id), 0);
  // Bob's own write stays his: the service takes the owner from the caller
  // (the API route passes the session user), never from the payload.
  await recordClicks({ pool, userId: bob.id, feed: "match", items: [{ snapshotId, position: 1 }] });
  assert.equal(await countEventsForUser(pool, alice.id), 1);
  assert.equal(await countEventsForUser(pool, bob.id), 1);
});

test("A8: deleting a profile deletes its behavioural trace", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await recordImpressions({ pool, userId: user.id, feed: "review", items: [{ snapshotId, position: 0 }] });
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
      pool, userId: user.id, feed: "match",
      items: [{ snapshotId: "jobicy:does-not-exist", position: 0 }],
    }),
    (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "23503",
  );
  assert.equal(await countEventsForUser(pool, user.id), 0);
});

test("RET-001: the journal keeps twelve months and purges older events", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot(new Date().toISOString());
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await recordImpressions({ pool, userId: user.id, feed: "match", items: [{ snapshotId, position: 0 }] });
  await recordImpressions({ pool, userId: user.id, feed: "match", items: [{ snapshotId, position: 1 }] });
  // Age the first event past the horizon; the second stays fresh. Scoped to this
  // user — the test database is shared, and the purge below is global.
  await pool.query(
    "UPDATE job_events SET created_at = now() - interval '13 months' WHERE user_id = $1 AND position = 0",
    [user.id]);
  const purged = await purgeExpiredEvents(pool, new Date().toISOString());
  assert.equal(purged, 1);
  const left = await pool.query<{ position: number }>(
    "SELECT position FROM job_events WHERE user_id = $1", [user.id]);
  assert.deepEqual(left.rows.map(row => row.position), [1], "inside the horizon stays");
  // The horizon is the decided one — a named constant, not a magic number here.
  assert.equal(EVENT_RETENTION_MONTHS, 12);
});
