import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import {
  beginAttempt, cancelOperation, ensureBudget, getOperation, markUncertain,
  reserveBudget, settleOperation, BudgetError,
  GLOBAL_BUDGET_ID, OPERATION_DEADLINE_MS,
} from "../../src/server/ai/spending.ts";
import { executeGuardedOperation, ProviderNotConfiguredError } from "../../src/server/ai/gateway.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

function email(): string {
  return `ai-${randomBytes(5).toString("hex")}@example.invalid`;
}

async function freshBudgets(ownerId: string, globalLimit: bigint, ownerLimit: bigint | null): Promise<void> {
  await pool.query("DELETE FROM ai_operations WHERE owner_id = $1", [ownerId]);
  // Reset the global budget rows for a clean slate.
  await pool.query("DELETE FROM ai_budgets");
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: globalLimit });
  if (ownerLimit !== null) {
    await ensureBudget({ pool, budgetId: `budget/owner/${ownerId}`, scope: "owner",
      ownerId, approvedLimitMinor: ownerLimit });
  }
}

const NOW = "2026-09-25T12:00:00.000Z";

test("atomic reservation: concurrent callers cannot double-spend the remainder", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  // Global budget fits exactly ONE worst-case reservation.
  await freshBudgets(owner.id, 1000n, null);
  const first = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "conc-1", worstCaseMinor: 1000n, now: NOW,
  });
  assert.equal(first.status, "reserved");
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "conc-2", worstCaseMinor: 1000n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");
  // True concurrency: two parallel reservations against a 1500 budget; only one fits.
  await freshBudgets(owner.id, 1500n, null);
  const results = await Promise.allSettled([
    reserveBudget({ pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
      idempotencyKey: "par-1", worstCaseMinor: 1000n, now: NOW }),
    reserveBudget({ pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
      idempotencyKey: "par-2", worstCaseMinor: 1000n, now: NOW }),
  ]);
  const fulfilled = results.filter(result => result.status === "fulfilled");
  const rejected = results.filter(result => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const held = await pool.query("SELECT held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((held.rows[0] as { held_minor: string }).held_minor, "1000");
});

test("idempotency: same key returns the existing operation; a different input is refused", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const first = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cv_extraction",
    idempotencyKey: "idem-1", worstCaseMinor: 500n, now: NOW,
  });
  const second = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cv_extraction",
    idempotencyKey: "idem-1", worstCaseMinor: 500n, now: NOW,
  });
  assert.equal(second.id, first.id);
  assert.equal(second.status, "reserved");
});

test("attempt counter is persistent and never reset by retries", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "job_extraction",
    idempotencyKey: "att-1", worstCaseMinor: 300n, now: NOW,
  });
  const first = await beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "job_extraction", now: NOW,
  });
  assert.equal(first.attemptCount, 1);
  // Simulate uncertain → retry (uncertain allows one more attempt).
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
  const second = await beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "job_extraction", now: NOW,
  });
  assert.equal(second.attemptCount, 2);
  // MAX_ATTEMPTS for job_extraction is 2: the third is refused.
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "job_extraction", now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "ATTEMPTS_EXHAUSTED");
});

test("deadline expiry and uncertain hold semantics", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "dl-1", worstCaseMinor: 700n, now: NOW,
  });
  const afterDeadline = new Date(Date.parse(NOW) + OPERATION_DEADLINE_MS + 1000).toISOString();
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "cover_letter", now: afterDeadline,
  }), (error: unknown) => error instanceof BudgetError && error.message === "DEADLINE_EXPIRED");

  // Uncertain keeps the hold; a new operation cannot use that money.
  const inFlight = await beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "cover_letter", now: NOW,
  });
  assert.equal(inFlight.status, "in_flight");
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "dl-2", worstCaseMinor: 9800n, now: NOW, // 700 held + 9800 > 10000
  }), (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");
});

test("settlement converts the hold; cancel releases it; the kill switch blocks everything", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "st-1", worstCaseMinor: 1000n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "cover_letter", now: NOW });
  const settled = await settleOperation({
    pool: pool, ownerId: owner.id, operationId: operation.id,
    actualMinor: 400n, now: NOW,
  });
  assert.equal(settled.status, "settled");
  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID],
  );
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  assert.equal(row.settled_minor, "400");
  assert.equal(row.held_minor, "0");

  // Cancel path: the hold is released even for a potentially-spent call.
  const op2 = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "st-2", worstCaseMinor: 500n, now: NOW,
  });
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: op2.id, now: NOW });
  const afterCancel = await getOperation({ pool: pool, ownerId: owner.id, operationId: op2.id });
  assert.equal(afterCancel?.status, "cancelled");
  const budget2 = await pool.query("SELECT held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget2.rows[0] as { held_minor: string }).held_minor, "0");

  // Kill switch: global limit 0 blocks every new reservation immediately.
  await pool.query("UPDATE ai_budgets SET approved_limit_minor = 0 WHERE id = $1", [GLOBAL_BUDGET_ID]);
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "st-3", worstCaseMinor: 1n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");
});

test("gateway fails closed without a provider; the mock transport path settles honestly", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, taskType: "cover_letter", idempotencyKey: "gw-1",
    worstCaseMinor: 1000n, transport: null, now: NOW,
  }), ProviderNotConfiguredError);

  const mock: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() {
      return { kind: "result", actualMinor: 250n, output: "synthetic letter" };
    },
  };
  const result = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, taskType: "cover_letter", idempotencyKey: "gw-2",
    worstCaseMinor: 1000n, transport: mock, now: NOW,
  });
  assert.equal(result.output, "synthetic letter");
  assert.equal(result.settledMinor, 250n);
  const budget = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget.rows[0] as { settled_minor: string }).settled_minor, "250");

  // Uncertain transport: hold retained, no blind retry.
  const uncertain: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { return { kind: "uncertain" }; },
  };
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, taskType: "cover_letter", idempotencyKey: "gw-3",
    worstCaseMinor: 1000n, transport: uncertain, now: NOW,
  }), (error: unknown) => error instanceof BudgetError);
  const budget3 = await pool.query("SELECT held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget3.rows[0] as { held_minor: string }).held_minor, "1000");
});
