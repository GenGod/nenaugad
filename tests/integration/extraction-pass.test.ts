import test from "node:test";
import assert from "node:assert/strict";
import { localPool, migrate } from "../../scripts/db.ts";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { createPostgresPersistence } from "../../src/server/storage/snapshots.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import { ensureBudget, GLOBAL_BUDGET_ID } from "../../src/server/ai/spending.ts";
import { GPT6_LUNA, ownerBudgetId } from "../../src/server/ai/provider.ts";
import { EXTRACTOR_OWNER_ID, runExtractionPass } from "../../src/server/ai/extraction-pass.ts";
import { extractPostingFields } from "../../src/server/ai/extraction-service.ts";
import type { ModelTransport } from "../../src/server/ai/gateway.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";

// C1 wiring: the pass the worker and the import scripts call. The transport is a
// labelled mock; the numbers say nothing about model quality, only about the
// loop's rules: the switch, the budget refusal, tombstones, the limit, and the
// stored record answering repeats.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
const NOW = "2026-10-04T12:00:00.000Z";
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
  await pool.query("DELETE FROM job_snapshots WHERE id LIKE 'himalayas:extp-%'");
}

async function seedTwoSnapshots(): Promise<{ pre: JobSnapshot; fresh: JobSnapshot }> {
  await migrate(pool);
  await cleanup();
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
    const exploding: ModelTransport = { async dispatchOnce() { throw new Error("MUST_NOT_BE_CALLED"); } };
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
