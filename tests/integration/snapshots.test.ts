import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { createPostgresPersistence, runSnapshotRetentionPass } from "../../src/server/storage/snapshots.ts";
import { tombstoneSnapshot } from "../../src/domain/snapshot-projection.ts";
import { isJobSnapshot, type JobSnapshot } from "../../src/domain/source-contracts.ts";
import { registerUser } from "../../src/server/users.ts";
import { storeExtraction } from "../../src/server/ai/extraction-store.ts";
import { storeScore } from "../../src/server/relevance-service.ts";
import { runHimalayasImport } from "../../src/server/import/himalayas-adapter.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import { himalayasContractFixture } from "../../src/server/import/himalayas-fixture.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const enabledPolicy = { ...himalayasCandidatePolicy, enabled: true };
test.after(async () => { await pool.end(); });

const fullPage = async () => ({
  status: "ok" as const, jobs: [...himalayasContractFixture], nextCursor: null,
});

test("live snapshot import persists, is idempotent and checkpoints the cursor", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const persistence = createPostgresPersistence(pool, enabledPolicy);

  const first = await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  assert.equal(first.result, "applied");
  assert.equal(first.recordsMapped, 3);
  const rows = await pool.query<{ excerpt: string }>(
    "SELECT excerpt FROM job_snapshots ORDER BY id");
  assert.equal(rows.rowCount, 3);
  assert.ok(rows.rows.every(row => typeof row.excerpt === "string"));

  const second = await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-25T12:00:00.000Z",
  });
  assert.deepEqual(second.changes.map(change => change.change), ["seen", "seen", "seen"]);
  const state = await persistence.loadImportState();
  assert.equal(state?.lastRunAt, "2026-09-25T12:00:00.000Z");
  assert.equal(state?.nextCursor, null);
  assert.equal(state?.runCount, 2);

  // A budget-limited walk keeps the cursor checkpoint and adds no misses.
  const partial = await runHimalayasImport({
    transport: async () => ({ status: "ok" as const, jobs: [], nextCursor: "check-point" }),
    persistence, policy: enabledPolicy, now: "2026-09-26T12:00:00.000Z", maxPages: 1,
  });
  assert.equal(partial.result, "partial");
  assert.equal((await persistence.loadImportState())?.nextCursor, "check-point");
  const misses = await pool.query("SELECT full_pass_misses FROM job_snapshots");
  assert.ok(misses.rows.every(row => Number(row.full_pass_misses) === 0));
});

test("snapshot tables reject foreign sources and non-snapshot payloads", async () => {
  await migrate(pool);
  await assert.rejects(pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'other', 'x', now(), $2::jsonb)",
    ["foreign-1", JSON.stringify({ kind: "job_snapshot" })],
  ));
  await assert.rejects(pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'himalayas', 'x', now(), $2::jsonb)",
    ["bad-payload", JSON.stringify({ kind: "something_else" })],
  ));
});

