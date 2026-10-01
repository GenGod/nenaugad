import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { deleteAllProfiles, saveProfileVersion } from "../../src/server/profile-service.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import {
  EmbeddingStoreError, countJobEmbeddings, countProfileEmbeddings, embeddingWork,
  indexSourceEmbeddings, loadJobEmbeddings, loadProfileEmbedding, saveProfileEmbedding, storeChunk,
} from "../../src/server/embeddings/embedding-service.ts";
import { denseSearchForProfile } from "../../src/server/embeddings/dense-search-service.ts";
import { PROFILE_TEXT_VERSION, profileEmbeddingText } from "../../src/domain/embeddings.ts";
import type { ManualProfileInput } from "../../src/domain/profile.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";
import { createFakeEmbedder, FAKE_MODEL_VERSION } from "../support/fake-embedder.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-09-24T12:00:00.000Z";
const enabledPolicy = { ...himalayasCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const OLDER_MODEL_VERSION = "fake/deterministic-bag-of-tokens-v0";

const PROFILE_INPUT: ManualProfileInput = {
  residenceCountry: "DE", timezone: "Europe/Berlin",
  targetRoles: ["python developer"], skills: ["python", "postgres"],
  employmentTypes: ["contractor"],
  availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" }],
  zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
};

function uniqueEmail(): string {
  return `b1-${randomBytes(6).toString("hex")}@example.invalid`;
}

/**
 * pgvector's `vector` type stores each component as float4 (4 bytes — the size
 * the storage decision was costed at), so a value that goes to the database and
 * comes back is single-precision. Comparisons of round-tripped vectors are
 * therefore approximate by construction; this is the tolerance for that, not a
 * licence to loosen a semantic check.
 */
function assertCloseEnough(actual: readonly number[] | undefined, expected: readonly number[]): void {
  assert.ok(actual, "expected a vector");
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    const target = expected[index] ?? 0;
    assert.ok(Math.abs(value - target) < 1e-6, `component ${index}: ${value} vs ${target}`);
  });
}

function snapshotWith(base: JobSnapshot, id: string, descriptionText: string): JobSnapshot {
  return {
    ...base, id, source_record_id: id,
    source_url: `https://example.invalid/jobs/${id}`, apply_url: null,
    description_text: descriptionText,
  };
}

async function insertSnapshot(
  sourceId: string, id: string, snapshot: JobSnapshot, firstSeenAt = NOW,
): Promise<void> {
  await pool.query("INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [id, sourceId, `hash-${id}`, firstSeenAt, JSON.stringify(snapshot)]);
}

async function seedCatalog(): Promise<void> {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template, "the himalayas fixture must provide at least one snapshot");
  await insertSnapshot("himalayas", "himalayas:b1-python",
    snapshotWith(template, "himalayas:b1-python", "Senior python developer, remote, postgres and async services."));
  await insertSnapshot("himalayas", "himalayas:b1-welder",
    snapshotWith(template, "himalayas:b1-welder", "Welder for an offshore oil platform, on-site."));
  await insertSnapshot("jobicy", "jobicy:b1-denied",
    snapshotWith(template, "jobicy:b1-denied", "Python developer role (this source has no ML grant)."));
}

test("embeddings: an approved source is indexed; a source without the ML grant is skipped whole", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  const report = await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(report.outcome, "indexed");
  assert.equal(report.embedded, 2);
  assert.equal(report.current, 0);
  assert.equal(report.modelVersion, FAKE_MODEL_VERSION);
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);

  // Second run: nothing to do, and it says so instead of rewriting the same rows.
  const again = await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(again.outcome, "nothing_to_do");
  assert.equal(again.current, 2);

  // jobicy's process_with_ml is denied (owner decision 2026-09-30): no vectors,
  // not even for the postings already stored.
  const denied = await indexSourceEmbeddings({ pool, sourceId: "jobicy", embedder, now: NOW });
  assert.equal(denied.outcome, "no_permission");
  assert.equal(denied.embedded, 0);
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);

  const unknown = await indexSourceEmbeddings({ pool, sourceId: "not-a-source", embedder, now: NOW });
  assert.equal(unknown.outcome, "unknown_source");
});

test("embeddings: a changed posting is re-embedded, an unchanged one is left alone", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });

  // The trigger is the stored content hash, which is what the import pipeline
  // updates when the text changes.
  await pool.query("UPDATE job_snapshots SET content_hash = 'hash-changed' WHERE id = $1",
    ["himalayas:b1-python"]);
  const work = await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION);
  assert.deepEqual(work.map(entry => entry.snapshotId), ["himalayas:b1-python"]);

  const report = await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(report.outcome, "indexed");
  assert.equal(report.embedded, 1);
  assert.equal(report.current, 1);
  assert.equal((await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION)).length, 0);
});

test("embeddings: retention deletes the posting's vector together with the snapshot", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);

  // Move one posting's last_seen past the policy window (720 h).
  await pool.query("UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', '\"2020-01-01T00:00:00.000Z\"') WHERE id = $1",
    ["himalayas:b1-welder"]);
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  const deleted = await persistence.deleteExpired("2026-09-24T12:00:00.000Z");
  assert.equal(deleted, 1);
  // The vector is derived from text with a retention window: it must not outlive it.
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 1);
  const remaining = await loadJobEmbeddings({
    pool, snapshotIds: ["himalayas:b1-welder", "himalayas:b1-python"],
    modelVersion: FAKE_MODEL_VERSION, instructionVersion: embedder.instructionVersion,
  });
  assert.deepEqual([...remaining.keys()], ["himalayas:b1-python"]);
});

