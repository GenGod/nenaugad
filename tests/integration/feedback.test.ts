import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import {
  hideJobForUser, unhideJobForUser, listHiddenJobs, hiddenSnapshotIds,
  setAppliedMark, listSavedJobsWithApplied, FeedbackError,
} from "../../src/server/feedback-service.ts";
import { listSavedJobs, saveJobForUser } from "../../src/server/profile-service.ts";
import { createPostgresPersistence, tombstoneExpiredSnapshots } from "../../src/server/storage/snapshots.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { jobicyContractFixture } from "../../src/server/import/jobicy-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

function uniqueEmail(): string {
  return `fb-${randomBytes(6).toString("hex")}@example.invalid`;
}

async function seedSnapshot(now: string): Promise<string> {
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now,
  });
  return `jobicy:${jobicyContractFixture[0]!.id}`;
}

test("hide with reason is ownership-scoped and matching-visible via ids", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM hidden_jobs");
  const snapshotId = await seedSnapshot("2026-09-25T08:00:00.000Z");
  const userA = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const userB = await registerUser(pool, uniqueEmail(), "long-enough-password");

  await hideJobForUser({ pool, userId: userA.id, snapshotId, reasonCode: "wrong_stack" });
  assert.equal((await hiddenSnapshotIds(pool, userA.id)).has(snapshotId), true);
  assert.equal((await hiddenSnapshotIds(pool, userB.id)).size, 0); // B unaffected

  const listed = await listHiddenJobs(pool, userA.id, "2026-09-25T09:00:00.000Z");
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.reasonCode, "wrong_stack");
  assert.equal(listed[0]?.excerpt.length > 0, true);

  // B cannot unhide A's record; A can.
  assert.equal(await unhideJobForUser(pool, userB.id, snapshotId), false);
  assert.equal(await unhideJobForUser(pool, userA.id, snapshotId), true);
  assert.equal((await hiddenSnapshotIds(pool, userA.id)).size, 0);

  // Unknown snapshots and invalid reasons fail closed.
  await assert.rejects(hideJobForUser({
    pool, userId: userA.id, snapshotId: "jobicy:does-not-exist", reasonCode: "other",
  }), FeedbackError);
  await assert.rejects(pool.query(
    "INSERT INTO hidden_jobs (user_id, snapshot_id, reason_code) VALUES ($1, $2, $3)",
    [userA.id, snapshotId, "not-a-code"],
  ));
});

test("manual apply mark lives on saved rows and only for the owner", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot("2026-09-25T09:00:00.000Z");
  const userA = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const userB = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await saveJobForUser(pool, userA.id, snapshotId);

  // Marking a job that B never saved changes nothing for B.
  assert.equal(await setAppliedMark({
    pool, userId: userB.id, snapshotId, applied: true, now: "2026-09-25T10:00:00.000Z",
  }), false);

  const marked = await setAppliedMark({
    pool, userId: userA.id, snapshotId, applied: true, now: "2026-09-25T10:00:00.000Z",
  });
  assert.equal(marked, true);
  let rows = await listSavedJobsWithApplied(pool, userA.id, "2026-09-25T12:00:00.000Z");
  assert.equal(rows[0]?.markedAppliedAt, "2026-09-25T10:00:00.000Z");

  const cleared = await setAppliedMark({
    pool, userId: userA.id, snapshotId, applied: false, now: "2026-09-25T11:00:00.000Z",
  });
  assert.equal(cleared, true);
  rows = await listSavedJobsWithApplied(pool, userA.id, "2026-09-25T12:00:00.000Z");
  assert.equal(rows[0]?.markedAppliedAt, null);
});

