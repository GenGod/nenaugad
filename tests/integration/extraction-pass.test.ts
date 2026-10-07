import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import { BudgetError, cancelOperation, ensureBudget, GLOBAL_BUDGET_ID } from "../../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId } from "../../src/server/ai/provider.ts";
import {
  EXTRACTOR_OWNER_ID, failureCode, holdHint, runExtractionPass, runExtractionPassAfterImport,
} from "../../src/server/ai/extraction-pass.ts";
import { extractPostingFields, extractionKey } from "../../src/server/ai/extraction-service.ts";
import { executeGuardedOperation, type ModelTransport } from "../../src/server/ai/gateway.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

// C1 wiring: the pass the worker and the import scripts call. The transport is a
// labelled mock; the numbers say nothing about model quality, only about the
// loop's rules: the switch, the budget refusal, tombstones, the limit, and the
// stored record answering repeats.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-10-04T12:00:00.000Z";
/** Past the ledger's 120 s operation deadline: a later worker tick. */
const LATER = "2026-10-04T12:10:00.000Z";
test.after(async () => { await pool.end(); });

const POSTING_TEXT = `Backend Engineer (Remote)

Requirements: must have Python.
We offer 80000 - 95000 EUR per year.`;
const VALID_OUTPUT = JSON.stringify({
  requirements: [{ category: "skill", strength: "must", value: "Python", evidence: "must have Python" }],
  compensation: { originalText: "80000 - 95000 EUR", evidence: "We offer 80000 - 95000 EUR per year" },
});

function transportReturning(output: string): ModelTransport {
  return { async dispatchOnce() { return { kind: "result" as const, actualMinor: 90n, output }; } };
}

function countingTransport(output: string): { transport: ModelTransport; calls: () => number } {
  let calls = 0;
  return {
    transport: { async dispatchOnce() { calls += 1; return { kind: "result" as const, actualMinor: 90n, output }; } },
    calls: () => calls,
  };
}

const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };

/** Extraction operations for this file's himalayas postings (`himalayas:extp-*`). */
async function extractionOperations(): Promise<number> {
  const ops = await pool.query("SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key LIKE 'extraction:himalayas:extp-%'");
  return (ops.rows[0] as { n: number }).n;
}

function snapshotWith(base: JobSnapshot, id: string): JobSnapshot {
  return {
    ...base, id, source_record_id: id, title: "Backend Engineer (Remote)",
    company_name: "Meridian Labs", source_url: `https://example.invalid/jobs/${id}`,
    apply_url: null, description_text: POSTING_TEXT,
  };
}

async function provisionExtractorBudget(): Promise<void> {
  await pool.query("DELETE FROM ai_budgets");
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: 10_000n });
  await ensureBudget({ pool, budgetId: ownerBudgetId(EXTRACTOR_OWNER_ID), scope: "owner",
    ownerId: EXTRACTOR_OWNER_ID, period: "monthly", approvedLimitMinor: GPT6_LUNA.ownerMonthlyQuotaMicroCents });
}

async function insertSnapshot(sourceId: string, snapshot: JobSnapshot): Promise<void> {
  await pool.query(
    "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, snapshot) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [snapshot.id, sourceId, `hash-${snapshot.id}`, NOW, JSON.stringify(snapshot)]);
}

async function cleanup(): Promise<void> {
  await pool.query("DELETE FROM ai_operations WHERE idempotency_key LIKE 'extraction:%'");
  await pool.query("DELETE FROM job_llm_fields");
  await pool.query("DELETE FROM job_snapshots WHERE id LIKE 'himalayas:extp-%' OR id LIKE 'jobicy:extp-%'");
}

async function seedTwoSnapshots(): Promise<{ pre: JobSnapshot; fresh: JobSnapshot }> {
  await migrate(pool);
  await cleanup();
  // The pass reads every himalayas posting, so the two seeded here must be the only
  // ones: another file's rows (the contract fixtures, say) would be extracted and paid
  // for too, and the counts below would depend on which file ran before this one.
  await pool.query("DELETE FROM job_snapshots WHERE source_id = 'himalayas'");
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const pre = snapshotWith(template, "himalayas:extp-pre");
  const fresh = snapshotWith(template, "himalayas:extp-fresh");
  await insertSnapshot("himalayas", pre);
  await insertSnapshot("himalayas", fresh);
  return { pre, fresh };
}

test("the pass with the owner's switch off touches nothing and says so", async () => {
  await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  delete process.env.LIVE_AI_ENABLED;
  try {
    const pass = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: NOW });
    assert.equal(pass.outcome, "live_ai_disabled");
    assert.equal(pass.results.length, 0);
    const ops = await pool.query("SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key LIKE 'extraction:%'");
    assert.equal((ops.rows[0] as { n: number }).n, 0);
  } finally {
    if (previous !== undefined) process.env.LIVE_AI_ENABLED = previous;
  }
  await cleanup();
});

