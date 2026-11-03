import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId } from "../../src/server/ai/provider.ts";
import {
  extractPostingFields, extractionInputHash, extractionKey, ExtractionCallRefused,
} from "../../src/server/ai/extraction-service.ts";
import { loadExtraction } from "../../src/server/ai/extraction-store.ts";
import { tombstoneExpiredSnapshots } from "../../src/server/storage/snapshots.ts";
import { UNKNOWN_VALUE } from "../../src/domain/extraction.ts";
import type { ModelTransport } from "../../src/server/ai/gateway.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

// C1 plumbing against the real database: the guarded run, the stored record with
// its provenance, the idempotency ledger and the refusals. The transport is a
// labelled mock — no provider is touched, nothing is spent for real, and the
// numbers say nothing about model quality (only about the machinery).
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-10-04T12:00:00.000Z";
process.env.LIVE_AI_ENABLED = "true";
test.after(() => { delete process.env.LIVE_AI_ENABLED; });
test.after(async () => { await pool.end(); });

const POSTING_TEXT = `Backend Engineer (Remote)

Requirements: must have Python.
We offer 80000 - 95000 EUR per year.`;

const VALID_OUTPUT = JSON.stringify({
  requirements: [{ category: "skill", strength: "must", value: "Python", evidence: "must have Python" }],
  compensation: { originalText: "80000 - 95000 EUR", evidence: "We offer 80000 - 95000 EUR per year" },
});
const INVENTED_OUTPUT = JSON.stringify({
  requirements: [],
  compensation: { originalText: "120000 EUR", evidence: "We offer 80000 - 95000 EUR per year" },
});

function transportReturning(output: string): ModelTransport {
  return { async dispatchOnce() { return { kind: "result" as const, actualMinor: 90n, output }; } };
}

function snapshotWith(base: JobSnapshot, id: string, title: string): JobSnapshot {
  return {
    ...base, id, source_record_id: id,
    title, company_name: "Meridian Labs",
    source_url: `https://example.invalid/jobs/${id}`, apply_url: null,
    description_text: POSTING_TEXT,
  };
}

async function freshOwner(): Promise<string> {
  const owner = await registerUser(pool, `ext-${randomBytes(5).toString("hex")}@example.invalid`, "long-enough-password");
  await pool.query("DELETE FROM ai_operations WHERE owner_id = $1", [owner.id]);
  await pool.query("DELETE FROM ai_budgets");
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: 10_000n });
  await ensureBudget({ pool, budgetId: ownerBudgetId(owner.id), scope: "owner", ownerId: owner.id,
    period: "monthly", approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroUsd });
  return owner.id;
}

async function insertSnapshot(sourceId: string, snapshot: JobSnapshot): Promise<void> {
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [snapshot.id, sourceId, `hash-${snapshot.id}`, NOW, JSON.stringify(snapshot)]);
}

async function cleanup(): Promise<void> {
  // The idempotency check counts operations by KEY, and keys are owner-scoped —
  // rows from previous runs (different random owners) would inflate the count.
  // Scope the ledger cleanup to this feature's key namespace.
  await pool.query("DELETE FROM ai_operations WHERE idempotency_key LIKE 'extraction:%'");
  await pool.query("DELETE FROM job_llm_fields");
  await pool.query("DELETE FROM job_snapshots WHERE id LIKE 'himalayas:ext-%' OR id LIKE 'jobicy:ext-%'");
}

async function operationCount(key: string): Promise<number> {
  const row = await pool.query(
    "SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = $1", [key]);
  return (row.rows[0] as { n: number }).n;
}