test("a saved or hidden posting whose source stopped publishing keeps no excerpt (B62)", async () => {
  await migrate(pool);
  const snapshotId = await seedSnapshot("2026-09-25T08:00:00.000Z");
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await saveJobForUser(pool, user.id, snapshotId);
  await hideJobForUser({ pool, userId: user.id, snapshotId, reasonCode: "wrong_stack" });
  await setAppliedMark({ pool, userId: user.id, snapshotId, applied: true, now: "2026-09-25T10:00:00.000Z" });
  const publishing = "2026-09-25T12:00:00.000Z";
  const lapsed = jobicyCandidatePolicy.valid_until;
  assert.ok(lapsed, "the jobicy policy carries a review date");

  // While the source publishes, nothing changes.
  const [saved] = await listSavedJobsWithApplied(pool, user.id, publishing);
  assert.equal(saved?.publishes, true);
  assert.ok(saved && saved.excerpt.length > 0);
  const [hidden] = await listHiddenJobs(pool, user.id, publishing);
  assert.equal(hidden?.publishes, true);
  assert.ok(hidden && hidden.excerpt.length > 0);
  assert.ok(((await listSavedJobs(pool, user.id, publishing))[0]?.excerpt.length ?? 0) > 0);

  // From its review date on, the excerpt leaves every list; the user's own marks stay.
  const [savedLapsed] = await listSavedJobsWithApplied(pool, user.id, lapsed);
  assert.equal(savedLapsed?.publishes, false);
  assert.equal(savedLapsed?.excerpt, "");
  assert.equal(savedLapsed?.markedAppliedAt, "2026-09-25T10:00:00.000Z");
  const [hiddenLapsed] = await listHiddenJobs(pool, user.id, lapsed);
  assert.equal(hiddenLapsed?.publishes, false);
  assert.equal(hiddenLapsed?.excerpt, "");
  assert.equal(hiddenLapsed?.reasonCode, "wrong_stack");
  assert.equal((await listSavedJobs(pool, user.id, lapsed))[0]?.excerpt, "");

  // The hidden list hands every caller only what may be shown, never the stored snapshot:
  // it holds the full description, which no source lets us republish.
  const stored = await pool.query<{ description: string }>(
    "SELECT snapshot->>'description_text' AS description FROM job_snapshots WHERE id = $1", [snapshotId]);
  const description = stored.rows[0]?.description ?? "";
  assert.ok(description.length > 0, "the fixture has a description to keep out");
  for (const row of [hidden, hiddenLapsed]) {
    assert.deepEqual(Object.keys(row ?? {}).sort(),
      ["company", "createdAt", "excerpt", "listingUrl", "publishes", "reasonCode", "snapshotId", "title"]);
    assert.equal(JSON.stringify(row).includes(description), false);
  }
  assert.ok(hiddenLapsed?.title && hiddenLapsed.company && hiddenLapsed.listingUrl,
    "title, company and link stay after the source lapses");

  // Once retention blanks the posting, the lists show it as unavailable; the link stays.
  assert.ok(await tombstoneExpiredSnapshots(pool, "jobicy", 720, "2027-06-01T00:00:00.000Z") > 0);
  const [tombstoned] = await listHiddenJobs(pool, user.id, publishing);
  assert.equal(tombstoned?.title, null);
  assert.equal(tombstoned?.company, null);
  assert.equal(tombstoned?.excerpt, "");
  assert.equal(tombstoned?.listingUrl, hiddenLapsed?.listingUrl);
  assert.equal((await listSavedJobsWithApplied(pool, user.id, publishing))[0]?.excerpt, "");

  // A hidden row whose snapshot fails the contract shows nothing of it.
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'jobicy', 'x', now(), $2::jsonb)",
    ["jobicy:broken-hidden", JSON.stringify({
      kind: "job_snapshot", id: "jobicy:broken-hidden", source_record_id: "jobicy:broken-hidden", title: "PLANTED",
    })],
  );
  await pool.query("INSERT INTO hidden_jobs (user_id, snapshot_id, reason_code) VALUES ($1, $2, 'other')",
    [user.id, "jobicy:broken-hidden"]);
  const broken = (await listHiddenJobs(pool, user.id, publishing)).find(row => row.snapshotId === "jobicy:broken-hidden");
  assert.deepEqual([broken?.title, broken?.company, broken?.listingUrl], [null, null, null]);
  await pool.query("DELETE FROM job_snapshots WHERE id = 'jobicy:broken-hidden'");
});
