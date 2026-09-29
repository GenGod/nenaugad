// Integration tests for the digest (design item A7).
//
// The digest is the push part of the brief in its honest MVP form: in-app, no
// email, computed at the moment it is read. What matters here: its window comes
// from facts we recorded (first sighting, last feed view), a posting closed
// before delivery never appears, one candidate's window is not another's, and
// deleting the profile leaves no window behind.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { saveProfileVersion, deleteAllProfiles } from "../../src/server/profile-service.ts";
import { recordImpressions, lastImpressionAt, countEventsForUser } from "../../src/server/events-service.ts";
import { digestForUser } from "../../src/server/digest-service.ts";
import { matchedForUser } from "../../src/server/matching-service.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { runClosureCheckPass } from "../../src/server/import/closure-checks.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { jobicyContractFixture, type JobicyRawRecord } from "../../src/server/import/jobicy-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

// The profile has to match the jobicy fixtures for the digest to have anything
// to show: they are full-time and worldwide, so the candidate asks for exactly
// that, with everything else left unstated (unknown, not fail).
const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], skills: [], employmentTypes: ["employment_full_time"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};
const T0 = "2026-09-25T08:00:00.000Z";
const HOUR_MS = 60 * 60 * 1000;
const at = (hoursAfterT0: number) => new Date(Date.parse(T0) + hoursAfterT0 * HOUR_MS).toISOString();

function uniqueEmail(): string {
  return `digest-${randomBytes(6).toString("hex")}@example.invalid`;
}

/**
 * The digest asserts exact counts, so it needs a clean catalog: the test database
 * is shared by several suites, and a leftover himalayas fixture from another file
 * would legitimately appear in a candidate's digest.
 */
async function resetCatalog(): Promise<void> {
  await migrate(pool);
  await pool.query("DELETE FROM closure_checks");
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
}

async function importRecords(raws: readonly JobicyRawRecord[], now: string): Promise<void> {
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...raws] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now,
  });
}

async function seededUser(): Promise<string> {
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  return user.id;
}

function digestFor(userId: string, now?: string) {
  return digestForUser(userId, now === undefined ? { pool } : { pool, now });
}

function idsOf(digest: Awaited<ReturnType<typeof digestForUser>>): string[] {
  return digest.items.map(item => item.snapshotId);
}

test("A7: the window comes from the journal, and the seen-set keeps the digest honest", async () => {
  await resetCatalog();
  await importRecords(jobicyContractFixture, T0);
  const userId = await seededUser();

  // The candidate has never opened the feed: everything the gates allow is new,
  // and the digest says the window is unknown instead of inventing "since
  // yesterday". The expected set comes from the same gate pipeline, not from a
  // hardcoded list.
  const matched = await matchedForUser(userId, { pool });
  const visible = [...matched.eligible, ...matched.needsReview].map(job => job.card.id).sort();
  assert.ok(visible.length >= 1, "the fixture import must leave a visible posting");
  const firstLook = await digestFor(userId);
  assert.equal(firstLook.status, "ok");
  assert.equal(firstLook.cursor.lastFeedViewAt, null);
  assert.equal(firstLook.newCount, visible.length);
  assert.deepEqual([...idsOf(firstLook)].sort(), visible);
  assert.ok(firstLook.items.every(item => item.freshness === "new"));

  // A feed render records impressions (A8): that moment becomes the cursor.
  const shownId = visible[0]!;
  await recordImpressions({
    pool, userId, rankerVersion: null,
    items: [{ snapshotId: shownId, position: 0, propensity: null }],
  });
  const afterView = await digestFor(userId);
  assert.ok(afterView.cursor.lastFeedViewAt !== null, "the cursor must come from the journal");
  // The posting the candidate was shown is not offered again (seen-set, A6):
  // it is neither "new" nor "still relevant" — it is simply not re-shown.
  assert.ok(!idsOf(afterView).includes(shownId));
  assert.equal(afterView.newCount, 0);
  assert.ok(afterView.items.every(item => item.freshness === "earlier"));
  assert.equal(afterView.seenSuppressed.eligible + afterView.seenSuppressed.needsReview, 1);

  // A posting that arrives AFTER the view is new — and it is the one the digest
  // leads with. The poll interval is cleared: this is the next scheduled poll,
  // not a second fetch inside the same window.
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
  const late = { ...jobicyContractFixture[0]!, id: 900004, url: "https://jobicy.com/jobs/900004-late-synthetic-fixture",
    jobTitle: "Late synthetic fixture posting" };
  await importRecords([...jobicyContractFixture, late], new Date().toISOString());
  const withLate = await digestFor(userId);
  assert.equal(withLate.newCount, 1);
  assert.equal(withLate.items[0]?.snapshotId, "jobicy:900004");
  assert.equal(withLate.items[0]?.freshness, "new");
});

test("A7 (golden 7): a posting closed before the digest is read never appears in it", async () => {
  await resetCatalog();
  await importRecords(jobicyContractFixture, T0);
  const userId = await seededUser();
  const head = async () => ({ result: "inactive" as const });
  // Two spaced inactive checks close the records (the real closure mechanism,
  // not a hand-edited lifecycle): the digest is computed later, live.
  const first = await runClosureCheckPass({ pool, now: at(7), head });
  const second = await runClosureCheckPass({ pool, now: at(14), head });
  assert.equal(first.closed, 0);
  assert.equal(second.closed, 3);

  const digest = await digestFor(userId);
  assert.equal(digest.status, "ok");
  assert.equal(digest.newCount, 0);
  assert.equal(digest.items.length, 0, "a closed posting is never delivered, however new it is");
});

test("A7: the window is per candidate, and deleting the profile removes it", async () => {
  await resetCatalog();
  await importRecords(jobicyContractFixture, T0);
  const alice = await seededUser();
  const bob = await seededUser();
  await recordImpressions({
    pool, userId: alice, rankerVersion: null,
    items: [{ snapshotId: "jobicy:900001", position: 0, propensity: null }],
  });
  const forAlice = await digestFor(alice);
  const forBob = await digestFor(bob);
  const matchedForBob = await matchedForUser(bob, { pool });
  const visible = matchedForBob.eligible.length + matchedForBob.needsReview.length;
  assert.ok(visible >= 1);
  assert.ok(forAlice.cursor.lastFeedViewAt !== null);
  assert.equal(forBob.cursor.lastFeedViewAt, null, "Bob's window is his own");
  assert.equal(forBob.newCount, visible, "Alice's impression does not shrink Bob's digest");

  // Deleting the profile deletes the journal, so the window disappears with it.
  await deleteAllProfiles(pool, alice);
  assert.equal(await countEventsForUser(pool, alice), 0);
  assert.equal(await lastImpressionAt(pool, alice), null);
});