test("embeddings: the profile vector is personal data and dies with the profile", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  const snapshot = await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  assert.equal(snapshot.version, 1);

  const [vector] = await embedder.embed(
    [{ role: "query", text: profileEmbeddingText(PROFILE_INPUT) }], "matching",
  );
  assert.ok(vector);
  await saveProfileEmbedding(pool, {
    userId: user.id, profileVersion: 1, profileTextVersion: PROFILE_TEXT_VERSION, vector,
  });
  assert.equal(await countProfileEmbeddings(pool, user.id), 1);
  const loaded = await loadProfileEmbedding(pool, {
    userId: user.id, profileVersion: 1, modelVersion: FAKE_MODEL_VERSION,
    instructionVersion: embedder.instructionVersion, profileTextVersion: PROFILE_TEXT_VERSION,
  });
  assert.deepEqual(loaded?.modelVersion, FAKE_MODEL_VERSION);
  assert.deepEqual(loaded?.role, "query");
  assertCloseEnough(loaded?.values, vector.values);
  // A different query-text revision must not be served the cached vector.
  assert.equal(await loadProfileEmbedding(pool, {
    userId: user.id, profileVersion: 1, modelVersion: FAKE_MODEL_VERSION,
    instructionVersion: embedder.instructionVersion, profileTextVersion: "profile-text-l2",
  }), null);

  // Deleting the profile removes the vector, in the same statement that removes
  // the profile: there is no code path that can keep one without the other.
  await deleteAllProfiles(pool, user.id);
  assert.equal(await countProfileEmbeddings(pool, user.id), 0);

  // And a vector cannot be created for a profile version that does not exist.
  await assert.rejects(
    saveProfileEmbedding(pool, {
      userId: user.id, profileVersion: 1, profileTextVersion: PROFILE_TEXT_VERSION, vector,
    }),
    (error: unknown) => error instanceof EmbeddingStoreError && error.message === "PROFILE_VERSION_NOT_FOUND",
  );
});

test("embeddings: dense search covers gated candidates, caches the query vector and refuses a denied source", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  const candidateIds = ["himalayas:b1-python", "himalayas:b1-welder", "himalayas:b1-absent"];

  const first = await denseSearchForProfile({
    pool, sourceId: "himalayas", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds, embedder, now: NOW,
  });
  assert.equal(first.outcome, "ok");
  assert.equal(first.embeddedQuery, true, "the first request computes the profile vector");
  assert.deepEqual(first.ranking.ranked.map(entry => entry.id),
    ["himalayas:b1-python", "himalayas:b1-welder"]);
  assert.deepEqual(first.ranking.uncovered, ["himalayas:b1-absent"]);
  assert.deepEqual(first.ranking.refusals, []);

  // The second request is served from the cache: same order, no model work.
  const second = await denseSearchForProfile({
    pool, sourceId: "himalayas", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds, embedder, now: NOW,
  });
  assert.equal(second.embeddedQuery, false);
  // Same order. The similarities differ in the last digits only because the cached
  // query vector comes back from the database at float4 precision.
  assert.deepEqual(second.ranking.ranked.map(entry => entry.id),
    first.ranking.ranked.map(entry => entry.id));
  second.ranking.ranked.forEach((entry, index) => {
    const reference = first.ranking.ranked[index];
    assert.ok(reference);
    assert.ok(Math.abs(entry.similarity - reference.similarity) < 1e-6);
  });

  // jobicy has no dense representation, so the leg returns nothing at all.
  const denied = await denseSearchForProfile({
    pool, sourceId: "jobicy", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds: ["jobicy:b1-denied"], embedder, now: NOW,
  });
  assert.equal(denied.outcome, "no_permission");
  assert.deepEqual(denied.ranking.ranked, []);
});

test("embeddings: a posting the database cannot resolve is stepped over and named, not retried forever", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  const work = await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION);
  assert.equal(work.length, 2);
  // A work item whose snapshot the database cannot resolve by primary key. In the
  // working database this happens for real when a btree's ordering no longer
  // matches the server collation (12 of 700 ids on 2026-09-30); reproducing it
  // here needs only an id that does not exist.
  const ghostWork = { snapshotId: "himalayas:no-such-posting", contentHash: "x", text: "python developer remote" };
  const requests = [ghostWork, ...work].map(entry => ({ role: "document" as const, text: entry.text }));
  const vectors = await embedder.embed(requests, "matching");

  const result = await storeChunk(pool, [ghostWork, ...work], vectors);
  assert.equal(result.stored, 2);
  assert.deepEqual(result.unreachable, ["himalayas:no-such-posting"]);
  // The good rows in the same chunk survived: one bad key must not lose the run.
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);
});

test("embeddings: two artifact versions coexist and one search never mixes them", async () => {
  await seedCatalog();
  const current = createFakeEmbedder();
  const older = createFakeEmbedder({ modelVersion: OLDER_MODEL_VERSION });
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder: older, now: NOW });
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder: current, now: NOW });
  assert.equal(await countJobEmbeddings(pool, OLDER_MODEL_VERSION), 2);
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);

  const user = await registerUser(pool, uniqueEmail(), "long-enough-password");
  await saveProfileVersion(pool, user.id, PROFILE_INPUT);
  const result = await denseSearchForProfile({
    pool, sourceId: "himalayas", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds: ["himalayas:b1-python", "himalayas:b1-welder"], embedder: current, now: NOW,
  });
  // Exactly the requested version is used; the other version's rows are simply
  // not part of this space, so there is nothing to mix and nothing to refuse.
  assert.deepEqual(result.ranking.refusals, []);
  assert.equal(result.ranking.ranked.length, 2);
  const loaded = await loadJobEmbeddings({
    pool, snapshotIds: ["himalayas:b1-python"], modelVersion: FAKE_MODEL_VERSION,
    instructionVersion: current.instructionVersion,
  });
  assert.equal(loaded.size, 1);
});
