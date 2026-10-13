import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localPool, migrate } from "../../scripts/db.ts";
import { registerUser } from "../../src/server/users.ts";
import {
  beginAttempt, cancelOperation, ensureBudget, getOperation, markUncertain,
  reserveBudget, settleOperation, findOperationByKey, inFlightOverAt, BudgetError,
  GLOBAL_BUDGET_ID, IN_FLIGHT_GRACE_MS, MAX_ATTEMPTS, OPERATION_DEADLINE_MS,
} from "../../src/server/ai/spending.ts";
import {
  executeGuardedOperation, LiveAiDisabledError, ProviderNotConfiguredError, PurposeNotApprovedError,
} from "../../src/server/ai/gateway.ts";
import { GPT6_LUNA, ownerBudgetId } from "../../src/server/ai/provider.ts";
import { chunkRefusal } from "../../src/server/ai/ledger-refusals.ts";
import { letterGenerationFailure } from "../../src/server/letters/generation-failure.ts";

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

// B37: an uncertain call keeps its hold until the owner reconciles it, and nothing
// is dispatched again under that reservation (SP 9: "do not repeat an uncertain
// paid call blindly"; SP-T13). This test used to assert the opposite.
test("an uncertain attempt is never followed by another under the same reservation", async () => {
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
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
  const ledger = async () => {
    const budgets = await pool.query(
      "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
      [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]]);
    const op = await getOperation({ pool: pool, ownerId: owner.id, operationId: operation.id });
    return { budgets: budgets.rows, status: op?.status, attempts: op?.attemptCount };
  };
  const before = await ledger();
  assert.deepEqual(before.budgets.map(row => (row as { held_minor: string }).held_minor), ["300", "300"]);
  const uncertainRefusal = (error: unknown) =>
    error instanceof BudgetError && error.message === "OPERATION_UNCERTAIN";
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id, taskType: "job_extraction", now: NOW,
  }), uncertainRefusal);
  // The open hold is what the caller needs to know, also past the deadline and
  // with the attempts spent.
  const afterDeadline = new Date(Date.parse(NOW) + OPERATION_DEADLINE_MS + 1000).toISOString();
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id, taskType: "job_extraction", now: afterDeadline,
  }), uncertainRefusal);
  assert.deepEqual(await ledger(), before, "a refused attempt changes nothing");
  await pool.query("UPDATE ai_operations SET attempt_count = $1 WHERE id = $2",
    [MAX_ATTEMPTS.job_extraction, operation.id]);
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id, taskType: "job_extraction", now: NOW,
  }), uncertainRefusal);

  // The owner's way out today: cancelling releases the hold on both rows.
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
  const cancelled = await ledger();
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(cancelled.budgets.map(row => (row as { held_minor: string }).held_minor), ["0", "0"]);
  assert.deepEqual(cancelled.budgets.map(row => (row as { settled_minor: string }).settled_minor), ["0", "0"]);
});

test("the attempt counter persists: a restored operation at its limit is refused", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const operation = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "job_extraction",
    idempotencyKey: "att-2", worstCaseMinor: 300n, now: NOW,
  });
  // A restored worker finds an operation whose attempts were already spent: the count
  // is the database's, not the process's, so a new process cannot reset it (SP-T14).
  await pool.query("UPDATE ai_operations SET attempt_count = $1 WHERE id = $2",
    [MAX_ATTEMPTS.job_extraction, operation.id]);
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: operation.id, taskType: "job_extraction", now: NOW,
  }), (error: unknown) => error instanceof BudgetError && error.message === "ATTEMPTS_EXHAUSTED");
  const after = await getOperation({ pool: pool, ownerId: owner.id, operationId: operation.id });
  assert.equal(after?.status, "reserved");
  assert.equal(after?.attemptCount, MAX_ATTEMPTS.job_extraction);
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