test("the pass extracts only what is missing, skips tombstones, and honours the limit", async () => {
  const { pre, fresh } = await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    // The first posting already has a record from an earlier run: the pass must
    // answer it from the row instead of paying again.
    const first = await extractPostingFields({
      pool, ownerId: EXTRACTOR_OWNER_ID, sourceId: "himalayas", snapshot: pre,
      transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(first.status, "extracted");

    const pass = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(pass.outcome, "ran");
    assert.equal(pass.counts.already_extracted, 1);
    assert.equal(pass.counts.extracted, 1);
    assert.equal(pass.settledMicroCents, 90n);

    // A second full pass pays nothing: both records are stored now.
    const again = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(again.counts.already_extracted, 2);
    assert.equal(again.settledMicroCents, 0n, "stored records must not cost anything");

    // The limit caps one pass without caring which rows the database returns
    // first: one row is processed, at most one call's worth is settled.
    const capped = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW, limit: 1,
    });
    assert.equal(capped.outcome, "ran");
    assert.equal(capped.results.length, 1);
    assert.ok(capped.settledMicroCents <= 90n);

    // Simulate retention's real path (RET-001): last_seen moves past the policy
    // window and the persistence tombstones the row — prose blanked, lifecycle
    // set. The pass must skip it: there is nothing left to extract.
    await pool.query(
      "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', '\"2020-01-01T00:00:00.000Z\"') WHERE id = $1",
      [fresh.id]);
    const persistence = createPostgresPersistence(pool, { ...himalayasCandidatePolicy, enabled: true });
    assert.equal(await persistence.tombstoneExpired(NOW), 1);
    const withTombstone = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(withTombstone.counts.tombstoned_skipped, 1);
    assert.equal(withTombstone.settledMicroCents, 0n);
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("the pass refuses on an expired source policy and on a missing extractor budget", async () => {
  await migrate(pool);
  await cleanup();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    const expired = await runExtractionPass({
      pool, sourceId: "jobicy", transport: transportReturning(VALID_OUTPUT),
      now: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(expired.outcome, "no_permission");
    assert.equal(expired.results.length, 0);

    const unknown = await runExtractionPass({
      pool, sourceId: "not-a-source", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(unknown.outcome, "unknown_source");

    // Without the extractor's budget row the ledger refuses — and the pass stops
    // with the code instead of failing posting by posting.
    const { fresh } = await seedTwoSnapshots();
    assert.ok(fresh);
    await pool.query("DELETE FROM ai_budgets");
    await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: 10_000n });
    const refused = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(refused.outcome, "budget_refused");
    assert.equal(refused.code, "OWNER_BUDGET_MISSING");
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("an open hold stops the source until the owner cancels it; then only its posting is blocked (B31)", async () => {
  const { pre, fresh } = await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    // The provider times out: the transport reports uncertain billing, and the money
    // may be gone. The pass stops there and says which posting and operation.
    let uncertainCalls = 0;
    const timingOut: ModelTransport = {
      async dispatchOnce() { uncertainCalls += 1; return { kind: "uncertain" as const }; },
    };
    const first = await runExtractionPass({ pool, sourceId: "himalayas", transport: timingOut, now: NOW });
    assert.equal(first.outcome, "held");
    assert.equal(first.code, "BUDGET_UNAVAILABLE", "the gateway's code, no longer read as a budget refusal");
    assert.equal(uncertainCalls, 1);
    assert.ok(first.held);
    assert.equal(first.held.status, "uncertain");
    assert.ok([pre.id, fresh.id].includes(first.held.snapshotId));
    const heldPosting = first.held.snapshotId;
    const heldOperation = first.held.operationId;

    // Every later tick: the hold is unresolved, so nothing is sent or reserved, whichever
    // posting the database returns first.
    const later = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: LATER });
    assert.equal(later.outcome, "held");
    assert.deepEqual(later.held, {
      snapshotId: heldPosting, operationId: heldOperation, status: "uncertain",
      deadlineAt: "2026-10-04T12:02:00.000Z",
    });
    assert.equal(later.results.length, 0);
    assert.equal(await extractionOperations(), 1);
    // Uncertain billing is the owner's to settle against the provider's usage page.
    assert.match(holdHint(later.held, LATER), /npm run ai:holds/u);
    assert.match(holdHint(later.held, "2026-10-04T12:01:00.000Z"), /npm run ai:holds/u, "an uncertain call is over");

    // A call that died in flight holds money too.
    await pool.query("UPDATE ai_operations SET status = 'in_flight' WHERE id = $1", [heldOperation]);
    const inFlight = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: LATER });
    assert.equal(inFlight.outcome, "held");
    assert.ok(inFlight.held);
    assert.equal(inFlight.held.status, "in_flight");
    // Past its deadline the call is over; before it, another run may still be making
    // it, and cancelling would understate a charge about to settle.
    assert.match(holdHint(inFlight.held, LATER), /npm run ai:holds/u);
    assert.match(holdHint(inFlight.held, "2026-10-04T12:01:00.000Z"),
      /in flight until 2026-10-04T12:02:00\.000Z.*do not cancel/u);

    // The owner checks the provider's usage page and releases the hold (ai:holds --cancel).
    await cancelOperation({ pool, ownerId: EXTRACTOR_OWNER_ID, operationId: heldOperation, now: LATER });
    const counting = countingTransport(VALID_OUTPUT);
    const resolved = await runExtractionPass({ pool, sourceId: "himalayas", transport: counting.transport, now: LATER });
    assert.equal(resolved.outcome, "ran");
    assert.equal(resolved.counts.blocked, 1);
    assert.equal(resolved.counts.extracted, 1);
    assert.equal(counting.calls(), 1);
    assert.equal(resolved.settledMicroCents, 90n);
    const blocked = resolved.results.find(result => result.status === "blocked");
    assert.deepEqual(blocked, {
      snapshotId: heldPosting, status: "blocked", codes: ["IDEMPOTENCY_COLLISION"], operationStatus: "cancelled",
    });
    // No new operation for the blocked posting: its root operation's limit stands.
    assert.equal(await extractionOperations(), 2);
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("an open hold stops the source before any posting is read, even one the pass no longer reads (B31)", async () => {
  const { pre } = await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    // A call for `pre` timed out (uncertain billing), then retention tombstoned it, so
    // the loop would skip it and dispatch the next posting.
    const timingOut: ModelTransport = { async dispatchOnce() { return { kind: "uncertain" as const }; } };
    await assert.rejects(extractPostingFields({
      pool, ownerId: EXTRACTOR_OWNER_ID, sourceId: "himalayas", snapshot: pre, transport: timingOut, now: NOW,
    }), /BUDGET_UNAVAILABLE/u);
    await pool.query(
      "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{dates,last_seen_at}', '\"2020-01-01T00:00:00.000Z\"') WHERE id = $1",
      [pre.id]);
    const persistence = createPostgresPersistence(pool, { ...himalayasCandidatePolicy, enabled: true });
    assert.equal(await persistence.tombstoneExpired(NOW), 1);

    const pass = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: LATER });
    assert.equal(pass.outcome, "held");
    assert.equal(pass.held?.snapshotId, pre.id);
    assert.equal(pass.held?.status, "uncertain");
    assert.equal(pass.results.length, 0);

    // Every status that holds money stops the source, as ai:holds lists them.
    for (const status of ["in_flight", "reserved"]) {
      await pool.query("UPDATE ai_operations SET status = $2 WHERE id = $1", [pass.held?.operationId, status]);
      const again = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: LATER });
      assert.equal(again.outcome, "held", status);
      assert.equal(again.held?.status, status);
    }
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("another source's hold does not stop this source (B31)", async () => {
  await seedTwoSnapshots();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  const other = snapshotWith(template, "jobicy:extp-other");
  await insertSnapshot("jobicy", other);
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    const timingOut: ModelTransport = { async dispatchOnce() { return { kind: "uncertain" as const }; } };
    await assert.rejects(extractPostingFields({
      pool, ownerId: EXTRACTOR_OWNER_ID, sourceId: "jobicy", snapshot: other, transport: timingOut, now: NOW,
    }), /BUDGET_UNAVAILABLE/u);

    const jobicy = await runExtractionPass({ pool, sourceId: "jobicy", transport: exploding, now: LATER });
    assert.equal(jobicy.outcome, "held");
    assert.equal(jobicy.held?.snapshotId, other.id);

    // The himalayas rows are this file's own: both are extracted.
    const himalayas = await runExtractionPass({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: LATER,
    });
    assert.equal(himalayas.outcome, "ran");
    assert.equal(himalayas.counts.extracted, 2);
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("a paid call whose result was lost blocks only its own posting and is not paid again (B31)", async () => {
  const { pre } = await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    // The call was paid and settled, then the process stopped before the record was stored.
    await executeGuardedOperation({
      pool, ownerId: EXTRACTOR_OWNER_ID, purpose: "extraction", idempotencyKey: extractionKey(pre),
      worstCaseMinor: 1_000n, transport: transportReturning(VALID_OUTPUT), prompt: "lost", now: NOW,
    });
    const counting = countingTransport(VALID_OUTPUT);
    const pass = await runExtractionPass({ pool, sourceId: "himalayas", transport: counting.transport, now: LATER });
    assert.equal(pass.outcome, "ran");
    assert.equal(pass.counts.blocked, 1);
    assert.equal(pass.counts.extracted, 1);
    assert.equal(counting.calls(), 1);
    assert.deepEqual(pass.results.find(result => result.status === "blocked"), {
      snapshotId: pre.id, status: "blocked", codes: ["DEADLINE_EXPIRED"], operationStatus: "settled",
    });

    // The kill switch (a global budget of zero) stops the pass at that same posting,
    // although its operation is closed: the other posting is answered from its record,
    // so only the order of the checks decides the outcome.
    await pool.query("UPDATE ai_budgets SET approved_limit_minor = 0 WHERE id = $1", [GLOBAL_BUDGET_ID]);
    const killed = await runExtractionPass({ pool, sourceId: "himalayas", transport: exploding, now: LATER });
    assert.equal(killed.outcome, "budget_refused");
    assert.equal(killed.code, "BUDGET_EXCEEDED");
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("a posting over the per-operation ceiling is blocked, and the pass goes on (B31)", async () => {
  await seedTwoSnapshots();
  const [template] = mapHimalayasFixture(NOW);
  assert.ok(template);
  // About a million characters: the worst-case reservation passes the 1-cent ceiling.
  const huge = { ...snapshotWith(template, "himalayas:extp-huge"), description_text: `${POSTING_TEXT}${" x".repeat(500_000)}` };
  await insertSnapshot("himalayas", huge);
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    const counting = countingTransport(VALID_OUTPUT);
    const pass = await runExtractionPass({ pool, sourceId: "himalayas", transport: counting.transport, now: NOW });
    assert.equal(pass.outcome, "ran");
    assert.equal(pass.counts.blocked, 1);
    assert.equal(pass.counts.extracted, 2);
    assert.equal(counting.calls(), 2);
    assert.deepEqual(pass.results.find(result => result.status === "blocked"), {
      snapshotId: huge.id, status: "blocked", codes: ["OPERATION_CEILING_EXCEEDED"],
    });
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("after an import the pass never throws: a failure becomes a code (B31)", async () => {
  await seedTwoSnapshots();
  await provisionExtractorBudget();
  const previous = process.env.LIVE_AI_ENABLED;
  process.env.LIVE_AI_ENABLED = "true";
  try {
    // No transport: the gateway refuses at the first posting, which the pass rethrows.
    const failed = await runExtractionPassAfterImport({ pool, sourceId: "himalayas", transport: null, now: NOW });
    assert.deepEqual(failed, { sourceId: "himalayas", outcome: "error", code: "AI_PROVIDER_NOT_CONFIGURED" });

    const ran = await runExtractionPassAfterImport({
      pool, sourceId: "himalayas", transport: transportReturning(VALID_OUTPUT), now: NOW,
    });
    assert.equal(ran.outcome, "ran");
    assert.ok("counts" in ran);
    assert.equal(ran.counts.extracted, 2);
    assert.equal(ran.settledMicroCents, "180");

    // An error without a code of its own becomes a fixed code: its message could
    // quote a posting, and the worker logs what this returns.
    await pool.query("DELETE FROM job_llm_fields");
    await pool.query("DELETE FROM ai_operations WHERE idempotency_key LIKE 'extraction:%'");
    const leaking: ModelTransport = {
      async dispatchOnce() { throw new Error("Backend Engineer (Remote) at Meridian Labs"); },
    };
    const opaque = await runExtractionPassAfterImport({ pool, sourceId: "himalayas", transport: leaking, now: NOW });
    assert.deepEqual(opaque, { sourceId: "himalayas", outcome: "error", code: "EXTRACTION_FAILED" });
  } finally {
    process.env.LIVE_AI_ENABLED = previous ?? "true";
  }
  await cleanup();
});

test("a failure is printed as a code, never as its message (B33)", () => {
  // What the worker logs and what extract:fields prints when the pass fails.
  assert.equal(failureCode(new BudgetError("DEADLINE_EXPIRED")), "DEADLINE_EXPIRED");
  // A database error: its SQLSTATE is a code; its message and detail quote the data.
  const database = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505", detail: "Key (title)=(Backend Engineer (Remote) at Meridian Labs) already exists.",
  });
  assert.equal(failureCode(database), "23505");
  assert.equal(failureCode(new Error("Backend Engineer (Remote) at Meridian Labs")), "EXTRACTION_FAILED");
  // A code field that is itself text is not a code.
  assert.equal(failureCode(Object.assign(new Error("x"), { code: "Meridian Labs" })), "EXTRACTION_FAILED");
  assert.equal(failureCode("Backend Engineer"), "EXTRACTION_FAILED");
  assert.equal(failureCode(null), "EXTRACTION_FAILED");
  assert.equal(failureCode(undefined), "EXTRACTION_FAILED");
});