test("retention tombstones snapshots whose last_seen passed the policy window", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  await runHimalayasImport({
    transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  await pool.query(
    "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
    [JSON.stringify("2020-01-01T00:00:00.000Z"), "himalayas:jobs-fixture-h-001"],
  );
  const before = await pool.query<{ snapshot: JobSnapshot }>(
    "SELECT snapshot FROM job_snapshots WHERE id = $1", ["himalayas:jobs-fixture-h-001"]);
  const tombstoned = await persistence.tombstoneExpired("2026-09-24T12:00:00.000Z");
  assert.equal(tombstoned, 1);
  // B62-001: the stored tombstone is exactly the domain's, so it holds no quote either.
  const after = await pool.query<{ snapshot: JobSnapshot }>(
    "SELECT snapshot FROM job_snapshots WHERE id = $1", ["himalayas:jobs-fixture-h-001"]);
  assert.deepEqual(after.rows[0]?.snapshot, tombstoneSnapshot(before.rows[0]!.snapshot));
  assert.equal(isJobSnapshot(after.rows[0]?.snapshot), true);
  assert.ok(before.rows[0]!.snapshot.evidence.some(item => item.quote), "the fixture had quotes to blank");
  assert.ok(after.rows[0]!.snapshot.evidence.every(item => item.quote === null));
  // RET-001: the row stays — identifiers, dates and the hash survive, the prose
  // does not, and the lifecycle says what happened. Nothing read-facing sees it:
  // classifySnapshot excludes anything that is not active.
  const rows = await pool.query<{ id: string; excerpt: string; lifecycle: string; title: string;
    description: string; tombstoned_at: Date | null; content_hash: string; first_seen_at: Date }>(
    "SELECT id, excerpt, snapshot->>'lifecycle' AS lifecycle, snapshot->>'title' AS title, snapshot->>'description_text' AS description, tombstoned_at, content_hash, first_seen_at FROM job_snapshots ORDER BY id");
  assert.equal(rows.rowCount, 3, "nothing is deleted any more");
  const tombstone = rows.rows.find(row => row.id === "himalayas:jobs-fixture-h-001");
  assert.ok(tombstone, "the expired record is still there");
  assert.equal(tombstone.lifecycle, "tombstoned");
  assert.equal(tombstone.title, "");
  assert.equal(tombstone.description, "");
  assert.equal(tombstone.excerpt, "");
  assert.ok(tombstone.tombstoned_at, "the tombstoning moment is recorded");
  assert.ok(tombstone.content_hash.length > 0, "the hash survives for dedup/history");
  assert.ok(tombstone.first_seen_at, "first_seen provenance survives");
  // A second pass does not re-tombstone what is already a tombstone.
  assert.equal(await persistence.tombstoneExpired("2026-09-24T12:00:00.000Z"), 0);
});

test("the worker's retention pass clears every source without an import (B62)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  const { jobicyCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runJobicyImport } = await import("../../src/server/import/jobicy-adapter.ts");
  const { jobicyContractFixture } = await import("../../src/server/import/jobicy-fixture.ts");
  const jobicyEnabled = { ...jobicyCandidatePolicy, enabled: true };
  await runHimalayasImport({
    transport: fullPage, persistence: createPostgresPersistence(pool, enabledPolicy),
    policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, jobicyEnabled), policy: jobicyEnabled,
    now: "2026-09-24T12:00:00.000Z",
  });
  // One posting of each source was last seen long ago; nothing imports either source again.
  for (const id of ["himalayas:jobs-fixture-h-001", "jobicy:900001"]) {
    await pool.query(
      "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
      [JSON.stringify("2020-01-01T00:00:00.000Z"), id],
    );
  }
  // A row the contract rejects (every reader skips it) still holds text and is past its window.
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'himalayas', 'x', now(), $2::jsonb)",
    ["himalayas:broken-1", JSON.stringify({
      kind: "job_snapshot", id: "himalayas:broken-1", source_record_id: "himalayas:broken-1",
      title: "PLANTED broken title", dates: { last_seen_at: "2020-01-01T00:00:00.000Z" },
    })],
  );

  const report = await runSnapshotRetentionPass(pool, "2026-09-25T00:00:00.000Z");
  assert.deepEqual(report, [
    { sourceId: "himalayas", tombstoned: 2, failed: false },
    { sourceId: "jobicy", tombstoned: 1, failed: false },
  ]);
  const rows = await pool.query<{ id: string; tombstoned: boolean }>(
    "SELECT id, tombstoned_at IS NOT NULL AS tombstoned FROM job_snapshots ORDER BY id");
  assert.deepEqual(rows.rows.filter(row => row.tombstoned).map(row => row.id),
    ["himalayas:broken-1", "himalayas:jobs-fixture-h-001", "jobicy:900001"]);
  assert.equal(rows.rows.filter(row => !row.tombstoned).length, 4, "postings inside their window are untouched");
  const broken = await pool.query("SELECT snapshot FROM job_snapshots WHERE id = 'himalayas:broken-1'");
  assert.deepEqual(broken.rows[0]?.snapshot, {
    kind: "job_snapshot", id: "himalayas:broken-1", source_record_id: "himalayas:broken-1", lifecycle: "tombstoned",
  });
  // A second pass finds nothing new.
  assert.deepEqual(await runSnapshotRetentionPass(pool, "2026-09-25T00:00:00.000Z"), [
    { sourceId: "himalayas", tombstoned: 0, failed: false },
    { sourceId: "jobicy", tombstoned: 0, failed: false },
  ]);
});

