import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { localPool, migrate } from "../../scripts/db.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { mapRemoteFirstJobsFixture } from "../../src/server/import/remote-first-jobs-fixture.ts";
import { batchJobsFor, processPendingBatches, submitRelevanceBatch } from "../../src/server/ai/batch-queue-service.ts";
import { buildJsonl } from "../../src/server/ai/openai-batch.ts";
import { buildSinglePrompt } from "../../src/server/relevance-service.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

// B63: the batch request is built only from postings whose source may send text to the
// provider. Synthetic fixtures in the test database; nothing here reaches a provider (the
// batch path stays closed), and the only stand-ins are the labelled pool wrappers below.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-11-03T12:00:00.000Z";
/** The moment Himalayas' grant ends, read from its policy so a renewal moves it too. */
const LAPSED = himalayasCandidatePolicy.valid_until ?? "";
test.after(async () => { await pool.end(); });

const ALLOWED_ID = "himalayas:b63-allowed";
const DENIED_ID = "remote_first_jobs:b63-denied";
/** A second refused posting from the same source: the count is of postings, not sources. */
const DENIED_ID_2 = "remote_first_jobs:b63-denied-2";
/** An allowed posting stored without an excerpt. */
const NO_EXCERPT_ID = "himalayas:b63-no-excerpt";
/** An allowed posting id with no stored row. */
const MISSING_ID = "himalayas:b63-missing";
/** A posting id whose source has no policy at all. */
const UNKNOWN_ID = "nosuch:b63-unknown";
const PROFILE = { targetRoles: ["Backend Engineer"], residenceCountry: "DE" };

const DENIED_TEXT = {
  title: "B63 Zephyrine Denied Title", company: "B63 Quillmark Denied Company",
  excerpt: "B63 denied excerpt marker", description: "B63 denied description marker",
};

async function insertSnapshot(snapshot: JobSnapshot, excerpt: string): Promise<void> {
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, excerpt, snapshot) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
    [snapshot.id, snapshot.id.split(":")[0], `hash-${snapshot.id}`, NOW, excerpt, JSON.stringify(snapshot)]);
}

async function cleanup(): Promise<void> {
  await pool.query("DELETE FROM job_snapshots WHERE id = ANY($1::text[])",
    [[ALLOWED_ID, DENIED_ID, DENIED_ID_2, NO_EXCERPT_ID]]);
}

async function seed(): Promise<{ allowed: JobSnapshot }> {
  await migrate(pool);
  await cleanup();
  assert.ok(LAPSED.length > 0, "the Himalayas grant has a valid_until");
  const [himalayas] = mapHimalayasFixture(NOW);
  const [remoteFirst] = mapRemoteFirstJobsFixture(NOW);
  assert.ok(himalayas && remoteFirst);
  const allowed: JobSnapshot = {
    ...himalayas, id: ALLOWED_ID, source_record_id: ALLOWED_ID,
    title: "B63 Allowed Title", company_name: "B63 Allowed Company",
  };
  await insertSnapshot(allowed, "B63 allowed excerpt");
  await insertSnapshot({
    ...remoteFirst, id: DENIED_ID, source_record_id: DENIED_ID,
    title: DENIED_TEXT.title, company_name: DENIED_TEXT.company, description_text: DENIED_TEXT.description,
  }, DENIED_TEXT.excerpt);
  await insertSnapshot({
    ...remoteFirst, id: DENIED_ID_2, source_record_id: DENIED_ID_2,
    title: `${DENIED_TEXT.title} II`, company_name: DENIED_TEXT.company, description_text: DENIED_TEXT.description,
  }, DENIED_TEXT.excerpt);
  await insertSnapshot({
    ...himalayas, id: NO_EXCERPT_ID, source_record_id: NO_EXCERPT_ID,
    title: "B63 No Excerpt Title", company_name: "B63 No Excerpt Company",
    description_text: "B63 description used when there is no excerpt",
  }, "");
  return { allowed };
}

/** Labelled spy: the real pool, recording the parameters of every query. */
function recordingPool(): { pool: Pool; params: unknown[][] } {
  const params: unknown[][] = [];
  const spy = {
    query: (sql: string, values: unknown[] = []) => { params.push(values); return pool.query(sql, values); },
  } as unknown as Pool;
  return { pool: spy, params };
}

