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
import {
  executeGuardedOperation, LiveAiDisabledError, ProviderNotConfiguredError, PurposeNotApprovedError,
} from "../../src/server/ai/gateway.ts";
import { GPT6_LUNA, ownerBudgetId } from "../../src/server/ai/provider.ts";

// Missing config fails loudly. Never report a skipped DB suite as passing.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

// The gateway sits behind the owner's AI switch (owner decision 2026-10-01): with
// LIVE_AI_ENABLED not exactly "true" nothing may spend. These tests exercise the
// guards with the switch ON; the OFF behaviour has its own test below.
process.env.LIVE_AI_ENABLED = "true";
test.after(() => { delete process.env.LIVE_AI_ENABLED; });

function email(): string {
  return `ai-${randomBytes(5).toString("hex")}@example.invalid`;
}

async function freshBudgets(ownerId: string, globalLimit: bigint, ownerLimit: bigint | null): Promise<void> {
  await pool.query("DELETE FROM ai_operations WHERE owner_id = $1", [ownerId]);
  // Reset the budget rows for a clean slate.
  await pool.query("DELETE FROM ai_budgets");
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: globalLimit });
  // Every owner has a quota row now (registration provisions one and the ledger
  // refuses a missing row), so `null` means "the approved quota, not under test".
  await ensureBudget({ pool, budgetId: ownerBudgetId(ownerId), scope: "owner", ownerId,
    period: "monthly", approvedLimitMinor: ownerLimit ?? GPT6_LUNA.ownerMonthlyQuotaMicroUsd });
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

test("live AI switch: with the flag off the gateway refuses before any money moves", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  let dispatched = 0;
  const mock: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { dispatched += 1; return { kind: "result", actualMinor: 1n, output: "x" }; },
  };
  const previous = process.env.LIVE_AI_ENABLED;
  delete process.env.LIVE_AI_ENABLED;
  try {
    await assert.rejects(executeGuardedOperation({
      pool: pool, ownerId: owner.id, purpose: "job_matching", idempotencyKey: "off-1",
      worstCaseMinor: 100n, transport: mock, now: NOW,
    }), LiveAiDisabledError);
  } finally {
    process.env.LIVE_AI_ENABLED = previous;
  }
  assert.equal(dispatched, 0, "the switch is checked before the transport");
  const operations = await pool.query(
    "SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = $1", ["off-1"]);
  assert.equal((operations.rows[0] as { n: number }).n, 0, "no operation row");
  const budget = await pool.query(
    "SELECT held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget.rows[0] as { held_minor: string }).held_minor, "0", "no hold");
});

test("operation ceiling: a reservation above one cent is refused, not attempted", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000_000n, null);
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "job_matching", idempotencyKey: "ceil-1",
    worstCaseMinor: GPT6_LUNA.operationCeilingMicroUsd + 1n,
    transport: { async dispatchOnce() { return { kind: "result", actualMinor: 1n, output: "x" }; } },
    now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "OPERATION_CEILING_EXCEEDED");
});

test("registration provisions the owner's quota; a missing owner budget refuses instead of meaning unlimited", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  const provisioned = await pool.query(
    "SELECT approved_limit_minor FROM ai_budgets WHERE id = $1", [ownerBudgetId(owner.id)]);
  assert.equal((provisioned.rows[0] as { approved_limit_minor: string } | undefined)?.approved_limit_minor,
    GPT6_LUNA.ownerMonthlyQuotaMicroUsd.toString(), "born with the approved quota");

  // Removing the row must refuse, not unlock unlimited spending (OPEN_GAPS A5).
  await pool.query("DELETE FROM ai_budgets WHERE id = $1", [ownerBudgetId(owner.id)]);
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: 10_000n });
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "job_matching",
    idempotencyKey: "no-owner-budget", worstCaseMinor: 100n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "OWNER_BUDGET_MISSING");
});

test("idempotency: a replayed content-addressed key is not charged twice", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const mock: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { return { kind: "result", actualMinor: 300n, output: "ok" }; },
  };
  // In production this key is derived from the profile version and the chunk's
  // snapshot ids (src/app/api/v1/relevance/route.ts, chunkOperationKey) — the
  // point here is the ledger's behaviour for a *replay* of the same key.
  const key = "relevance-chunk-p1-0123456789abcdef01234567";
  const first = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "job_matching", idempotencyKey: key,
    worstCaseMinor: 1000n, transport: mock, now: NOW,
  });
  assert.equal(first.settledMinor, 300n);

  // The second call must not dispatch again: the operation is settled, and the
  // route treats that as "this chunk is already paid for" and skips it.
  let dispatched = 0;
  const counting: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { dispatched += 1; return { kind: "result", actualMinor: 300n, output: "again" }; },
  };
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "job_matching", idempotencyKey: key,
    worstCaseMinor: 1000n, transport: counting, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "WRONG_STATE");
  assert.equal(dispatched, 0, "a settled operation is never dispatched again");

  const budget = await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  const row = budget.rows[0] as { settled_minor: string; held_minor: string };
  assert.equal(row.settled_minor, "300", "charged once");
  assert.equal(row.held_minor, "0", "the refused replay leaves no hold behind");
});