test("one source's retention failure leaves the others to run (B62)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  await runHimalayasImport({
    transport: fullPage, persistence: createPostgresPersistence(pool, enabledPolicy),
    policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  await pool.query(
    "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
    [JSON.stringify("2020-01-01T00:00:00.000Z"), "himalayas:jobs-fixture-h-001"],
  );
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'jobicy', 'x', now(), $2::jsonb)",
    ["jobicy:bad-date", JSON.stringify({
      kind: "job_snapshot", id: "jobicy:bad-date", source_record_id: "jobicy:bad-date",
      dates: { last_seen_at: "not a date" },
    })],
  );
  assert.deepEqual(await runSnapshotRetentionPass(pool, "2026-09-25T00:00:00.000Z"), [
    { sourceId: "himalayas", tombstoned: 1, failed: false },
    { sourceId: "jobicy", tombstoned: 0, failed: true },
  ]);
  await pool.query("DELETE FROM job_snapshots WHERE id = 'jobicy:bad-date'");
});

test("clearing a posting deletes the rows derived from its text, and none is written onto it (B66)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  await runHimalayasImport({
    transport: fullPage, persistence: createPostgresPersistence(pool, enabledPolicy),
    policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  const user = await registerUser(pool, `b66-${randomBytes(6).toString("hex")}@example.invalid`, "long-enough-password");
  const [cleared, live, racing] = [
    "himalayas:jobs-fixture-h-001", "himalayas:jobs-fixture-h-002", "himalayas:jobs-fixture-h-003"];
  const provenance = { promptVersion: "b66-test", modelVersion: "test-model", operationId: "op-b66", settledMinor: 53n };
  const derive = async (snapshotId: string) => {
    await storeExtraction(pool, {
      snapshotId, snapshotVersion: 1, inputHash: `input-${snapshotId}`, status: "rejected",
      fields: null, rawOutput: "PLANTED model output quoting the posting", reasons: [], provenance,
    });
    await storeScore({ pool, userId: user.id, profileVersion: 1, modelId: "test-model", score: {
      snapshotId, score: 70, matchedSkills: ["go"], missingSkills: [], explanation: "PLANTED explanation",
    } });
  };
  const derived = async (snapshotId: string) => Number((await pool.query<{ n: string }>(
    "SELECT (SELECT count(*) FROM job_llm_fields WHERE snapshot_id = $1) + (SELECT count(*) FROM job_relevance_scores WHERE snapshot_id = $1) AS n",
    [snapshotId])).rows[0]?.n);
  await derive(cleared);
  await derive(live);
  assert.equal(await derived(cleared), 2);
  await pool.query(
    "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
    [JSON.stringify("2020-01-01T00:00:00.000Z"), cleared],
  );
  const ledger = async () => ({
    operations: (await pool.query("SELECT id, status, reserved_minor, settled_minor FROM ai_operations ORDER BY id")).rows,
    budgets: (await pool.query("SELECT * FROM ai_budgets ORDER BY id")).rows,
  });
  const ledgerBefore = await ledger();

  assert.deepEqual(await runSnapshotRetentionPass(pool, "2026-09-25T00:00:00.000Z"),
    [{ sourceId: "himalayas", tombstoned: 1, failed: false }]);
  assert.equal(await derived(cleared), 0, "the cleared posting keeps no derived row");
  assert.equal(await derived(live), 2, "a live posting keeps its derived rows");
  assert.deepEqual(await ledger(), ledgerBefore, "the record of paid calls and the budgets are untouched");

  // A result that arrives after the posting was cleared is not stored.
  await derive(cleared);
  assert.equal(await derived(cleared), 0);

  // Nor one that waits on the posting while a retention batch is clearing it.
  const retention = await pool.connect();
  try {
    await retention.query("BEGIN");
    await retention.query("SELECT id FROM job_snapshots WHERE id = $1 FOR NO KEY UPDATE", [racing]);
    await retention.query("UPDATE job_snapshots SET tombstoned_at = now() WHERE id = $1", [racing]);
    const waiting = derive(racing);
    await new Promise(resolve => setTimeout(resolve, 300));
    await retention.query("COMMIT");
    await waiting;
  } finally {
    retention.release();
  }
  assert.equal(await derived(racing), 0);

  // A second pass has nothing left to clear or delete.
  assert.deepEqual(await runSnapshotRetentionPass(pool, "2026-09-25T00:00:00.000Z"),
    [{ sourceId: "himalayas", tombstoned: 0, failed: false }]);
  assert.equal(await derived(live), 2);

  // The source lists the cleared posting again: the import revives it and keeps its count.
  await runHimalayasImport({
    transport: fullPage, persistence: createPostgresPersistence(pool, enabledPolicy),
    policy: enabledPolicy, now: "2026-09-26T00:00:00.000Z",
  });
  const revived = await pool.query<{ tombstoned: boolean; cleared_count: number }>(
    "SELECT tombstoned_at IS NOT NULL AS tombstoned, cleared_count FROM job_snapshots WHERE id = $1", [cleared]);
  assert.deepEqual(revived.rows[0], { tombstoned: false, cleared_count: 1 });
});