test("a batch built from three sources carries only the posting whose source may send text (B63)", async () => {
  const { allowed } = await seed();
  try {
    const reads = recordingPool();
    const plan = await batchJobsFor({
      pool: reads.pool, postingIds: [ALLOWED_ID, DENIED_ID, DENIED_ID_2, UNKNOWN_ID], profile: PROFILE, now: NOW,
    });
    assert.deepEqual(plan.jobs.map(job => job.snapshotId), [ALLOWED_ID]);
    assert.deepEqual(Object.values(plan.mapping), [ALLOWED_ID]);
    // Skipped and counted, per posting: Remote First Jobs has no send_to_ai_provider
    // grant, and a source without a policy is refused like an expired grant.
    assert.equal(plan.rightsSkipped, 3);
    assert.deepEqual([...plan.deniedSources].sort(), ["nosuch", "remote_first_jobs"]);
    // Nothing of the refused posting is in what would be uploaded or stored.
    const request = buildJsonl(plan.jobs) + JSON.stringify(plan.mapping);
    for (const marker of [DENIED_TEXT.title, DENIED_TEXT.company, DENIED_TEXT.excerpt,
      DENIED_TEXT.description, DENIED_ID, "b63-denied", UNKNOWN_ID]) {
      assert.equal(request.includes(marker), false, marker);
    }
    // Rights before text: a refused source is never read.
    assert.ok(reads.params.length > 0);
    assert.equal(reads.params.flat().some(value => value === "remote_first_jobs" || value === "nosuch"), false);
    // The allowed posting's job is what it was before the check.
    assert.deepEqual(plan.jobs[0], {
      customId: "rel-himalayas_b63-allowed", snapshotId: ALLOWED_ID,
      prompt: buildSinglePrompt(
        { title: allowed.title, company: allowed.company_name, description: "B63 allowed excerpt" },
        { targetRoles: PROFILE.targetRoles, country: "DE" }),
    });
  } finally {
    await cleanup();
  }
});

test("past the grant's valid_until nothing is built and no source is read (B63)", async () => {
  await seed();
  try {
    const reads = recordingPool();
    const plan = await batchJobsFor({
      pool: reads.pool, postingIds: [ALLOWED_ID, DENIED_ID, DENIED_ID_2], profile: PROFILE, now: LAPSED,
    });
    assert.deepEqual(plan.jobs, []);
    assert.deepEqual(plan.mapping, {});
    assert.equal(plan.rightsSkipped, 3);
    assert.deepEqual([...plan.deniedSources].sort(), ["himalayas", "remote_first_jobs"]);
    assert.equal(reads.params.length, 0);
  } finally {
    await cleanup();
  }
});

test("an allowed posting without an excerpt is described by its text; one not stored is left out uncounted (B63)", async () => {
  await seed();
  try {
    const plan = await batchJobsFor({
      pool, postingIds: [NO_EXCERPT_ID, MISSING_ID],
      profile: { targetRoles: ["Backend Engineer"], residenceCountry: null }, now: NOW,
    });
    assert.deepEqual(plan.jobs.map(job => job.snapshotId), [NO_EXCERPT_ID]);
    // A posting the store no longer has is not a rights refusal.
    assert.equal(plan.rightsSkipped, 0);
    assert.deepEqual(plan.deniedSources, []);
    assert.equal(plan.jobs[0]?.prompt, buildSinglePrompt(
      { title: "B63 No Excerpt Title", company: "B63 No Excerpt Company",
        description: "B63 description used when there is no excerpt" },
      { targetRoles: ["Backend Engineer"], country: "не указана" }));
  } finally {
    await cleanup();
  }
});

test("the batch path stays closed: submit and poll return before any query (B63)", async () => {
  // Labelled stub: a pool that fails the test if the closed path asks it anything.
  const untouchable = { query: () => { throw new Error("MUST_NOT_QUERY"); } } as unknown as Pool;
  assert.equal(await submitRelevanceBatch({ pool: untouchable, userId: "u_b63" }), null);
  assert.deepEqual(await processPendingBatches(untouchable), { checked: 0, completed: 0, stored: 0 });
});