test("extraction: a grounded answer is stored accepted with provenance, and a replay pays nothing", async () => {
  await migrate(pool);
  await cleanup();
  const ownerId = await freshOwner();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const snapshot = snapshotWith(template, "himalayas:ext-a", "Backend Engineer (Remote)");
  await insertSnapshot("himalayas", snapshot);

  let seenPrompt = "";
  const capturing: ModelTransport = {
    async dispatchOnce(_operation, _attempt, prompt) {
      seenPrompt = prompt ?? "";
      return { kind: "result" as const, actualMinor: 90n, output: VALID_OUTPUT };
    },
  };
  const outcome = await extractPostingFields({
    pool, ownerId, sourceId: "himalayas", snapshot, transport: capturing, now: NOW });
  assert.equal(outcome.status, "extracted");
  assert.ok(outcome.status === "extracted");
  assert.equal(outcome.fields.compensation.originalText, "80000 - 95000 EUR");
  // The prompt is job-only and carries the posting text and the unknown rules.
  assert.ok(seenPrompt.includes("Backend Engineer (Remote)"));
  assert.ok(seenPrompt.includes(UNKNOWN_VALUE));
  assert.ok(!seenPrompt.toLowerCase().includes("profile"));

  const stored = await loadExtraction(pool, { snapshotId: snapshot.id, inputHash: extractionInputHash(snapshot) });
  assert.ok(stored);
  assert.equal(stored.status, "accepted");
  assert.equal(stored.snapshotVersion, snapshot.version);
  assert.equal(stored.fields?.requirements[0]?.value, "Python");
  assert.equal(stored.provenance.modelVersion, GPT6_LUNA.modelId);
  assert.equal(stored.provenance.operationId.length > 0, true);

  // Provenance names a real, settled operation in the extraction bucket.
  const operation = await pool.query(
    "SELECT task_type, status FROM ai_operations WHERE id = $1", [stored.provenance.operationId]);
  assert.deepEqual(operation.rows[0], { task_type: "job_extraction", status: "settled" });

  // Replay: a transport that throws if called proves no second call happens.
  const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };
  const replay = await extractPostingFields({
    pool, ownerId, sourceId: "himalayas", snapshot, transport: exploding, now: NOW });
  assert.equal(replay.status, "already_extracted");
  assert.equal(await operationCount(extractionKey(snapshot)), 1);
  const budget = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget.rows[0] as { settled_minor: string }).settled_minor, "90");
  await cleanup();
});

test("extraction: a posting cleared by retention and listed again with the same text is extracted once more (B66)", async () => {
  await migrate(pool);
  await cleanup();
  const ownerId = await freshOwner();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const snapshot = snapshotWith(template, "himalayas:ext-relisted", "Backend Engineer (Remote)");
  await insertSnapshot("himalayas", snapshot);
  const extract = (transport: ModelTransport) =>
    extractPostingFields({ pool, ownerId, sourceId: "himalayas", snapshot, transport, now: NOW });
  assert.equal((await extract(transportReturning(VALID_OUTPUT))).status, "extracted");

  // Retention clears it: the record goes, the paid call stays in the ledger.
  await pool.query("UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', $1) WHERE id = $2",
    [JSON.stringify("2020-01-01T00:00:00.000Z"), snapshot.id]);
  await tombstoneExpiredSnapshots(pool, "himalayas", 720, NOW);
  const cleared = await pool.query("SELECT cleared_count FROM job_snapshots WHERE id = $1", [snapshot.id]);
  assert.equal(cleared.rows[0]?.cleared_count, 1);
  assert.equal(await loadExtraction(pool, { snapshotId: snapshot.id, inputHash: extractionInputHash(snapshot) }), null);

  // The source lists it again with the same text; an import revives the row in place.
  await pool.query("UPDATE job_snapshots SET tombstoned_at = NULL, snapshot = $2::jsonb WHERE id = $1",
    [snapshot.id, JSON.stringify(snapshot)]);
  assert.equal((await extract(transportReturning(VALID_OUTPUT))).status, "extracted", "one new paid call");
  assert.equal(await operationCount(extractionKey(snapshot)), 1);
  assert.equal(await operationCount(extractionKey(snapshot, 1)), 1);

  // A repeat is answered by the new record without a call.
  const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };
  assert.equal((await extract(exploding)).status, "already_extracted");
  const budget = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget.rows[0] as { settled_minor: string }).settled_minor, "180", "two calls, each paid once");

  // A refusal names the key the call was made under, for the caller's lookup of its operation.
  await pool.query("DELETE FROM job_llm_fields WHERE snapshot_id = $1", [snapshot.id]);
  await assert.rejects(extract(exploding), (error: unknown) =>
    error instanceof ExtractionCallRefused && error.idempotencyKey === extractionKey(snapshot, 1));
  await cleanup();
});

test("extraction: an invented value rejects the record, and the rejection is stored and paid honestly", async () => {
  await migrate(pool);
  await cleanup();
  const ownerId = await freshOwner();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const snapshot = snapshotWith(template, "himalayas:ext-b", "Backend Engineer (Remote)");
  await insertSnapshot("himalayas", snapshot);

  const outcome = await extractPostingFields({
    pool, ownerId, sourceId: "himalayas", snapshot, transport: transportReturning(INVENTED_OUTPUT), now: NOW,
  });
  assert.equal(outcome.status, "rejected");
  assert.ok(outcome.status === "rejected");
  assert.ok(outcome.reasons.some(reason => reason.code === "VALUE_NOT_GROUNDED"));

  const stored = await loadExtraction(pool, { snapshotId: snapshot.id, inputHash: extractionInputHash(snapshot) });
  assert.ok(stored);
  assert.equal(stored.status, "rejected");
  assert.equal(stored.fields, null);
  assert.ok((stored.rawOutput ?? "").includes("120000"));
  // The call happened and cost money — a rejection is not a free retry, and the
  // ledger says so.
  assert.ok(stored.provenance.settledMinor > 0n);
  // And a repeat is answered from the stored record, not re-paid.
  const replay = await extractPostingFields({
    pool, ownerId, sourceId: "himalayas", snapshot, transport: transportReturning(VALID_OUTPUT), now: NOW,
  });
  assert.equal(replay.status, "already_rejected");
  assert.equal(await operationCount(extractionKey(snapshot)), 1);
  await cleanup();
});

