// AI spending-control core (spec SP 9, AGENTS Boundaries). Money is integer
// minor units. All checks happen atomically in SQL with row locks; a failed
// database check means the operation is REFUSED, never "tried without a
// reservation". No SDK, no transport, no provider — the gateway injects a
// transport interface only in tests.
import { randomBytes, createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

// Initial per-operation caps (SP 9): upper bounds, not expected spend.
export const MAX_ATTEMPTS: Readonly<Record<string, number>> = {
  job_extraction: 2,
  cv_extraction: 2,
  cover_letter: 4,
  job_matching: 2,
};
export const OPERATION_DEADLINE_MS = 120_000;
export const GLOBAL_BUDGET_ID = "budget/global/total";
export const OWNER_BUDGET_PREFIX = "budget/owner";

export type TaskType = "job_extraction" | "cv_extraction" | "cover_letter" | "job_matching";
export type OperationStatus =
  | "pending" | "reserved" | "in_flight" | "uncertain" | "settled" | "failed" | "cancelled";

export class BudgetError extends Error {
  constructor(code:
    | "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE" | "ATTEMPTS_EXHAUSTED"
    | "DEADLINE_EXPIRED" | "OPERATION_NOT_FOUND" | "NOT_OWNER"
    | "WRONG_STATE" | "IDEMPOTENCY_COLLISION" | "OWNER_BUDGET_MISSING"
    | "OPERATION_CEILING_EXCEEDED") {
    super(code);
  }
}

export type OperationRow = Readonly<{
  id: string;
  ownerId: string;
  taskType: TaskType;
  idempotencyKey: string;
  status: OperationStatus;
  attemptCount: number;
  inputHash: string;
  deadlineAt: string;
  reservedMinor: bigint;
  settledMinor: bigint;
}>;

function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

// Atomic worst-case reservation: SELECT ... FOR UPDATE on both the global
// and the owner budget rows, then a single guarded UPDATE. Concurrent
// callers serialize on the row lock and cannot double-spend the remainder.
export async function reserveBudget(params: Readonly<{
  pool: Pool;
  operationId: string;
  ownerId: string;
  taskType: TaskType;
  idempotencyKey: string;
  worstCaseMinor: bigint;
  now: string;
}>): Promise<OperationRow> {
  const client = await params.pool.connect();
  try {
    await client.query("BEGIN");
    // Idempotency: the same key must not create or re-reserve a different operation.
    const existing = await client.query(
      "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor FROM ai_operations WHERE owner_id = $1 AND task_type = $2 AND idempotency_key = $3 FOR UPDATE",
      [params.ownerId, params.taskType, params.idempotencyKey],
    );
    const existingRow = existing.rows[0] as Record<string, unknown> | undefined;
    if (existingRow) {
      // Same key with the same input → return the existing operation; the
      // caller still cannot exceed its attempt budget on retry.
      if (existingRow.status !== "failed" && existingRow.status !== "cancelled") {
        await client.query("COMMIT");
        return toOperationRow(existingRow);
      }
      await client.query("COMMIT");
      throw new BudgetError("IDEMPOTENCY_COLLISION");
    }

    // Lock both budget rows in a deterministic order (global first) to
    // avoid deadlocks between concurrent multi-budget reservations.
    const globalLock = await client.query(
      "SELECT id, approved_limit_minor, settled_minor, held_minor FROM ai_budgets WHERE id = $1 FOR UPDATE",
      [GLOBAL_BUDGET_ID],
    );
    const globalRow = globalLock.rows[0] as
      | { approved_limit_minor: string; settled_minor: string; held_minor: string }
      | undefined;
    if (!globalRow) {
      await client.query("COMMIT");
      throw new BudgetError("BUDGET_UNAVAILABLE");
    }
    const ownerBudgetId = `${OWNER_BUDGET_PREFIX}/${params.ownerId}`;
    const ownerLock = await client.query(
      "SELECT id, approved_limit_minor, settled_minor, held_minor FROM ai_budgets WHERE id = $1 FOR UPDATE",
      [ownerBudgetId],
    );
    const ownerRow = ownerLock.rows[0] as
      | { approved_limit_minor: string; settled_minor: string; held_minor: string }
      | undefined;

    type BudgetRow = { approved_limit_minor: string; settled_minor: string; held_minor: string };
    const checkBudget = (row: BudgetRow | undefined, scope: string) => {
      // A missing owner row used to mean "no owner-specific cap yet", which made
      // the approved per-user quota unenforceable (docs/OPEN_GAPS.md A5). Missing
      // is now a refusal: the budget is provisioned when the user is created
      // (src/server/users.ts) and backfilled by scripts/seed-ai-budgets.ts.
      if (!row) throw new BudgetError(scope === "owner" ? "OWNER_BUDGET_MISSING" : "BUDGET_UNAVAILABLE");
      const settled = BigInt(row.settled_minor);
      const held = BigInt(row.held_minor);
      if (settled + held + params.worstCaseMinor > BigInt(row.approved_limit_minor)) {
        throw new BudgetError("BUDGET_EXCEEDED");
      }
    };
    checkBudget(globalRow, "global");
    checkBudget(ownerRow, "owner");

    await client.query(
      "UPDATE ai_budgets SET held_minor = held_minor + $1 WHERE id = $2",
      [params.worstCaseMinor.toString(), GLOBAL_BUDGET_ID],
    );
    await client.query(
      "UPDATE ai_budgets SET held_minor = held_minor + $1 WHERE id = $2",
      [params.worstCaseMinor.toString(), ownerBudgetId],
    );

    const id = `op_${randomBytes(12).toString("hex")}`;
    const deadline = new Date(Date.parse(params.now) + OPERATION_DEADLINE_MS).toISOString();
    const inserted = await client.query(
      "INSERT INTO ai_operations (id, owner_id, task_type, idempotency_key, status, input_hash, deadline_at, reserved_minor) VALUES ($1, $2, $3, $4, 'reserved', $5, $6, $7) RETURNING id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor",
      [id, params.ownerId, params.taskType, params.idempotencyKey,
        hashInput({ taskType: params.taskType }), deadline, params.worstCaseMinor.toString()],
    );
    await client.query("COMMIT");
    return toOperationRow(inserted.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function toOperationRow(row: Record<string, unknown>): OperationRow {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    taskType: String(row.task_type) as TaskType,
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as OperationStatus,
    attemptCount: Number(row.attempt_count),
    inputHash: String(row.input_hash),
    deadlineAt: new Date(row.deadline_at as Date).toISOString(),
    reservedMinor: BigInt(String(row.reserved_minor)),
    settledMinor: BigInt(String(row.settled_minor)),
  };
}

// Mark a dispatch BEFORE any transport call; the attempt counter is
// persistent and never reset by a retry wrapper or a new idempotency key.
export async function beginAttempt(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; taskType: TaskType; now: string;
}>): Promise<OperationRow> {
  const result = await params.pool.query(
    "UPDATE ai_operations SET status = 'in_flight', attempt_count = attempt_count + 1, updated_at = $1 WHERE id = $2 AND owner_id = $3 AND status IN ('reserved', 'uncertain') AND attempt_count < $4 AND deadline_at > $1 RETURNING id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor",
    [params.now, params.operationId, params.ownerId, MAX_ATTEMPTS[params.taskType]],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    // Distinguish exhausted attempts from deadline/not-found/wrong-owner.
    const existing = await params.pool.query(
      "SELECT status, attempt_count, deadline_at FROM ai_operations WHERE id = $1 AND owner_id = $2",
      [params.operationId, params.ownerId],
    );
    const check = existing.rows[0] as
      | { status: string; attempt_count: string; deadline_at: Date }
      | undefined;
    if (!check) throw new BudgetError("OPERATION_NOT_FOUND");
    if (new Date(check.deadline_at).getTime() <= Date.parse(params.now)) {
      throw new BudgetError("DEADLINE_EXPIRED");
    }
    if (Number(check.attempt_count) >= (MAX_ATTEMPTS[params.taskType] ?? 2)) {
      throw new BudgetError("ATTEMPTS_EXHAUSTED");
    }
    throw new BudgetError("WRONG_STATE");
  }
  return toOperationRow(row);
}

// A failure between dispatch and recording the result is `uncertain`: the
// hold stays, the money may be gone — never blindly re-dispatch.
export async function markUncertain(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; now: string;
}>): Promise<void> {
  await params.pool.query(
    "UPDATE ai_operations SET status = 'uncertain', updated_at = $1 WHERE id = $2 AND owner_id = $3 AND status = 'in_flight'",
    [params.now, params.operationId, params.ownerId],
  );
}

// Commit-time revalidation: the conditional UPDATE re-checks owner, status
// and deadline. On success, the hold converts to the actual settled amount;
// a surplus over the reservation moves the budget into an incident state
// (settled exceeds what was reserved — flagged, never hidden).
export async function settleOperation(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; actualMinor: bigint; now: string;
}>): Promise<OperationRow> {
  const client = await params.pool.connect();
  try {
    await client.query("BEGIN");
    const operation = await client.query(
      "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor FROM ai_operations WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [params.operationId, params.ownerId],
    );
    const row = operation.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new BudgetError("OPERATION_NOT_FOUND");
    if (row.status !== "in_flight" && row.status !== "uncertain") throw new BudgetError("WRONG_STATE");
    // Deadline expiry stops new steps, not the settlement of a dispatched call.
    const reserved = BigInt(String(row.reserved_minor));
    const actual = params.actualMinor;
    const globalDelta = actual > reserved ? actual : reserved;

    await client.query(
      "UPDATE ai_operations SET status = 'settled', settled_minor = $1, updated_at = $2 WHERE id = $3",
      [actual.toString(), params.now, params.operationId],
    );
    // Convert the hold: release reserved, settle actual.
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0), settled_minor = settled_minor + $2 WHERE id = $3",
      [globalDelta.toString(), actual.toString(), GLOBAL_BUDGET_ID],
    );
    const ownerBudgetId = `${OWNER_BUDGET_PREFIX}/${params.ownerId}`;
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0), settled_minor = settled_minor + $2 WHERE id = $3",
      [globalDelta.toString(), actual.toString(), ownerBudgetId],
    );
    await client.query("COMMIT");
    return { ...toOperationRow(row), status: "settled" as const,
      settledMinor: params.actualMinor };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// Cancel: stops new steps; the hold is released, but an in-flight call may