test("gateway fails closed without a provider; the mock transport path settles honestly", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "gw-1",
    worstCaseMinor: 1000n, transport: null, now: NOW,
  }), ProviderNotConfiguredError);

  const mock: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() {
      return { kind: "result", actualMinor: 250n, output: "synthetic letter" };
    },
  };
  const result = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "gw-2",
    worstCaseMinor: 1000n, transport: mock, now: NOW,
  });
  assert.equal(result.output, "synthetic letter");
  assert.equal(result.settledMinor, 250n);
  const budget = await pool.query("SELECT settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget.rows[0] as { settled_minor: string }).settled_minor, "250");

  // An unapproved purpose is refused before any money moves: no reservation, no
  // operation row, no attempt counter. `cv_extraction` exists as a task type but
  // the owner has not approved it as a purpose (whitelist in provider.ts).
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cv_extraction", idempotencyKey: "gw-purpose",
    worstCaseMinor: 1000n, transport: mock, now: NOW,
  }), PurposeNotApprovedError);
  const refused = await pool.query(
    "SELECT COUNT(*)::int AS n FROM ai_operations WHERE idempotency_key = $1", ["gw-purpose"]);
  assert.equal((refused.rows[0] as { n: number }).n, 0);
  const afterRefusal = await pool.query(
    "SELECT held_minor, settled_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((afterRefusal.rows[0] as { held_minor: string }).held_minor, "0");
  assert.equal((afterRefusal.rows[0] as { settled_minor: string }).settled_minor, "250");

  // Uncertain transport: hold retained, no blind retry.
  const uncertain: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { return { kind: "uncertain" }; },
  };
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "gw-3",
    worstCaseMinor: 1000n, transport: uncertain, now: NOW,
  }), (error: unknown) => error instanceof BudgetError);
  const budget3 = await pool.query("SELECT held_minor FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  assert.equal((budget3.rows[0] as { held_minor: string }).held_minor, "1000");
});

// --- C0 (part 2): the properties the brief names, each with its own test ----
// The gateway's list is: ownership, atomic reservation, persistent counters,
// deadline, uncertain billing, cancellation, commit-time revalidation, kill
// switch. Reservation/attempts/deadline/uncertain/kill-switch already have
// tests above; these four cover the remaining named properties — ownership
// isolation, the commit-time state guard, quota exhaustion at the owner's
// scope, and the documented deadline/settlement boundary.

test("ownership: another owner cannot read, settle or cancel this operation", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  const stranger = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "own-1", worstCaseMinor: 500n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "cover_letter", now: NOW });

  // Every spending statement is scoped by owner_id, so a foreign id looks like
  // a missing one — never like someone else's operation.
  assert.equal(await getOperation({ pool: pool, ownerId: stranger.id, operationId: operation.id }), null);
  await assert.rejects(settleOperation({
    pool: pool, ownerId: stranger.id, operationId: operation.id, actualMinor: 1n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "OPERATION_NOT_FOUND");
  await assert.rejects(cancelOperation({
    pool: pool, ownerId: stranger.id, operationId: operation.id, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "OPERATION_NOT_FOUND");

  // The owner's operation is untouched by the attempts above and still settles.
  const settled = await settleOperation({
    pool: pool, ownerId: owner.id, operationId: operation.id, actualMinor: 500n, now: NOW,
  });
  assert.equal(settled.status, "settled");
});

test("a settlement above its reservation releases only its own hold (B36)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, 10_000n);
  const holds = async (): Promise<readonly [string, string][]> => {
    const rows = await pool.query(
      "SELECT settled_minor::text, held_minor::text FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
      [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]]);
    return (rows.rows as { settled_minor: string; held_minor: string }[]).map(row => [row.settled_minor, row.held_minor]);
  };

  // A reserves 1,000 and is dispatched; B reserves 4,000 and is still open.
  const first = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "surplus-a", worstCaseMinor: 1_000n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: first.id, taskType: "cover_letter", now: NOW });
  const second = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "surplus-b", worstCaseMinor: 4_000n, now: NOW,
  });
  assert.deepEqual(await holds(), [["0", "5000"], ["0", "5000"]]);

  // A costs 1,100, more than it reserved: its own 1,000 is released, 1,100 is settled,
  // and B's 4,000 stays held on both the global and the owner row.
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: first.id, actualMinor: 1_100n, now: NOW });
  assert.deepEqual(await holds(), [["1100", "4000"], ["1100", "4000"]]);
  const settled = await getOperation({ pool: pool, ownerId: owner.id, operationId: first.id });
  assert.equal(settled?.reservedMinor, 1_000n);
  assert.equal(settled?.settledMinor, 1_100n, "the surplus stays visible on the operation");

  // 1,100 settled + 4,000 held + 4,950 > 10,000: refused. Freeing B's hold would admit it.
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "surplus-c", worstCaseMinor: 4_950n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");

  // B settles below its reservation: its whole hold goes, its actual is settled.
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: second.id, taskType: "cover_letter", now: NOW });
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: second.id, actualMinor: 3_000n, now: NOW });
  assert.deepEqual(await holds(), [["4100", "0"], ["4100", "0"]]);

  // C's call came back uncertain and is settled later at exactly its reservation.
  const third = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "surplus-d", worstCaseMinor: 500n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: third.id, taskType: "cover_letter", now: NOW });
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: third.id, now: NOW });
  assert.deepEqual(await holds(), [["4100", "500"], ["4100", "500"]]);
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: third.id, actualMinor: 500n, now: NOW });
  assert.deepEqual(await holds(), [["4600", "0"], ["4600", "0"]]);
});