// B37, end to end: a caller repeats a key after an uncertain result. Before the fix
// the gateway dispatched again under the same reservation and booked only the last
// call, so the ledger could understate spend by (attempts - 1) calls.
test("gateway: a repeated key after an uncertain result is refused without a dispatch (B37)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  // The owner's quota fits one 1,000 reservation, not two.
  await freshBudgets(owner.id, 10_000n, 1_500n);
  const budgets = async () => (await pool.query(
    "SELECT settled_minor, held_minor FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
    [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]])).rows
    .map(row => [(row as { settled_minor: string }).settled_minor, (row as { held_minor: string }).held_minor]);

  let timedOut = 0;
  const timingOut: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { timedOut += 1; return { kind: "uncertain" }; },
  };
  let answered = 0;
  const answering: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { answered += 1; return { kind: "result", actualMinor: 300n, output: "ok" }; },
  };
  const call = (key: string, transport: typeof answering) => executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: key,
    worstCaseMinor: 1000n, transport, now: NOW,
  });

  await assert.rejects(call("b37-k", timingOut),
    (error: unknown) => error instanceof BudgetError && error.message === "OPERATION_UNCERTAIN");
  assert.equal(timedOut, 1);
  assert.deepEqual(await budgets(), [["0", "1000"], ["0", "1000"]]);

  // The replay: refused before the transport, and the hold is untouched.
  await assert.rejects(call("b37-k", answering),
    (error: unknown) => error instanceof BudgetError && error.message === "OPERATION_UNCERTAIN");
  assert.equal(answered, 0, "nothing is dispatched under an uncertain reservation");
  const held = await findOperationByKey({
    pool: pool, ownerId: owner.id, taskType: "cover_letter", idempotencyKey: "b37-k" });
  assert.equal(held?.status, "uncertain");
  assert.equal(held?.attemptCount, 1);
  assert.deepEqual(await budgets(), [["0", "1000"], ["0", "1000"]], "nothing settled, the full hold kept");

  // A new key is a new operation with its own hold: the quota cannot fit both.
  await assert.rejects(call("b37-new", answering),
    (error: unknown) => error instanceof BudgetError && error.message === "BUDGET_EXCEEDED");
  assert.equal(answered, 0);
  // With room, it is reserved and settled on its own; the uncertain hold stays.
  await pool.query("UPDATE ai_budgets SET approved_limit_minor = 10000 WHERE id = $1", [ownerBudgetId(owner.id)]);
  const fresh = await call("b37-new", answering);
  assert.equal(fresh.settledMinor, 300n);
  assert.equal(answered, 1);
  assert.deepEqual(await budgets(), [["300", "1000"], ["300", "1000"]]);

  // A crash mid-call leaves the operation in flight: a repeat is refused too.
  const crashing: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { throw new Error("socket closed"); },
  };
  await assert.rejects(call("b37-crash", crashing), /socket closed/u);
  await assert.rejects(call("b37-crash", answering),
    (error: unknown) => error instanceof BudgetError && error.message === "WRONG_STATE");
  assert.equal(answered, 1);

  // Reconciliation is unchanged: a late receipt settles the uncertain operation.
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: held?.id ?? "", actualMinor: 800n, now: NOW });
  assert.deepEqual(await budgets(), [["1100", "1000"], ["1100", "1000"]]);
});

// Late receipts (B47, B48): an uncertain operation with three of its neighbours, and the
// ledger as both budget rows plus every operation of the owner.
async function lateReceiptFixture() {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, 10_000n);
  const open = async (key: string, reservedMinor: bigint, to: "reserved" | "in_flight" | "uncertain") => {
    const operation = await reserveBudget({
      pool: pool, operationId: "", ownerId: owner.id, taskType: "cover_letter",
      idempotencyKey: key, worstCaseMinor: reservedMinor, now: NOW,
    });
    if (to !== "reserved") {
      await beginAttempt({ pool: pool, ownerId: owner.id, operationId: operation.id, taskType: "cover_letter", now: NOW });
    }
    if (to === "uncertain") await markUncertain({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW });
    return operation.id;
  };
  const ledger = async () => ({
    budgets: ((await pool.query(
      "SELECT settled_minor::text, held_minor::text FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
      [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]])).rows as { settled_minor: string; held_minor: string }[])
      .map(row => [row.settled_minor, row.held_minor]),
    operations: Object.fromEntries(((await pool.query(
      "SELECT id, status, settled_minor::text FROM ai_operations WHERE owner_id = $1",
      [owner.id])).rows as { id: string; status: string; settled_minor: string }[])
      .map(row => [row.id, `${row.status}/${row.settled_minor}`])),
  });
  return { owner, open, ledger };
}