// still have cost money — that stays honest (spec: "not guaranteed refund").
export async function cancelOperation(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; now: string;
}>): Promise<void> {
  const client = await params.pool.connect();
  try {
    await client.query("BEGIN");
    const operation = await client.query(
      "SELECT id, status, reserved_minor FROM ai_operations WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [params.operationId, params.ownerId],
    );
    const row = operation.rows[0] as { status: string; reserved_minor: string } | undefined;
    if (!row) throw new BudgetError("OPERATION_NOT_FOUND");
    if (row.status === "settled" || row.status === "cancelled") throw new BudgetError("WRONG_STATE");
    const reserved = BigInt(String(row.reserved_minor));
    await client.query(
      "UPDATE ai_operations SET status = 'cancelled', updated_at = $1 WHERE id = $2",
      [params.now, params.operationId],
    );
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0) WHERE id = $2",
      [reserved.toString(), GLOBAL_BUDGET_ID],
    );
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0) WHERE id = $2",
      [reserved.toString(), `${OWNER_BUDGET_PREFIX}/${params.ownerId}`],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getOperation(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string;
}>): Promise<OperationRow | null> {
  const result = await params.pool.query(
    "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor FROM ai_operations WHERE id = $1 AND owner_id = $2",
    [params.operationId, params.ownerId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toOperationRow(row) : null;
}

export async function ensureBudget(params: Readonly<{
  pool: Pick<Pool, "query">; budgetId: string; scope: "global" | "owner";
  ownerId?: string; approvedLimitMinor: bigint; period?: "total" | "monthly" | "daily";
}>): Promise<void> {
  // `Pick<Pool, "query">` so this can run inside a caller's transaction (a PoolClient
  // has the same query method) — registration creates the user and its cap together.
  //
  // `ON CONFLICT DO NOTHING` with NO target on purpose: the unique key is
  // (scope, owner_id, period) and the global row stores owner_id = NULL, which a
  // unique index does not treat as a conflict — so a targeted ON CONFLICT let the
  // same id hit the primary key instead and threw 23505. That made "ensure, safe to
  // re-run" false for exactly the row the seed re-runs.
  await params.pool.query(
    "INSERT INTO ai_budgets (id, scope, owner_id, period, approved_limit_minor) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
    [params.budgetId, params.scope, params.ownerId ?? null, params.period ?? "total",
      params.approvedLimitMinor.toString()],
  );
}

export type { PoolClient };
