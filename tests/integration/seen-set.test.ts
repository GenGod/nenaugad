// Integration tests for the seen-set rule (design item A6, seen-set part).
//
// What matters here is not the rule itself (tests/unit/seen-set.test.ts) but its
// inputs: the fingerprint recorded with an impression comes from the catalog,
// not from the client; the state is per user; a changed posting comes back; and
// the state disappears with the profile.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { recordClicks, recordImpressions } from "../../src/server/events-service.ts";
import { actedSnapshotIds, seenStatesForUser, suppressedSnapshotIds } from "../../src/server/seen-service.ts";
import { deleteAllProfiles, saveJobForUser } from "../../src/server/profile-service.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { jobicyContractFixture, type JobicyRawRecord } from "../../src/server/import/jobicy-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const DAY_MS = 86_400_000;

function uniqueEmail(): string {
  return `seen-${randomBytes(6).toString("hex")}@example.invalid`;
}

async function importFixture(now: string, jobs: readonly JobicyRawRecord[] = jobicyContractFixture): Promise<string> {
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobs] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now,
  });
  const head = jobs[0];
  assert.ok(head, "the fixture must have at least one record");
  // The adapter keys snapshots by source record id (`jobicy:<id>`); the test
  // resolves its own posting deterministically instead of reading "the first
  // row", which other suites also write.
  return `jobicy:${head.id}`;
}

/**
 * The test database is shared by several suites, so this one starts from a known
 * jobicy state: no leftovers from another file's import, no stale import cursor.
 * Deleting snapshots cascades to the events that reference them.
 */
async function resetJobicy(): Promise<void> {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'jobicy'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
}

async function contentHash(snapshotId: string): Promise<string | null> {
  const result = await pool.query("SELECT content_hash FROM job_snapshots WHERE id = $1", [snapshotId]);
  const value = (result.rows[0] as { content_hash: string | null } | undefined)?.content_hash;
  return value === undefined ? null : value;
}

function decisionParams(snapshotId: string, contentHashValue: string | null, userId: string, now: string) {
  return { pool, userId, now, candidates: [{ snapshotId, contentHash: contentHashValue }] };
}

test("A6: an impression records the fingerprint the server read, not one the client sent", async () => {
  await resetJobicy();
  const snapshotId = await importFixture(new Date().toISOString());
  const owner = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const stored = await contentHash(snapshotId);
  assert.ok(stored, "the catalog must have a fingerprint for the imported snapshot");
  await recordImpressions({
    pool, userId: owner.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  const row = await pool.query("SELECT shown_content_hash FROM job_events WHERE user_id = $1", [owner.id]);
  assert.equal(row.rows[0]?.shown_content_hash, stored);
  const states = await seenStatesForUser(pool, owner.id);
  assert.equal(states.get(snapshotId)?.shownContentHash, stored);
});

test("A6 (golden 9): the seen state of one candidate changes nothing for another", async () => {
  await resetJobicy();
  const now = new Date().toISOString();
  const snapshotId = await importFixture(now);
  const alice = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const bob = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const stored = await contentHash(snapshotId);
  await recordImpressions({
    pool, userId: alice.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  const forAlice = await suppressedSnapshotIds(decisionParams(snapshotId, stored, alice.id, now));
  const forBob = await suppressedSnapshotIds(decisionParams(snapshotId, stored, bob.id, now));
  assert.deepEqual([...forAlice], [snapshotId]);
  assert.equal(forBob.size, 0, "Bob has no history: his feed is not affected by Alice's");
});

test("A6: an unchanged posting returns when the window expires, not before", async () => {
  await resetJobicy();
  const now = new Date().toISOString();
  const snapshotId = await importFixture(now);
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const stored = await contentHash(snapshotId);
  await recordImpressions({
    pool, userId: user.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  const suppressedNow = await suppressedSnapshotIds(decisionParams(snapshotId, stored, user.id, now));
  assert.deepEqual([...suppressedNow], [snapshotId]);
  // 13 days ago: still inside the window, still out of the feed.
  await pool.query("UPDATE job_events SET created_at = $2::timestamptz WHERE user_id = $1",
    [user.id, new Date(Date.parse(now) - 13 * DAY_MS).toISOString()]);
  const inside = await suppressedSnapshotIds(decisionParams(snapshotId, stored, user.id, now));
  assert.equal(inside.size, 1);
  // 15 days ago: the window is over and the posting is a result again.
  await pool.query("UPDATE job_events SET created_at = $2::timestamptz WHERE user_id = $1",
    [user.id, new Date(Date.parse(now) - 15 * DAY_MS).toISOString()]);
  const outside = await suppressedSnapshotIds(decisionParams(snapshotId, stored, user.id, now));
  assert.equal(outside.size, 0);
});

test("A6: a posting whose content changed comes back immediately", async () => {
  await resetJobicy();
  const now = new Date().toISOString();
  const firstSeen = new Date(Date.parse(now) - 60 * 60 * 1000).toISOString();
  const snapshotId = await importFixture(firstSeen);
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const before = await contentHash(snapshotId);
  await recordImpressions({
    pool, userId: user.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  assert.equal((await suppressedSnapshotIds(decisionParams(snapshotId, before, user.id, now))).size, 1);
  // The source renames the posting: the import pipeline stores a new fingerprint
  // and a new version. We compare fingerprints as stored — not "looks similar".
  // The poll interval is cleared first: this simulates the next scheduled poll,
  // not a second fetch inside the same window (which the adapter rightly skips).
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
  const [head, ...rest] = jobicyContractFixture;
  assert.ok(head, "the fixture must have a first record");
  await importFixture(new Date(Date.parse(now) + 60 * 60 * 1000).toISOString(),
    [{ ...head, jobTitle: "Platform Engineer (renamed by the source)" }, ...rest]);
  const after = await contentHash(snapshotId);
  assert.notEqual(after, before, "a semantic change must produce a new fingerprint");
  assert.equal((await suppressedSnapshotIds(decisionParams(snapshotId, after, user.id, now))).size, 0,
    "a changed posting is not 'already seen'");
});

test("A6: a click or a save lifts the rule", async () => {
  await resetJobicy();
  const now = new Date().toISOString();
  const snapshotId = await importFixture(now);
  const clicker = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const saver = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const stored = await contentHash(snapshotId);
  await recordImpressions({
    pool, userId: clicker.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  await recordClicks({
    pool, userId: clicker.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  assert.deepEqual([...(await actedSnapshotIds(pool, clicker.id))], [snapshotId]);
  assert.equal((await suppressedSnapshotIds(decisionParams(snapshotId, stored, clicker.id, now))).size, 0,
    "a posting the candidate clicked is not hidden as 'already seen'");
  await recordImpressions({
    pool, userId: saver.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  await saveJobForUser(pool, saver.id, snapshotId);
  assert.equal((await suppressedSnapshotIds(decisionParams(snapshotId, stored, saver.id, now))).size, 0,
    "a saved posting stays in the feed");
});

test("A6: deleting the profile deletes the seen state with it", async () => {
  await resetJobicy();
  const now = new Date().toISOString();
  const snapshotId = await importFixture(now);
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const stored = await contentHash(snapshotId);
  await recordImpressions({
    pool, userId: user.id, feed: "match",
    items: [{ snapshotId, position: 0 }],
  });
  assert.equal((await seenStatesForUser(pool, user.id)).size, 1);
  await deleteAllProfiles(pool, user.id);
  assert.equal((await seenStatesForUser(pool, user.id)).size, 0);
  assert.equal((await suppressedSnapshotIds(decisionParams(snapshotId, stored, user.id, now))).size, 0);
});