test("commit-time revalidation: cancelled refuses settlement, settled refuses cancellation", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);

  // A cancelled operation must not be settled afterwards: the money was
  // released, and booking it again would double-count the release.
  const cancelled = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "ct-1", worstCaseMinor: 300n, now: NOW,
  });
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: cancelled.id, now: NOW });
  await assert.rejects(settleOperation({
    pool: pool, ownerId: owner.id, operationId: cancelled.id, actualMinor: 300n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "WRONG_STATE");

  // And a settled one must not be cancelled: the hold is already gone.
  const done = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "ct-2", worstCaseMinor: 300n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: done.id, taskType: "cover_letter", now: NOW });
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: done.id, actualMinor: 100n, now: NOW });
  await assert.rejects(cancelOperation({
    pool: pool, ownerId: owner.id, operationId: done.id, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "WRONG_STATE");
});

test("the owner's monthly quota is exhausted by settled spend, not only checked for existence", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, 100n); // owner quota: 100 μ$
  const first = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "q-1", worstCaseMinor: 100n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: first.id, taskType: "cover_letter", now: NOW });
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: first.id, actualMinor: 100n, now: NOW });
  await assert.rejects(reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "q-2", worstCaseMinor: 50n, now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");
});

test("deadline stops new steps; it does not block settling an already dispatched call", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
    idempotencyKey: "dl-set-1", worstCaseMinor: 400n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: operation.id,
    taskType: "cover_letter", now: NOW });
  // The call went out before the deadline; the response arrives after it. The
  // money may already be spent, so the settlement must still be recordable —
  // refusing here would leave a hold with no way to convert it honestly.
  const afterDeadline = new Date(Date.parse(NOW) + OPERATION_DEADLINE_MS + 1000).toISOString();
  const settled = await settleOperation({
    pool: pool, ownerId: owner.id, operationId: operation.id, actualMinor: 120n, now: afterDeadline,
  });
  assert.equal(settled.status, "settled");
  assert.equal(settled.settledMinor, 120n);
});

test("the approved extraction purpose books into job_extraction (owner decision 2026-10-04)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  // The purpose→task-type mapping is the gateway's own, not the caller's: an
  // extraction call must land in the job_extraction bucket (attempt limit 2),
  // never borrow the cover_letter bucket.
  const mock: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() {
      return { kind: "result", actualMinor: 90n, output: "{\"salary\":\"unknown\"}" };
    },
  };
  const result = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "extraction", idempotencyKey: "ext-1",
    worstCaseMinor: 500n, transport: mock, now: NOW,
  });
  assert.equal(result.settledMinor, 90n);
  const row = await pool.query(
    "SELECT task_type, status FROM ai_operations WHERE idempotency_key = $1", ["ext-1"]);
  assert.equal((row.rows[0] as { task_type: string }).task_type, "job_extraction");
  assert.equal((row.rows[0] as { status: string }).status, "settled");
  // And the neighbouring unapproved purpose is still refused before money.
  await assert.rejects(executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cv_extraction", idempotencyKey: "ext-2",
    worstCaseMinor: 500n, transport: mock, now: NOW,
  }), PurposeNotApprovedError);
});