test("a relevance score waiting on a posting that a retention batch is clearing is not written (B67)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots");
  await pool.query("DELETE FROM import_state");
  await runHimalayasImport({
    transport: fullPage, persistence: createPostgresPersistence(pool, enabledPolicy),
    policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z",
  });
  const user = await registerUser(pool, `b67-${randomBytes(6).toString("hex")}@example.invalid`, "long-enough-password");
  const posting = "himalayas:jobs-fixture-h-001";
  const retention = await pool.connect();
  try {
    await retention.query("BEGIN");
    await retention.query("SELECT id FROM job_snapshots WHERE id = $1 FOR NO KEY UPDATE", [posting]);
    await retention.query("UPDATE job_snapshots SET tombstoned_at = now() WHERE id = $1", [posting]);
    const waiting = storeScore({ pool, userId: user.id, profileVersion: 1, modelId: "test-model", score: {
      snapshotId: posting, score: 70, matchedSkills: [], missingSkills: [], explanation: "PLANTED explanation",
    } });
    await new Promise(resolve => setTimeout(resolve, 300));
    await retention.query("COMMIT");
    await waiting;
  } finally {
    retention.release();
  }
  const scores = await pool.query("SELECT count(*)::int AS n FROM job_relevance_scores WHERE user_id = $1", [user.id]);
  assert.equal(scores.rows[0]?.n, 0);
});

test("an import keeps the stored excerpt of every record it did not fetch (B30)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'jobicy'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
  const { jobicyCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runJobicyImport } = await import("../../src/server/import/jobicy-adapter.ts");
  const { jobicyContractFixture } = await import("../../src/server/import/jobicy-fixture.ts");
  const jobicyEnabled = { ...jobicyCandidatePolicy, enabled: true };
  const persistence = createPostgresPersistence(pool, jobicyEnabled);
  const [first, second, third] = jobicyContractFixture;
  assert.ok(first && second && third);
  const windowOf = (jobs: readonly (typeof first)[]) => async () => ({ status: "ok" as const, jobs: [...jobs] });
  await runJobicyImport({
    transport: windowOf([first, second, { ...third, jobExcerpt: "R&amp;D tools&hellip;" }]),
    persistence, policy: jobicyEnabled, now: "2026-09-25T12:00:00.000Z",
  });
  // Six hours later the window has moved on: only the first posting is listed, now without an excerpt.
  await runJobicyImport({
    transport: windowOf([{ ...first, jobExcerpt: null }]),
    persistence, policy: jobicyEnabled, now: "2026-09-25T18:00:00.000Z",
  });
  const rows = await pool.query<{ id: string; excerpt: string }>(
    "SELECT id, excerpt FROM job_snapshots WHERE source_id = 'jobicy' ORDER BY id");
  assert.deepEqual(rows.rows.map(row => [row.id, row.excerpt]), [
    ["jobicy:900001", ""],
    ["jobicy:900002", second.jobExcerpt],
    ["jobicy:900003", "R&D tools…"],
  ]);
});