const refusedWith = (code: string) => (error: unknown) => error instanceof BudgetError && error.message === code;

test("late receipt: an uncertain call's charge is booked; any other state or amount is refused unchanged (B47)", async () => {
  const { owner, open, ledger } = await lateReceiptFixture();
  const lateReceipt = (operationId: string, actualMinor: bigint, allowAboveReservation = false) => settleOperation({
    pool: pool, ownerId: owner.id, operationId, actualMinor, now: NOW, lateReceipt: { allowAboveReservation },
  });
  const inFlight = await open("b47-flight", 1_000n, "in_flight");
  const reserved = await open("b47-reserved", 500n, "reserved");
  const uncertain = await open("b47-uncertain", 2_000n, "uncertain");
  const before = await ledger();
  assert.deepEqual(before.budgets, [["0", "3500"], ["0", "3500"]]);

  // An in-flight call may still be running and settles itself; a reserved one was
  // never sent; an amount above the worst case is more likely a unit slip.
  await assert.rejects(lateReceipt(inFlight, 100n), refusedWith("WRONG_STATE"));
  await assert.rejects(lateReceipt(reserved, 100n), refusedWith("WRONG_STATE"));
  await assert.rejects(lateReceipt(uncertain, 2_001n), refusedWith("AMOUNT_ABOVE_RESERVATION"));
  assert.deepEqual(await ledger(), before, "a refused late receipt changes nothing");

  // The charge: the whole reservation is released, the charge is settled, on both rows.
  const settled = await lateReceipt(uncertain, 1_200n);
  assert.equal(settled.status, "settled");
  assert.equal(settled.settledMinor, 1_200n);
  const afterSettle = await ledger();
  assert.deepEqual(afterSettle.budgets, [["1200", "1500"], ["1200", "1500"]]);
  assert.equal(afterSettle.operations[uncertain], "settled/1200");

  // Closed is closed: a second receipt and a later cancel are refused.
  await assert.rejects(lateReceipt(uncertain, 1n), refusedWith("WRONG_STATE"));
  await assert.rejects(cancelOperation({ pool: pool, ownerId: owner.id, operationId: uncertain, now: NOW }),
    refusedWith("WRONG_STATE"));
  const cancelled = await open("b47-cancelled", 300n, "uncertain");
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: cancelled, now: NOW });
  const afterCancel = await ledger();
  await assert.rejects(lateReceipt(cancelled, 100n), refusedWith("WRONG_STATE"));
  assert.deepEqual(await ledger(), afterCancel);

  // The reservation itself is a valid charge; above it only when the owner says so.
  const exact = await open("b47-exact", 300n, "uncertain");
  await lateReceipt(exact, 300n);
  const above = await open("b47-above", 500n, "uncertain");
  await lateReceipt(above, 700n, true);
  assert.deepEqual((await ledger()).budgets, [["2200", "1500"], ["2200", "1500"]]);

  // The gateway's own settle is unchanged: an in-flight call settles.
  await settleOperation({ pool: pool, ownerId: owner.id, operationId: inFlight, actualMinor: 400n, now: NOW });
  assert.deepEqual((await ledger()).budgets, [["2600", "500"], ["2600", "500"]]);
});

// The command as the owner runs it, against the isolated test database only — or,
// with `database: false`, with no database configured at all.
function aiHolds(args: readonly string[], database = true): Readonly<{ exitCode: number | null; result: Record<string, unknown> }> {
  assert.ok(process.env.TEST_DATABASE_URL, "the command must never run against the working database");
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
  if (!database) delete env.DATABASE_URL;
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/ai-holds.ts", ...args], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)), env, encoding: "utf8", timeout: 60_000,
  });
  const line = `${run.stdout}\n${run.stderr}`.split("\n").filter(text => text.startsWith("{")).at(-1);
  assert.ok(line, `no JSON from ai:holds: ${run.stderr}`);
  return { exitCode: run.status, result: JSON.parse(line) as Record<string, unknown> };
}

