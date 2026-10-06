import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { loadEmbeddedPostings, storeChunk } from "../../src/server/embeddings/embedding-service.ts";
import { makeEmbeddingVector, type EmbeddingVector } from "../../src/domain/embeddings.ts";
import { dedupKey, geographyKey, normalizeCompany } from "../../src/domain/dedup.ts";
import { nearDuplicateCandidates } from "../../src/domain/near-dup.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";
import { FAKE_MODEL_VERSION } from "../support/fake-embedder.ts";

// B5 plumbing against the real database: the loader feeds the rule with what is
// actually stored — vectors of the requested artifact only, tombstoned rows
// excluded — and the queue that comes out of it. Vectors here are HAND-BUILT
// (model version `fake/…`): these numbers say nothing about model quality, only
// that storage, round-trip and the rule agree.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-09-24T12:00:00.000Z";
test.after(async () => { await pool.end(); });

/**
 * A unit vector in the stored dimension (1024) whose cosine with the base
 * e1 = [1, 0, …, 0] is exactly `cosine`: [c, sqrt(1-c²), 0, …]. Hand-built, not
 * model output — these numbers are about plumbing, never about quality.
 */
function unit(cosine: number, modelVersion = FAKE_MODEL_VERSION): EmbeddingVector {
  const values = new Array<number>(1024).fill(0);
  values[0] = cosine;
  values[1] = Math.sqrt(1 - cosine * cosine);
  return makeEmbeddingVector({
    modelVersion, instructionVersion: "integration-instruction-v1", role: "document", values,
  });
}

function snapshotWith(base: JobSnapshot, id: string, title: string, company: string): JobSnapshot {
  return {
    ...base, id, source_record_id: id,
    title, company_name: company,
    source_url: `https://example.invalid/jobs/${id}`, apply_url: null,
    description_text: `${title} at ${company}. Remote.`,
  };
}

async function insertSnapshot(sourceId: string, snapshot: JobSnapshot): Promise<void> {
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [snapshot.id, sourceId, `hash-${snapshot.id}`, NOW, JSON.stringify(snapshot)]);
}

async function cleanup(): Promise<void> {
  await pool.query("DELETE FROM job_embeddings");
  await pool.query("DELETE FROM job_snapshots");
}

test("near-dup: the loader returns current-artifact vectors of live rows, and the queue follows the rule", async () => {
  await migrate(pool);
  await cleanup();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template, "the himalayas fixture must provide at least one snapshot");

  // a: the original posting. c: the same posting again (A4 key equal to a's —
  // exact duplicates must not reach the queue). b: a near-duplicate in another
  // source whose normalized title differs (different A4 key). t: tombstoned.
  const a = snapshotWith(template, "himalayas:nd-a", "Senior Backend Engineer", "Meridian Labs GmbH");
  const b = snapshotWith(template, "jobicy:nd-b", "Senior Backend Engineer, Platform Team", "Meridian Labs");
  const c = snapshotWith(template, "himalayas:nd-c", "Senior Backend Engineer", "Meridian Labs GmbH");
  const t = snapshotWith(template, "himalayas:nd-tomb", "Senior Backend Engineer", "Meridian Labs GmbH");
  await insertSnapshot("himalayas", a);
  await insertSnapshot("jobicy", b);
  await insertSnapshot("himalayas", c);
  await insertSnapshot("himalayas", t);
  await pool.query("UPDATE job_snapshots SET tombstoned_at = $1 WHERE id = $2", [NOW, t.id]);

  // The A4 keys must really be equal for a/c and different for a/b — otherwise
  // this test would silently stop testing the exact-duplicate skip.
  assert.equal(dedupKey(a), dedupKey(c));
  assert.notEqual(dedupKey(a), dedupKey(b));
  assert.equal(normalizeCompany(a.company_name), normalizeCompany(b.company_name));

  const work = [a, b, c, t].map(snapshot => ({
    snapshotId: snapshot.id, contentHash: `hash-${snapshot.id}`, textHash: `text-${snapshot.id}`,
    text: snapshot.description_text,
  }));
  const stored = await storeChunk(pool, work, [unit(1), unit(0.85), unit(1), unit(0.2)]);
  assert.equal(stored.stored, 4);
  // A vector from an older artifact must not leak into the current queue.
  await storeChunk(pool, [work[0]!], [unit(0.99, "fake/older-artifact-v0")]);

  const postings = await loadEmbeddedPostings(pool, {
    modelVersion: FAKE_MODEL_VERSION, instructionVersion: "integration-instruction-v1",
  });
  assert.deepEqual(postings.map(posting => posting.snapshotId).sort(),
    ["himalayas:nd-a", "himalayas:nd-c", "jobicy:nd-b"]);
  const loaded = postings.find(posting => posting.snapshotId === a.id);
  assert.ok(loaded);
  assert.ok(Math.abs((loaded.vector.values[0] ?? 0) - 1) < 1e-6, "float4 round-trip");

  const queueItems = postings.map(posting => ({
    id: posting.snapshotId,
    sourceId: posting.sourceId,
    companyKey: normalizeCompany(posting.snapshot.company_name),
    dedupKey: dedupKey(posting.snapshot),
    geographyKey: geographyKey(posting.snapshot),
    text: posting.vector,
    // Title vectors are not stored rows: the CLI embeds them; here they are the
    // same hand-built space so the rule has something deterministic to compare.
    title: unit(posting.snapshotId === b.id ? 0.9 : 1),
  }));
  const queue = nearDuplicateCandidates(queueItems);
  // a-b and b-c are near pairs (different A4 keys, cosines above both gates).
  // a-c is an exact duplicate by the A4 key and must NOT be in the queue.
  assert.deepEqual(queue.map(pair => [pair.a, pair.b]),
    [[a.id, b.id], [c.id, b.id]]);
  const [pair] = queue;
  assert.ok(pair);
  assert.ok(Math.abs(pair.textCosine - 0.85) < 1e-6, `text cosine ${pair.textCosine}`);
  assert.ok(Math.abs(pair.titleCosine - 0.9) < 1e-6, `title cosine ${pair.titleCosine}`);
  assert.equal(pair.sameCompany, true);
  assert.equal(pair.sameSource, false);
  assert.ok(!queue.some(candidate =>
    (candidate.a === a.id && candidate.b === c.id) || (candidate.a === c.id && candidate.b === a.id)),
  "the exact-duplicate pair (equal A4 key) must be skipped");
  assert.ok(!queueItems.some(candidate =>
    candidate.id === t.id), "a tombstoned posting must not be in the input at all");
  await cleanup();
});