test("a himalayas record fetched without an excerpt shows none; one not fetched keeps its own (B30)", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'himalayas'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'himalayas'");
  const persistence = createPostgresPersistence(pool, enabledPolicy);
  await runHimalayasImport({ transport: fullPage, persistence, policy: enabledPolicy, now: "2026-09-24T12:00:00.000Z" });
  const [h1, h2, h3] = himalayasContractFixture;
  assert.ok(h1 && h2 && h3);
  await runHimalayasImport({
    transport: async () => ({ status: "ok" as const, jobs: [{ ...h1, excerpt: null }], nextCursor: null }),
    persistence, policy: enabledPolicy, now: "2026-09-25T12:00:00.000Z",
  });
  const rows = await pool.query<{ id: string; excerpt: string }>(
    "SELECT id, excerpt FROM job_snapshots WHERE source_id = 'himalayas' ORDER BY id");
  assert.deepEqual(rows.rows.map(row => [row.id, row.excerpt]), [
    ["himalayas:jobs-fixture-h-001", ""],
    ["himalayas:jobs-fixture-h-002", h2.excerpt],
    ["himalayas:jobs-fixture-h-003", h3.excerpt],
  ]);
});

test("remote_first_jobs rows share the snapshot tables after 0025; the catalog shows only the confirmed remote one (S1-006)", async () => {
  await migrate(pool);
  const { remoteFirstJobsCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runRemoteFirstJobsImport } = await import("../../src/server/import/remote-first-jobs-adapter.ts");
  const { remoteFirstJobsContractFixture } = await import("../../src/server/import/remote-first-jobs-fixture.ts");
  const { readSnapshotCards } = await import("../../src/server/snapshot-catalog-service.ts");
  const clear = async () => {
    await pool.query("DELETE FROM job_snapshots WHERE source_id = 'remote_first_jobs'");
    await pool.query("DELETE FROM import_state WHERE source_id = 'remote_first_jobs'");
  };
  await clear();
  try {
    const active = remoteFirstJobsCandidatePolicy; // approved and activated 2026-11-02
    const report = await runRemoteFirstJobsImport({
      transport: async () => ({ status: "ok" as const, jobs: [...remoteFirstJobsContractFixture], nextCursor: null }),
      persistence: createPostgresPersistence(pool, active),
      policy: active,
      now: "2026-11-02T12:00:00.000Z",
    });
    assert.equal(report.result, "partial");
    assert.equal(report.recordsMapped, 3);
    const rows = await pool.query<{ id: string; excerpt: string }>(
      "SELECT id, excerpt FROM job_snapshots WHERE source_id = 'remote_first_jobs' ORDER BY id");
    assert.deepEqual(rows.rows.map(row => row.id), [
      "remote_first_jobs:account-manager-synthetic-fixture-900102",
      "remote_first_jobs:data-analyst-synthetic-fixture-900103",
      "remote_first_jobs:platform-engineer-synthetic-fixture-900101",
    ]);
    assert.ok(rows.rows.every(row => row.excerpt.length > 0));
    // With the policy as committed, the catalog shows the confirmed remote posting with
    // its attribution and listing link; the hybrid one and the silent one stay out.
    const catalog = await readSnapshotCards({ pool });
    assert.equal(catalog.unavailable, false);
    const cards = catalog.cards.filter(card => card.id.startsWith("remote_first_jobs:"));
    assert.deepEqual(cards.map(card => card.id), ["remote_first_jobs:platform-engineer-synthetic-fixture-900101"]);
    assert.equal(cards[0]!.source.displayName, "Remote First Jobs");
    assert.equal(cards[0]!.source.backlinkRequired, true);
    assert.equal(cards[0]!.apply.url, remoteFirstJobsContractFixture[0]!.url);
    // Rollback: the same rows, the policy disabled, no card.
    const { policyPublishes } = await import("../../src/domain/snapshot-projection.ts");
    assert.equal(policyPublishes({ ...active, enabled: false }, "2026-11-02T12:00:00.000Z"), false);
  } finally {
    await clear();
  }
});