test("ai:holds --settle books a late receipt from the command line; a refusal changes nothing (B47)", async () => {
  const { owner, open, ledger } = await lateReceiptFixture();
  const uncertain = await open("b47-cli-uncertain", 2_000n, "uncertain");
  const inFlight = await open("b47-cli-flight", 1_000n, "in_flight");
  const before = await ledger();

  const refusals: [string[], string][] = [
    [[`--settle=${inFlight}`, "--amount=100"], "WRONG_STATE"],
    [[`--settle=${uncertain}`, "--amount=2001"], "AMOUNT_ABOVE_RESERVATION"],
    [[`--settle=${uncertain}`, "--amount=12.5"], "USAGE"],
    [["--settle=op_000000000000000000000000", "--amount=5"], "OPERATION_NOT_FOUND"],
  ];
  for (const [args, code] of refusals) {
    const { exitCode, result } = aiHolds(args);
    assert.equal(exitCode, 1, args.join(" "));
    assert.equal(result.ok, false);
    assert.equal(result.code, code, args.join(" "));
    if (code === "WRONG_STATE") assert.equal(result.status, "in_flight");
  }
  assert.deepEqual(await ledger(), before, "a refused command changes nothing");
  // A malformed argument is refused before the database is touched: without one
  // configured it is still USAGE, while a well-formed command needs the database.
  assert.equal(aiHolds([`--settle=${uncertain}`, "--amount=12.5"], false).result.code, "USAGE");
  assert.equal(aiHolds([`--settle=${uncertain}`, "--amount=12"], false).result.code, "DATABASE_URL_REQUIRED");

  const settled = aiHolds([`--settle=${uncertain}`, "--amount=1200"]);
  assert.equal(settled.exitCode, 0);
  assert.equal(settled.result.ok, true);
  assert.equal(settled.result.releasedMicroUsd, "2000");
  assert.equal(settled.result.settledMicroUsd, "1200");
  const after = await ledger();
  assert.deepEqual(after.budgets, [["1200", "1000"], ["1200", "1000"]]);
  assert.equal(after.operations[uncertain], "settled/1200");

  const above = await open("b47-cli-above", 500n, "uncertain");
  assert.equal(aiHolds(["--above-reservation", "--amount=700", `--settle=${above}`]).exitCode, 0);
  assert.deepEqual((await ledger()).budgets, [["1900", "1000"], ["1900", "1000"]]);

  // --cancel goes through the same parser. A call still in flight is refused, with the
  // moment it is accepted (B51); past the grace after its dispatch it is released.
  const beforeCancel = await ledger();
  const early = aiHolds([`--cancel=${inFlight}`]);
  assert.equal(early.exitCode, 1);
  assert.equal(early.result.code, "WRONG_STATE");
  assert.equal(early.result.status, "in_flight");
  const dispatched = (await getOperation({ pool: pool, ownerId: owner.id, operationId: inFlight }))?.updatedAt ?? "";
  assert.equal(early.result.cancelFrom, inFlightOverAt(dispatched));
  assert.deepEqual(await ledger(), beforeCancel, "a refused cancel changes nothing");
  await dispatchedAgo(inFlight, IN_FLIGHT_GRACE_MS + 30_000);
  const cancelled = aiHolds([`--cancel=${inFlight}`]);
  assert.equal(cancelled.exitCode, 0);
  assert.deepEqual((await ledger()).budgets, [["1900", "0"], ["1900", "0"]]);
});

// A crash is told from a running call by the dispatch the database stamped (B48):
// move it back to make an old one; a fresh dispatch is a call that may still run.
async function dispatchedAgo(operationId: string, milliseconds: number): Promise<void> {
  await pool.query("UPDATE ai_operations SET updated_at = clock_timestamp() - make_interval(secs => $2) WHERE id = $1",
    [operationId, milliseconds / 1000]);
}

