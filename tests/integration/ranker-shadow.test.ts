// Integration tests for the ranker shadow run (design item A9).
//
// The two properties that matter for a shadow are negative ones: it must not
// change what the candidate sees, and it must not put private data in the logs.
// Both are checked here against the real feed path on a live test database.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { saveProfileVersion } from "../../src/server/profile-service.ts";
import { matchedForUser } from "../../src/server/matching-service.ts";
import type { ShadowRequest } from "../../src/server/ranker-shadow-service.ts";
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

async function seed(): Promise<string> {
  await migrate(pool);
  await pool.query("DELETE FROM closure_checks");
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, enabledJobicy),
    policy: enabledJobicy, now: "2026-09-25T08:00:00.000Z",
  });
  const user = await registerUser(pool, `shadow-${randomBytes(6).toString("hex")}@example.invalid`, "long-enough-password");
  await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  return user.id;
}

function ids(result: Awaited<ReturnType<typeof matchedForUser>>): string[] {
  return [...result.eligible, ...result.needsReview].map(job => job.card.id);
}

test("A9: the shadow runs on exactly the delivered postings and logs counts, not data", async () => {
  const userId = await seed();
  const captured: ShadowRequest[] = [];
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    const result = await matchedForUser(userId, {
      pool,
      shadow: request => { captured.push(request); },
    });
    assert.equal(captured.length, 1, "one feed read = one shadow run");
    const delivered = ids(result);
    assert.ok(delivered.length >= 1, "the fixture import must leave a visible posting");
    assert.deepEqual(captured[0]?.jobs.map(job => job.snapshot.id).sort(), [...delivered].sort(),
      "the shadow sees exactly the postings the feed delivers");
    assert.equal(captured[0]?.items.length, delivered.length);
    // The pool is what the ranker was given: the postings this feed delivers.
    assert.equal(captured[0]?.poolSize, delivered.length);
  } finally {
    console.log = originalLog;
  }

  // The default shadow logs one line of counts. No payload, no ids, no profile.
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  try {
    await matchedForUser(userId, { pool });
  } finally {
    console.log = originalLog;
  }
  const line = logged.find(entry => entry.includes("RANKER_SHADOW"));
  assert.ok(line, "the shadow must log its report");
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.equal(parsed.code, "RANKER_SHADOW");
  assert.equal(typeof parsed.compared, "number");
  assert.equal(typeof parsed.moved, "number");
  assert.equal(typeof parsed.guardrailsPass, "boolean");
  assert.ok(typeof parsed.champion === "string" && typeof parsed.candidate === "string");
  assert.ok(!line.includes("jobicy:"), "no posting id in the log");
  assert.ok(!line.includes(userId), "no user id in the log");
});

test("A9: a shadow that throws cannot change the feed", async () => {
  const userId = await seed();
  const healthy = await matchedForUser(userId, { pool });
  const errored: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errored.push(args.map(String).join(" ")); };
  let broken;
  try {
    broken = await matchedForUser(userId, {
      pool,
      shadow: () => { throw new Error("shadow exploded"); },
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(ids(broken), ids(healthy), "the feed is identical when the shadow fails");
  assert.ok(errored.some(entry => entry.includes("RANKER_SHADOW_FAILED")),
    "the failure is reported, with a code and nothing else");
  assert.ok(!errored.join(" ").includes("exploded"), "the error message is not logged");
  // Determinism: the same inputs produce the same feed, shadow or not.
  assert.deepEqual(ids(await matchedForUser(userId, { pool })), ids(healthy));
});