test("remotejobs_org rows share the snapshot tables after 0028; the catalog shows only the confirmed remote one, credited; a 429's wait persists (S1-007)", async () => {
  await migrate(pool);
  const { remoteJobsOrgCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runRemoteJobsOrgImport } = await import("../../src/server/import/remotejobs-org-adapter.ts");
  const { remoteJobsOrgContractFixture } = await import("../../src/server/import/remotejobs-org-fixture.ts");
  const { readSnapshotCards } = await import("../../src/server/snapshot-catalog-service.ts");
  const clear = async () => {
    await pool.query("DELETE FROM job_snapshots WHERE source_id = 'remotejobs_org'");
    await pool.query("DELETE FROM import_state WHERE source_id = 'remotejobs_org'");
  };
  await clear();
  try {
    // Rollback: the committed policy switched off refuses before any request.
    const active = remoteJobsOrgCandidatePolicy; // approved and activated 2026-11-07
    const off = { ...active, enabled: false };
    let asked = 0;
    const refused = await runRemoteJobsOrgImport({
      transport: async () => { asked += 1; return { status: "ok" as const, jobs: [], hasMore: false }; },
      persistence: createPostgresPersistence(pool, off), policy: off, now: "2026-11-07T12:00:00.000Z",
    });
    assert.equal(refused.result, "refused_disabled");
    assert.equal(asked, 0);
    assert.equal(await createPostgresPersistence(pool, off).loadImportState(), null);

    const persistence = createPostgresPersistence(pool, active);
    const now = "2026-11-07T12:00:00.000Z";
    const report = await runRemoteJobsOrgImport({
      transport: async () => ({ status: "ok" as const, jobs: [...remoteJobsOrgContractFixture], hasMore: false }),
      persistence, policy: active, now,
    });
    assert.equal(report.result, "partial");
    assert.equal(report.recordsMapped, 3);
    const rows = await pool.query<{ id: string; excerpt: string }>(
      "SELECT id, excerpt FROM job_snapshots WHERE source_id = 'remotejobs_org' ORDER BY id");
    assert.deepEqual(rows.rows.map(row => row.id), remoteJobsOrgContractFixture.map(raw => `remotejobs_org:${raw.id}`).sort());
    assert.ok(rows.rows.every(row => row.excerpt.length > 0));
    // With the policy as committed, the catalog shows the confirmed remote posting with its
    // attribution, the credit line and the listing link; the hybrid one and the one for
    // review stay out.
    const catalog = await readSnapshotCards({ pool });
    assert.equal(catalog.unavailable, false);
    const cards = catalog.cards.filter(card => card.id.startsWith("remotejobs_org:"));
    assert.deepEqual(cards.map(card => card.id), [`remotejobs_org:${remoteJobsOrgContractFixture[0]!.id}`]);
    assert.equal(cards[0]!.source.displayName, "RemoteJobs.org");
    assert.equal(cards[0]!.source.backlinkRequired, true);
    assert.deepEqual(cards[0]!.source.creditLine, { text: "Powered by RemoteJobs.org", url: "https://remotejobs.org" });
    assert.equal(cards[0]!.apply.url, remoteJobsOrgContractFixture[0]!.url);
    // Rollback: the same rows, the policy disabled, no card.
    const { policyPublishes } = await import("../../src/domain/snapshot-projection.ts");
    assert.equal(policyPublishes(off, now), false);

    // A 429 on the next run's first page stores its wait; the window stays unused.
    const later = "2026-11-07T18:30:00.000Z";
    const limited = await runRemoteJobsOrgImport({
      transport: async () => ({ status: "rate_limited" as const, retryAfterSeconds: 900 }),
      persistence, policy: active, now: later,
    });
    assert.equal(limited.result, "retry_scheduled");
    const state = await persistence.loadImportState();
    assert.equal(state?.retryNotBefore, "2026-11-07T18:45:00.000Z");
    assert.equal(state?.lastRunAt, now);
    // The owner's resume lifts it (worker --resume), as a clean run does.
    await persistence.resumeAttempts();
    assert.equal((await persistence.loadImportState())?.retryNotBefore, null);
    await runRemoteJobsOrgImport({
      transport: async () => ({ status: "rate_limited" as const, retryAfterSeconds: 900 }),
      persistence, policy: active, now: "2026-11-07T18:31:00.000Z",
    });
    assert.equal((await persistence.loadImportState())?.retryNotBefore, "2026-11-07T18:46:00.000Z");
    // A clean run clears it.
    await runRemoteJobsOrgImport({
      transport: async () => ({ status: "ok" as const, jobs: [], hasMore: false }),
      persistence, policy: active, now: "2026-11-07T18:46:00.000Z",
    });
    assert.equal((await persistence.loadImportState())?.retryNotBefore, null);
  } finally {
    await clear();
  }
});