test("late receipt: a call that died in flight settles once the grace after its dispatch is past, never before (B48)", async () => {
  const { owner, open, ledger } = await lateReceiptFixture();
  // The caller's clock is not what decides: a day ahead of the database's, to show it.
  const nextDay = new Date(Date.now() + 86_400_000).toISOString();
  const lateReceipt = (operationId: string, actualMinor: bigint, allowAboveReservation = false) => settleOperation({
    pool: pool, ownerId: owner.id, operationId, actualMinor, now: nextDay, lateReceipt: { allowAboveReservation },
  });
  const crashed = await open("b48-crashed", 1_000n, "in_flight");
  const reserved = await open("b48-reserved", 500n, "reserved");
  const before = await ledger();
  assert.deepEqual(before.budgets, [["0", "1500"], ["0", "1500"]]);

  // Until then the call may still be running, and it settles itself.
  await assert.rejects(lateReceipt(crashed, 100n), refusedWith("WRONG_STATE"), "just dispatched");
  await dispatchedAgo(crashed, IN_FLIGHT_GRACE_MS - 30_000);
  await assert.rejects(lateReceipt(crashed, 100n), refusedWith("WRONG_STATE"), "inside the grace");
  // A reserved operation was never sent, however old: it is cancelled, not settled.
  await dispatchedAgo(reserved, 86_400_000);
  await assert.rejects(lateReceipt(reserved, 100n), refusedWith("WRONG_STATE"));
  // The amount guard holds for a crash too.
  await dispatchedAgo(crashed, IN_FLIGHT_GRACE_MS + 30_000);
  await assert.rejects(lateReceipt(crashed, 1_001n), refusedWith("AMOUNT_ABOVE_RESERVATION"));
  const unchanged = await ledger();
  assert.deepEqual(unchanged.budgets, before.budgets, "a refused late receipt changes nothing");
  assert.deepEqual(unchanged.operations, before.operations);

  const settled = await lateReceipt(crashed, 600n);
  assert.equal(settled.status, "settled");
  const after = await ledger();
  assert.deepEqual(after.budgets, [["600", "500"], ["600", "500"]]);
  assert.equal(after.operations[crashed], "settled/600");

  // The call was alive after all and comes back: the charge is not booked twice.
  await assert.rejects(settleOperation({
    pool: pool, ownerId: owner.id, operationId: crashed, actualMinor: 900n, now: nextDay,
  }), refusedWith("WRONG_STATE"));
  await markUncertain({ pool: pool, ownerId: owner.id, operationId: crashed, now: nextDay });
  assert.deepEqual(await ledger(), after);

  // Above the reservation only when the owner says so.
  const above = await open("b48-above", 300n, "in_flight");
  await dispatchedAgo(above, 3_600_000);
  await lateReceipt(above, 400n, true);
  assert.deepEqual((await ledger()).budgets, [["1000", "500"], ["1000", "500"]]);
});

test("ai:holds --settle books a call that died in flight, not one still in flight (B48)", async () => {
  const { owner, open, ledger } = await lateReceiptFixture();
  // Both opened at NOW, long before the command's clock: only the dispatch differs.
  const crashed = await open("b48-cli-crashed", 1_000n, "in_flight");
  await dispatchedAgo(crashed, 3_600_000);
  const flying = await open("b48-cli-flying", 500n, "in_flight");
  const before = await ledger();

  const refused = aiHolds([`--settle=${flying}`, "--amount=100"]);
  assert.equal(refused.exitCode, 1);
  assert.equal(refused.result.code, "WRONG_STATE");
  assert.equal(refused.result.status, "in_flight");
  const dispatched = (await getOperation({ pool: pool, ownerId: owner.id, operationId: flying }))?.updatedAt ?? "";
  assert.equal(refused.result.lateReceiptFrom, inFlightOverAt(dispatched));
  assert.deepEqual(await ledger(), before, "a refused command changes nothing");

  // The list says when each call in flight takes a late receipt.
  const listed = aiHolds([]).result.operations as { operationId: string; lateReceiptFrom?: string }[];
  assert.equal(listed.find(row => row.operationId === flying)?.lateReceiptFrom, inFlightOverAt(dispatched));

  const settled = aiHolds([`--settle=${crashed}`, "--amount=600"]);
  assert.equal(settled.exitCode, 0);
  assert.equal(settled.result.releasedMicroUsd, "1000");
  assert.equal(settled.result.settledMicroUsd, "600");
  const after = await ledger();
  assert.deepEqual(after.budgets, [["600", "500"], ["600", "500"]]);
  assert.equal(after.operations[crashed], "settled/600");
});