test("extraction: a new posting version with the same input is answered from the paid record (B28)", async () => {
  await migrate(pool);
  await cleanup();
  try {
    const ownerId = await freshOwner();
    const [template] = mapHimalayasFixture(NOW);
    assert.ok(template);
    const first = snapshotWith(template, "himalayas:ext-e", "Backend Engineer (Remote)");
    await insertSnapshot("himalayas", first);
    const paid = await extractPostingFields({
      pool, ownerId, sourceId: "himalayas", snapshot: first, transport: transportReturning(VALID_OUTPUT), now: NOW });
    assert.ok(paid.status === "extracted");

    // A geography-only re-map: the import gives the posting a new version, the input stays.
    const option = first.hiring_options[0]!;
    const remapped: JobSnapshot = {
      ...first, version: first.version + 1,
      hiring_options: [{ ...option, geography: { ...option.geography, scope: "restricted", allowed_countries: ["US"] } }],
    };
    const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };
    const answered = await extractPostingFields({
      pool, ownerId, sourceId: "himalayas", snapshot: remapped, transport: exploding, now: NOW });
    assert.ok(answered.status === "already_extracted");
    assert.equal(answered.provenance.operationId, paid.provenance.operationId);
    const operations = await pool.query(
      "SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key LIKE $1", ["extraction:himalayas:ext-e:%"]);
    assert.equal((operations.rows[0] as { n: number }).n, 1);
    const records = await pool.query(
      "SELECT COUNT(*)::int AS n, min(snapshot_version)::int AS paid_at FROM job_llm_fields WHERE snapshot_id = $1", [first.id]);
    assert.deepEqual(records.rows[0], { n: 1, paid_at: 1 });
    const budget = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
    assert.equal((budget.rows[0] as { settled_minor: string }).settled_minor, "90");

    // Changed text is a new input: one more paid call and its own record; the first stays.
    const rewritten: JobSnapshot = {
      ...remapped, version: remapped.version + 1,
      description_text: `${POSTING_TEXT}\nNice to have: Go.`,
    };
    const repaid = await extractPostingFields({
      pool, ownerId, sourceId: "himalayas", snapshot: rewritten, transport: transportReturning(VALID_OUTPUT), now: NOW });
    assert.equal(repaid.status, "extracted");
    assert.notEqual(extractionKey(rewritten), extractionKey(first));
    const after = await pool.query("SELECT COUNT(*)::int AS n FROM job_llm_fields WHERE snapshot_id = $1", [first.id]);
    assert.equal((after.rows[0] as { n: number }).n, 2);
    const budgetAfter = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
    assert.equal((budgetAfter.rows[0] as { settled_minor: string }).settled_minor, "180");
  } finally {
    await cleanup();
  }
});

test("extraction: an unknown source never passes, and an expired policy refuses before any call", async () => {
  await migrate(pool);
  await cleanup();
  const ownerId = await freshOwner();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };

  const unknown = snapshotWith(template, "himalayas:ext-c", "Backend Engineer");
  const refused = await extractPostingFields({
    pool, ownerId, sourceId: "not-a-source", snapshot: unknown, transport: exploding, now: NOW });
  assert.equal(refused.status, "unknown_source");

  // jobicy's policy is valid until 2026-12-23; after that the grant is expired
  // and the text must not be sent at all.
  const jobicy = snapshotWith(template, "jobicy:ext-d", "Backend Engineer");
  await insertSnapshot("jobicy", jobicy);
  const expired = await extractPostingFields({
    pool, ownerId, sourceId: "jobicy", snapshot: jobicy, transport: exploding, now: "2027-01-01T00:00:00.000Z",
  });
  assert.equal(expired.status, "no_permission");

  assert.equal(await operationCount(extractionKey(unknown)), 0);
  assert.equal(await operationCount(extractionKey(jobicy)), 0);
  const rows = await pool.query(
    "SELECT COUNT(*)::int AS n FROM job_llm_fields WHERE snapshot_id IN ($1, $2)", [unknown.id, jobicy.id]);
  assert.equal((rows.rows[0] as { n: number }).n, 0);
  await cleanup();
});
