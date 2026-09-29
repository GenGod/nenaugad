// Integration test for the availability signal (design item A10).
//
// The signal has to reach the candidate honestly: an unconfirmed posting stays in
// the feed with a note, and only the closure rule itself (two failed checks) takes
// it out. A demotion must never hide anything.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { saveProfileVersion } from "../../src/server/profile-service.ts";
import { matchedForUser } from "../../src/server/matching-service.ts";
import { ghostNote } from "../../src/domain/ev-multipliers.ts";
import { runClosureCheckPass } from "../../src/server/import/closure-checks.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { jobicyContractFixture } from "../../src/server/import/jobicy-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledJobicy = { ...jobicyCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const PROFILE_INPUT = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["engineer"], skills: [], employmentTypes: ["employment_full_time"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};
const T0 = "2026-09-25T08:00:00.000Z";
const at = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000).toISOString();

async function seed(): Promise<string> {
  await migrate(pool);
  await pool.query("DELETE FROM closure_checks");
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now: T0,
  });
  const user = await registerUser(pool, `ev-${randomBytes(6).toString("hex")}@example.invalid`, "long-enough-password");
  await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  return user.id;
}

test("A10: an unconfirmed posting stays in the feed with an honest note", async () => {
  const userId = await seed();
  const before = await matchedForUser(userId, { pool, shadow: () => {} });
  const visible = [...before.eligible, ...before.needsReview];
  assert.ok(visible.length >= 1, "the fixture import must leave a visible posting");
  assert.ok(visible.every(job => job.closure === null), "no check has run yet");

  // One failed availability check: still active in our store (two are needed to
  // close), so it must still be delivered — demotion is not hiding.
  const pass = await runClosureCheckPass({
    pool, now: at(7),
    head: async () => ({ result: "inactive" as const }),
  });
  assert.equal(pass.closed, 0);
  const after = await matchedForUser(userId, { pool, shadow: () => {} });
  const stillVisible = [...after.eligible, ...after.needsReview];
  assert.deepEqual(
    stillVisible.map(job => job.card.id).sort(),
    visible.map(job => job.card.id).sort(),
    "a suspected posting is still delivered",
  );
  const suspected = stillVisible.find(job => job.closure?.lastResult === "inactive");
  assert.ok(suspected, "the closure signal must reach the feed");
  assert.match(ghostNote(suspected.closure) ?? "", /Возможно неактивна/u);

  // Only the closure rule itself takes it out of the feed.
  const second = await runClosureCheckPass({
    pool, now: at(14),
    head: async () => ({ result: "inactive" as const }),
  });
  assert.ok(second.closed >= 1);
  const closedFeed = await matchedForUser(userId, { pool, shadow: () => {} });
  assert.equal([...closedFeed.eligible, ...closedFeed.needsReview].length, 0,
    "a closed posting leaves the feed — and that is the closure rule, not the ranking");
});

test("A10: an unknown check result is neither hiding nor suspicion", async () => {
  const userId = await seed();
  await runClosureCheckPass({
    pool, now: at(7),
    head: async () => ({ result: "unknown" as const }),
  });
  const feed = await matchedForUser(userId, { pool, shadow: () => {} });
  const visible = [...feed.eligible, ...feed.needsReview];
  assert.ok(visible.length >= 1);
  for (const job of visible) {
    assert.equal(ghostNote(job.closure), null, "unknown availability is not a warning");
  }
});
