import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import {
  hideJobForUser, unhideJobForUser, listHiddenJobs, hiddenSnapshotIds,
  setAppliedMark, listSavedJobsWithApplied, FeedbackError,
} from "../../src/server/feedback-service.ts";
import { saveJobForUser } from "../../src/server/profile-service.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
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

  const listed = await listHiddenJobs(pool, userA.id);
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
  let rows = await listSavedJobsWithApplied(pool, userA.id);
  assert.equal(rows[0]?.markedAppliedAt, "2026-09-25T10:00:00.000Z");

  const cleared = await setAppliedMark({
    pool, userId: userA.id, snapshotId, applied: false, now: "2026-09-25T11:00:00.000Z",
  });
  assert.equal(cleared, true);
  rows = await listSavedJobsWithApplied(pool, userA.id);
  assert.equal(rows[0]?.markedAppliedAt, null);
});