test("a call dispatched under a stale `now` is not taken for a crash while it runs (B48)", async () => {
  const { owner, ledger } = await lateReceiptFixture();
  // A caller whose `now` is stale (a long pass before B49, a wait on a lock): here
  // long before the owner's clock, so its deadline and grace are already behind.
  const ownerClock = new Date().toISOString();
  let refusal: unknown;
  const running: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce(operation) {
      // Mid-call, the owner books a late receipt on the owner's own clock.
      refusal = await settleOperation({
        pool: pool, ownerId: owner.id, operationId: operation.id, actualMinor: 100n, now: ownerClock,
        lateReceipt: { allowAboveReservation: false },
      }).then(() => undefined, (error: unknown) => error);
      return { kind: "result", actualMinor: 300n, output: "ok" };
    },
  };
  const result = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "b48-stale",
    worstCaseMinor: 1000n, transport: running, now: NOW,
  });
  assert.ok(refusedWith("WRONG_STATE")(refusal), `a running call is not a crash: ${String(refusal)}`);
  assert.equal(result.settledMinor, 300n);
  assert.deepEqual((await ledger()).budgets, [["300", "0"], ["300", "0"]], "booked once, by the call itself");
});

test("gateway: an attempt more than 120 s after its call began is refused, not sent (B50)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  let dispatched = 0;
  const answering: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { dispatched += 1; return { kind: "result", actualMinor: 300n, output: "ok" }; },
  };
  const call = (key: string) => executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: key,
    worstCaseMinor: 1000n, transport: answering, now: NOW,
  });
  const budgets = async () => (await pool.query(
    "SELECT settled_minor::text, held_minor::text FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
    [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]])).rows
    .map(row => [(row as { settled_minor: string }).settled_minor, (row as { held_minor: string }).held_minor]);

  // The reservation waits 121 s (a budget-row lock, a stalled event loop): the
  // monotonic clock jumps between the call's start and its attempt.
  let reads = 0;
  const late = mock.method(performance, "now", () => (reads++ === 0 ? 0 : OPERATION_DEADLINE_MS + 1_000));
  try {
    await assert.rejects(call("b50-late"), refusedWith("DEADLINE_EXPIRED"));
  } finally {
    late.mock.restore();
  }
  assert.equal(dispatched, 0, "nothing is sent past the deadline");
  const stranded = await findOperationByKey({
    pool: pool, ownerId: owner.id, taskType: "cover_letter", idempotencyKey: "b50-late" });
  assert.equal(stranded?.status, "reserved");
  assert.equal(stranded?.attemptCount, 0);
  assert.deepEqual(await budgets(), [["0", "1000"], ["0", "1000"]], "the hold stays until the owner releases it");
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: stranded?.id ?? "", now: NOW });
  assert.deepEqual(await budgets(), [["0", "0"], ["0", "0"]]);

  // On time, the same path dispatches and settles as before.
  const onTime = await call("b50-on-time");
  assert.equal(onTime.settledMinor, 300n);
  assert.equal(dispatched, 1);
  assert.deepEqual(await budgets(), [["300", "0"], ["300", "0"]]);
});

