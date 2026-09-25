import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser, RegistrationError, findUserByEmail } from "../../src/server/users.ts";
import { verifyPassword } from "../../src/server/password.ts";
import {
  countProfileVersions, deleteAllProfiles, latestProfile, listSavedJobs,
  saveJobForUser, saveProfileVersion, unsaveJobForUser, ProfileServiceError,
} from "../../src/server/profile-service.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { runHimalayasImport, createMemoryPersistence } from "../../src/server/import/himalayas-adapter.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-09-24T12:00:00.000Z";
const enabledPolicy = { ...himalayasCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], employmentTypes: ["contractor"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};

function uniqueEmail(): string {
  return `s2-${randomBytes(6).toString("hex")}@example.invalid`;
}

test("registration stores scrypt hashes; duplicate emails are rejected", async () => {
  await migrate(pool);
  const email = uniqueEmail();
  const user = await registerUser(pool, email, "long-enough-password");
  assert.match(user.passwordHash, /^scrypt\$/u);
  assert.equal(verifyPassword("long-enough-password", user.passwordHash), true);
  assert.equal(verifyPassword("wrong-password-123", user.passwordHash), false);
  await assert.rejects(registerUser(pool, email, "another-long-password"), RegistrationError);
  await assert.rejects(registerUser(pool, "not-an-email", "long-enough-password"), RegistrationError);
  await assert.rejects(registerUser(pool, uniqueEmail(), "short"), RegistrationError);
  assert.equal((await findUserByEmail(pool, email.toUpperCase()))?.id, user.id);
});

test("profiles version per save; deletion removes all versions of that user only", async () => {
  await migrate(pool);
  const userA = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const userB = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const first = await saveProfileVersion(pool, userA.id, PROFILE_INPUT);
  assert.equal(first.version, 1);
  const second = await saveProfileVersion(pool, userA.id,
    { ...PROFILE_INPUT, residenceCountry: "FR" });
  assert.equal(second.version, 2);
  assert.equal(await countProfileVersions(pool, userA.id), 2);
  const latest = await latestProfile(pool, userA.id);
  assert.equal(latest?.input.residenceCountry, "FR");
  assert.equal(latest?.version, 2);
  // B has no profiles and cannot see A's data through the service surface.
  assert.equal(await latestProfile(pool, userB.id), null);
  assert.equal(await countProfileVersions(pool, userB.id), 0);

  const removed = await deleteAllProfiles(pool, userA.id);
  assert.equal(removed, 4); // 2 candidate + 2 search rows
  assert.equal(await latestProfile(pool, userA.id), null);
  // Invalid input never reaches storage.
  await assert.rejects(saveProfileVersion(pool, userB.id, { nonsense: true }));
});

test("saved jobs are strictly ownership-scoped", async () => {
  await migrate(pool);
  // Isolated state: earlier suites leave checkpoints that the poll gate honours.
  await pool.query("DELETE FROM saved_jobs");
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const userA = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const userB = await registerUser(pool, uniqueEmail(), "long-enough-password");
  // Seed one real snapshot through the import pipeline.
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  await runHimalayasImport({
    transport: async () => ({
      status: "ok" as const, jobs: [...(await import("../../src/server/import/himalayas-fixture.ts"))
        .himalayasContractFixture], nextCursor: null,
    }),
    persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  const snapshotId = mapHimalayasFixture(NOW)[0]!.id;
  await saveJobForUser(pool, userA.id, snapshotId);
  assert.equal((await listSavedJobs(pool, userA.id)).length, 1);
  assert.equal((await listSavedJobs(pool, userB.id)).length, 0);
  // B cannot unsave A's record; A can.
  assert.equal(await unsaveJobForUser(pool, userB.id, snapshotId), false);
  assert.equal(await unsaveJobForUser(pool, userA.id, snapshotId), true);
  assert.equal((await listSavedJobs(pool, userA.id)).length, 0);
  // Unknown snapshots are rejected by the foreign key, not silently stored.
  await assert.rejects(
    saveJobForUser(pool, userA.id, "himalayas:does-not-exist"),
    ProfileServiceError,
  );
});

test("memory persistence still satisfies the adapter contract", () => {
  const memory = createMemoryPersistence(720);
  assert.equal(memory.state, null);
});
