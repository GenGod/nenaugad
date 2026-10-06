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
  EmbeddingStoreError, countJobEmbeddings, countProfileEmbeddings, embeddingTextHash, embeddingWork,
  indexSourceEmbeddings, loadJobEmbeddings, loadProfileEmbedding, saveProfileEmbedding, storeChunk,
} from "../../src/server/embeddings/embedding-service.ts";
import { denseSearchForProfile } from "../../src/server/embeddings/dense-search-service.ts";
import { PROFILE_TEXT_VERSION, jobEmbeddingText, profileEmbeddingText } from "../../src/domain/embeddings.ts";
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
    snapshotWith(template, "jobicy:b1-denied", "Python developer role on jobicy (dense-leg fixture)."));
}

test("embeddings: an approved source is indexed; an expired (or unlicensed) policy is skipped whole", async () => {
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

  // jobicy's process_with_ml was granted on 2026-10-02 (owner decision No 4), so
  // the source that used to be skipped whole is now indexed like any other.
  const jobicy = await indexSourceEmbeddings({ pool, sourceId: "jobicy", embedder, now: NOW });
  assert.equal(jobicy.outcome, "indexed");
  assert.equal(jobicy.embedded, 1);
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 3);

  // The skip-whole branch still exists and stays tested through the policy's
  // validity window: after 2026-12-23 jobicy's policy is expired, and an expired
  // policy is denied exactly like a missing grant.
  const expired = await indexSourceEmbeddings({
    pool, sourceId: "jobicy", embedder, now: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(expired.outcome, "no_permission");
  assert.equal(expired.embedded, 0);

  const unknown = await indexSourceEmbeddings({ pool, sourceId: "not-a-source", embedder, now: NOW });
  assert.equal(unknown.outcome, "unknown_source");
});

test("embeddings: a posting is re-embedded when its text changes, not when the rest of it does (B28)", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });

  // A geography-only re-map gives the posting a new content hash; the embedded text
  // (title and description) is the same, so the vector is still current.
  await pool.query("UPDATE job_snapshots SET content_hash = 'hash-geography-only' WHERE id = $1",
    ["himalayas:b1-python"]);
  assert.deepEqual(await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION), []);

  // A text change is what the vector depends on.
  await pool.query(
    "UPDATE job_snapshots SET content_hash = 'hash-text-changed', snapshot = jsonb_set(snapshot, '{description_text}', to_jsonb($2::text)) WHERE id = $1",
    ["himalayas:b1-python", "Senior python developer, remote, postgres, async services and Kafka."]);
  const work = await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION);
  assert.deepEqual(work.map(entry => entry.snapshotId), ["himalayas:b1-python"]);

  const report = await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(report.outcome, "indexed");
  assert.equal(report.embedded, 1);
  assert.equal(report.current, 1);
  assert.equal((await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION)).length, 0);
});

test("embeddings: a limited run counts only postings that need a vector", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  // b1-python comes first by id and is current; the limit must reach b1-welder.
  await pool.query(
    "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{description_text}', to_jsonb($2::text)) WHERE id = $1",
    ["himalayas:b1-welder", "Welder for an offshore platform, on-site, night shifts."]);
  const work = await embeddingWork(pool, "himalayas", FAKE_MODEL_VERSION, 1);
  assert.deepEqual(work.map(entry => entry.snapshotId), ["himalayas:b1-welder"]);
});

test("embeddings: the database hashes a posting's text exactly as the indexer does (migration 0020)", async () => {
  await seedCatalog();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const id = "himalayas:b1-unicode";
  await insertSnapshot("himalayas", id, snapshotWith(template, id,
    "Ingénieur·e données — Zürich/Kraków, 東京, “quotes” and a tab\there 🚀"));
  // The expression migration 0020 uses to fill text_hash for the vectors that are current.
  const row = await pool.query<{ hash: string; snapshot: JobSnapshot }>(
    "SELECT encode(sha256(convert_to(concat(snapshot->>'title', E'\\n\\n', snapshot->>'description_text'), 'UTF8')), 'hex') AS hash, snapshot FROM job_snapshots WHERE id = $1",
    [id]);
  const stored = row.rows[0];
  assert.ok(stored);
  assert.equal(stored.hash, embeddingTextHash(jobEmbeddingText(stored.snapshot)));
});

test("embeddings: retention blanks the posting's text, and the vector dies with it", async () => {
  await seedCatalog();
  const embedder = createFakeEmbedder();
  await indexSourceEmbeddings({ pool, sourceId: "himalayas", embedder, now: NOW });
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 2);

  // Move one posting's last_seen past the policy window (720 h).
  await pool.query("UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', '\"2020-01-01T00:00:00.000Z\"') WHERE id = $1",
    ["himalayas:b1-welder"]);
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  const tombstoned = await persistence.tombstoneExpired("2026-09-24T12:00:00.000Z");
  assert.equal(tombstoned, 1);
  // RET-001: the row survives as a tombstone, but the vector is derived from
  // text that no longer exists — it must not outlive the text.
  assert.equal(await countJobEmbeddings(pool, FAKE_MODEL_VERSION), 1);
  const remaining = await loadJobEmbeddings({
    pool, snapshotIds: ["himalayas:b1-welder", "himalayas:b1-python"],
    modelVersion: FAKE_MODEL_VERSION, instructionVersion: embedder.instructionVersion,
  });
  assert.deepEqual([...remaining.keys()], ["himalayas:b1-python"]);
  const title = await pool.query<{ title: string }>(
    "SELECT snapshot->>'title' AS title FROM job_snapshots WHERE id = $1", ["himalayas:b1-welder"]);
  assert.equal(title.rows[0]?.title, "", "the prose is blanked, the row stays");
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

test("embeddings: dense search covers gated candidates, caches the query vector and refuses an expired policy", async () => {
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

  // jobicy is served like any source since the 2026-10-02 grant. This test
  // indexed himalayas only, so its candidate is covered by no vector —
  // "uncovered", which is not a refusal.
  const granted = await denseSearchForProfile({
    pool, sourceId: "jobicy", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds: ["jobicy:b1-denied"], embedder, now: NOW,
  });
  assert.equal(granted.outcome, "ok");
  assert.deepEqual(granted.ranking.uncovered, ["jobicy:b1-denied"]);

  // The refusal branch stays tested through the policy's validity window: an
  // expired policy is denied exactly like a missing grant.
  const expired = await denseSearchForProfile({
    pool, sourceId: "jobicy", userId: user.id, profileVersion: 1, profile: PROFILE_INPUT,
    candidateIds: ["jobicy:b1-denied"], embedder, now: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(expired.outcome, "no_permission");
  assert.deepEqual(expired.ranking.ranked, []);
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
  const ghostWork = { snapshotId: "himalayas:no-such-posting", contentHash: "x", textHash: "x", text: "python developer remote" };
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