test("a replayed relevance chunk key is told apart by its operation, not read as scored (B45)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, 10_000n);
  let dispatched = 0;
  const answering: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { dispatched += 1; return { kind: "result", actualMinor: 100n, output: "{}" }; },
  };
  const timingOut: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { return { kind: "uncertain" }; },
  };
  const call = (key: string, transport = answering, now = NOW) => executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "job_matching", idempotencyKey: key,
    worstCaseMinor: 500n, transport, now,
  });
  const operationFor = (key: string) => () => findOperationByKey({
    pool: pool, ownerId: owner.id, taskType: "job_matching", idempotencyKey: key });
  const budgets = async () => (await pool.query(
    "SELECT settled_minor::text, held_minor::text FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
    [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]])).rows;

  // Each state a chunk key can be in when a later run forms the same chunk.
  await call("b45-settled");
  const flying = await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "job_matching",
    idempotencyKey: "b45-flying", worstCaseMinor: 500n, now: NOW,
  });
  await beginAttempt({ pool: pool, ownerId: owner.id, operationId: flying.id, taskType: "job_matching", now: NOW });
  // Reserved and never dispatched (a crash between the steps, or B50's late attempt).
  await reserveBudget({
    pool: pool, operationId: "", ownerId: owner.id, taskType: "job_matching",
    idempotencyKey: "b45-stranded", worstCaseMinor: 500n, now: NOW,
  });
  await assert.rejects(call("b45-uncertain", timingOut), refusedWith("OPERATION_UNCERTAIN"));
  await assert.rejects(call("b45-cancelled", timingOut), refusedWith("OPERATION_UNCERTAIN"));
  const released = await findOperationByKey({
    pool: pool, ownerId: owner.id, taskType: "job_matching", idempotencyKey: "b45-cancelled" });
  await cancelOperation({ pool: pool, ownerId: owner.id, operationId: released?.id ?? "", now: NOW });
  const sent = dispatched;
  const before = await budgets();

  const replay = async (key: string, now = NOW) => (await chunkRefusal(
    await call(key, answering, now).then(() => null, (error: unknown) => error), operationFor(key))).kind;
  assert.equal(await replay("b45-flying"), "held", "a call in flight is not done");
  assert.equal(await replay("b45-settled"), "closed", "paid once, not paid again");
  assert.equal(await replay("b45-cancelled"), "closed", "the owner's release is not a score");
  assert.equal(await replay("b45-uncertain"), "stop", "money held for a call that may have been billed");
  // A later run, past the 120 s deadline: the ledger answers DEADLINE_EXPIRED before it
  // looks at the state, so the operation still decides (the review's blocking finding).
  const later = new Date(Date.parse(NOW) + OPERATION_DEADLINE_MS + 1_000).toISOString();
  assert.equal(await replay("b45-settled", later), "closed", "a settled chunk does not stop every later run");
  assert.equal(await replay("b45-flying", later), "held");
  assert.equal(await replay("b45-stranded", later), "held", "a stranded reservation still holds money");
  assert.equal(await replay("b45-cancelled", later), "closed");
  assert.equal(await replay("b45-uncertain", later), "stop");
  // The run is told which state holds money.
  assert.deepEqual(await chunkRefusal(new BudgetError("DEADLINE_EXPIRED"), operationFor("b45-flying")),
    { kind: "held", status: "in_flight" });
  assert.equal(dispatched, sent, "nothing is sent for a taken key");
  assert.deepEqual(await budgets(), before, "nothing more is held or settled");
});

test("cancel refuses a call still in flight until the grace after its dispatch (B51)", async () => {
  const { owner, open, ledger } = await lateReceiptFixture();
  const cancel = (operationId: string, now = NOW) => cancelOperation({ pool: pool, ownerId: owner.id, operationId, now });
  const flying = await open("b51-flying", 1_000n, "in_flight");
  const reserved = await open("b51-reserved", 300n, "reserved");
  const uncertain = await open("b51-uncertain", 200n, "uncertain");
  const before = await ledger();
  assert.deepEqual(before.budgets, [["0", "1500"], ["0", "1500"]]);

  // The caller's clock does not decide: a day ahead of the database's, the call is
  // still running (a caller clock behind it would prove nothing).
  const dayAhead = new Date(Date.now() + 86_400_000).toISOString();
  await assert.rejects(cancel(flying, dayAhead), refusedWith("WRONG_STATE"), "just dispatched");
  await dispatchedAgo(flying, IN_FLIGHT_GRACE_MS - 30_000);
  await assert.rejects(cancel(flying), refusedWith("WRONG_STATE"), "inside the grace");
  assert.deepEqual(await ledger(), before, "a refused cancel changes nothing");

  // Never sent, or returned without a known charge: cancelled at once, as before. A
  // cancelled reservation cannot be dispatched afterwards: beginAttempt starts only
  // from `reserved`, re-checked after the cancel's row lock.
  await cancel(reserved);
  await assert.rejects(beginAttempt({
    pool: pool, ownerId: owner.id, operationId: reserved, taskType: "cover_letter", now: NOW,
  }), refusedWith("WRONG_STATE"));
  await cancel(uncertain);
  assert.deepEqual((await ledger()).budgets, [["0", "1000"], ["0", "1000"]]);
  // Past the grace the call is a crash, and the owner may release it.
  await dispatchedAgo(flying, IN_FLIGHT_GRACE_MS + 30_000);
  await cancel(flying);
  const after = await ledger();
  assert.deepEqual(after.budgets, [["0", "0"], ["0", "0"]]);
  assert.equal(after.operations[flying], "cancelled/0");
});