test("the /jobs query searches only the text an external card shows (B60)", async () => {
  await migrate(pool);
  const { jobicyCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runJobicyImport } = await import("../../src/server/import/jobicy-adapter.ts");
  const { jobicyContractFixture } = await import("../../src/server/import/jobicy-fixture.ts");
  const { readSnapshotCards } = await import("../../src/server/snapshot-catalog-service.ts");
  const { searchCards } = await import("../../src/domain/catalog-search.ts");
  const clear = async () => {
    await pool.query("DELETE FROM job_snapshots");
    await pool.query("DELETE FROM import_state WHERE source_id IN ('himalayas', 'jobicy')");
  };
  await clear();
  try {
    // Both committed policies publish; the two fixtures carry the same Northwind posting.
    const now = "2026-11-02T12:00:00.000Z";
    await runHimalayasImport({
      transport: fullPage, persistence: createPostgresPersistence(pool, himalayasCandidatePolicy),
      policy: himalayasCandidatePolicy, now,
    });
    await runJobicyImport({
      transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
      persistence: createPostgresPersistence(pool, jobicyCandidatePolicy),
      policy: jobicyCandidatePolicy, now,
    });
    const catalog = await readSnapshotCards({ pool });
    assert.equal(catalog.unavailable, false);
    const found = (q: string) => searchCards(catalog.cards, q).map(card => card.id).sort();
    const northwind = catalog.cards.filter(card => card.company === "Northwind Fixtures");
    assert.equal(northwind.length, 1, "the syndicated posting is one card");
    assert.deepEqual(northwind[0]!.alsoListedAt.map(listing => listing.sourceId), ["jobicy"]);
    const cobalt = catalog.cards.filter(card => card.company === "Cobalt Fixtures").map(card => card.id).sort();

    assert.deepEqual(found("platform engineer"), [northwind[0]!.id]); // title
    assert.deepEqual(found("cobalt"), cobalt); // company
    assert.deepEqual(found("DE/NL"), ["himalayas:jobs-fixture-h-002"]); // excerpt
    // The full text is stored but not published: a word only it holds finds nothing.
    assert.deepEqual(found("asynchronously"), []);
    assert.deepEqual(found("netherlands"), []);
    // A posting outside the main catalog is not searched, even by its own title.
    assert.deepEqual(found("office-leaning"), []);
    assert.deepEqual(found("harbor"), []);
    // The copy that is not the card's primary record is not searched either: its excerpt
    // says "worldwide", the card shows the Himalayas excerpt.
    assert.equal(northwind[0]!.excerpt.includes("worldwide"), false);
    assert.deepEqual(found("worldwide"), []);
  } finally {
    await clear();
  }
});

test("jobicy rows share the snapshot tables after migration 0004", async () => {
  await migrate(pool);
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'jobicy'");
  await pool.query("DELETE FROM import_state WHERE source_id = 'jobicy'");
  const { jobicyCandidatePolicy } = await import("../../src/server/source-policies.ts");
  const { runJobicyImport } = await import("../../src/server/import/jobicy-adapter.ts");
  const { jobicyContractFixture } = await import("../../src/server/import/jobicy-fixture.ts");
  const jobicyEnabled = { ...jobicyCandidatePolicy, enabled: true };
  const report = await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] }),
    persistence: createPostgresPersistence(pool, jobicyEnabled),
    policy: jobicyEnabled,
    now: "2026-09-25T12:00:00.000Z",
  });
  assert.equal(report.result, "partial");
  assert.equal(report.recordsMapped, 3);
  const rows = await pool.query<{ source_id: string; excerpt: string }>(
    "SELECT source_id, excerpt FROM job_snapshots WHERE source_id = 'jobicy' ORDER BY id");
  assert.equal(rows.rowCount, 3);
  assert.ok(rows.rows.every(row => typeof row.excerpt === "string"));
  // Foreign sources are still rejected by the named constraint.
  await assert.rejects(pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, 'remotive', 'x', now(), $2::jsonb)",
    ["foreign-2", JSON.stringify({ kind: "job_snapshot", id: "foreign-2" })],
  ));
});