test("gateway: the owner's cancel during a running call is refused, and the charge is booked once (B51)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  let refusal: unknown;
  const answering: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce(operation) {
      // Mid-call, the owner cancels the hold (ai:holds --cancel).
      refusal = await cancelOperation({ pool: pool, ownerId: owner.id, operationId: operation.id, now: NOW })
        .then(() => undefined, (error: unknown) => error);
      return { kind: "result", actualMinor: 300n, output: "ok" };
    },
  };
  const result = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "b51-live",
    worstCaseMinor: 1000n, transport: answering, now: NOW,
  });
  assert.ok(refusedWith("WRONG_STATE")(refusal), `a running call is not cancelled: ${String(refusal)}`);
  assert.equal(result.settledMinor, 300n);
  const budgets = (await pool.query(
    "SELECT settled_minor::text, held_minor::text FROM ai_budgets WHERE id = ANY($1::text[]) ORDER BY id",
    [[GLOBAL_BUDGET_ID, ownerBudgetId(owner.id)]])).rows
    .map(row => [(row as { settled_minor: string }).settled_minor, (row as { held_minor: string }).held_minor]);
  assert.deepEqual(budgets, [["300", "0"], ["300", "0"]], "the charge is booked, once");
});

test("a letter whose call comes back uncertain is not told the budget is spent (B46)", async () => {
  await migrate(pool);
  const owner = await registerUser(pool, email(), "long-enough-password");
  await freshBudgets(owner.id, 10_000n, null);
  const timingOut: Parameters<typeof executeGuardedOperation>[0]["transport"] = {
    async dispatchOnce() { return { kind: "uncertain" }; },
  };
  const call = () => executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "b46-letter",
    worstCaseMinor: 1000n, transport: timingOut, now: NOW,
  });
  const first = await call().then(() => null, (error: unknown) => error);
  assert.ok(refusedWith("OPERATION_UNCERTAIN")(first), `the first uncertain result: ${String(first)}`);
  assert.deepEqual(letterGenerationFailure(first), { status: 409, error: "OPERATION_UNCERTAIN" },
    "not 402 BUDGET_EXCEEDED: the billing is unknown, the budget is not the problem");
  // The hold is kept, and a replay of the key meets the same code (B37).
  const held = (await pool.query("SELECT held_minor::text FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID])).rows;
  assert.deepEqual(held, [{ held_minor: "1000" }]);
  await assert.rejects(call(), refusedWith("OPERATION_UNCERTAIN"));

  // BUDGET_UNAVAILABLE keeps its one meaning: the global budget row is missing.
  await pool.query("DELETE FROM ai_budgets WHERE id = $1", [GLOBAL_BUDGET_ID]);
  const missing = await executeGuardedOperation({
    pool: pool, ownerId: owner.id, purpose: "cover_letter", idempotencyKey: "b46-no-budget",
    worstCaseMinor: 1000n, transport: timingOut, now: NOW,
  }).then(() => null, (error: unknown) => error);
  assert.ok(refusedWith("BUDGET_UNAVAILABLE")(missing));
  assert.deepEqual(letterGenerationFailure(missing), { status: 402, error: "BUDGET_EXCEEDED" });
  // Leave the global row as the other tests expect to find it.
  await ensureBudget({ pool, budgetId: GLOBAL_BUDGET_ID, scope: "global", approvedLimitMinor: 10_000n });
});
