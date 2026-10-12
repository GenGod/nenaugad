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
// beginAttempt records the dispatch on the database's clock, right before the
// transport call, and the transport gives up after 30 s with no retry
// (openai-transport.ts). An operation still `in_flight` this long after its dispatch
// is a crash, not a running call, and takes a late receipt (B48). Ten times the
// transport's timeout: room for the settle write, a slow pool or a stalled event loop.
// Any transport the gateway dispatches through must end a call well inside it;
// tests/unit/ai-provider.test.ts keeps the ratio for the one there is.
export const IN_FLIGHT_GRACE_MS = 5 * 60_000;

/** When an `in_flight` operation's call is over for certain: its dispatch plus the grace. */
export function inFlightOverAt(dispatchedAt: string): string {
  return new Date(Date.parse(dispatchedAt) + IN_FLIGHT_GRACE_MS).toISOString();
}
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
    | "OPERATION_CEILING_EXCEEDED" | "OPERATION_UNCERTAIN" | "AMOUNT_ABOVE_RESERVATION") {
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
  /** The last transition; for `in_flight`, the dispatch on the database's clock (B48). */
  updatedAt: string;
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
      "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at FROM ai_operations WHERE owner_id = $1 AND task_type = $2 AND idempotency_key = $3 FOR UPDATE",
      [params.ownerId, params.taskType, params.idempotencyKey],
    );
    const existingRow = existing.rows[0] as Record<string, unknown> | undefined;
    if (existingRow) {
      // Same key with the same input → return the existing operation; whether it
      // may be dispatched is beginAttempt's decision (never after uncertain, B37).
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
      "INSERT INTO ai_operations (id, owner_id, task_type, idempotency_key, status, input_hash, deadline_at, reserved_minor) VALUES ($1, $2, $3, $4, 'reserved', $5, $6, $7) RETURNING id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at",
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
    updatedAt: new Date(row.updated_at as Date).toISOString(),
  };
}

// Mark a dispatch BEFORE any transport call; the attempt counter is
// persistent and never reset by a retry wrapper or a new idempotency key.
// Only a `reserved` operation starts an attempt. An `uncertain` one may already
// have been billed: dispatching again under the same reservation would book only
// the last call and understate spend (B37), so it waits for the owner to
// reconcile it: `npm run ai:holds -- --cancel=` releases the hold, and
// `--settle= --amount=` books a late receipt (B47; also for a crashed call, B48).
// The dispatch is stamped with the database's clock, not the caller's `now`: a long
// pass (the worker, extract:fields) hands every posting the time it started, so only
// the database knows when a call actually went out (B48).
export async function beginAttempt(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; taskType: TaskType; now: string;
}>): Promise<OperationRow> {
  const result = await params.pool.query(
    "UPDATE ai_operations SET status = 'in_flight', attempt_count = attempt_count + 1, updated_at = clock_timestamp() WHERE id = $2 AND owner_id = $3 AND status = 'reserved' AND attempt_count < $4 AND deadline_at > $1 RETURNING id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at",
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
    // First, because it is the fact the caller must act on: money is held
    // for a call that may have been billed, whatever the deadline or count.
    if (check.status === "uncertain") throw new BudgetError("OPERATION_UNCERTAIN");
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

// Commit-time revalidation: the locked read re-checks owner and status (a
// dispatched call settles even past its deadline). On success, the operation's
// own hold converts to the actual settled amount; a surplus over the reservation
// is booked in full and visible on the operation row, never taken from another
// operation's hold (B36).
export async function settleOperation(params: Readonly<{
  pool: Pool; ownerId: string; operationId: string; actualMinor: bigint; now: string;
  /** The owner's receipt from the provider's usage page (`npm run ai:holds -- --settle=`, B47). */
  lateReceipt?: Readonly<{ allowAboveReservation: boolean }>;
}>): Promise<OperationRow> {
  const client = await params.pool.connect();
  try {
    await client.query("BEGIN");
    const operation = await client.query(
      "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at FROM ai_operations WHERE id = $1 AND owner_id = $2 FOR UPDATE",
      [params.operationId, params.ownerId],
    );
    const row = operation.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new BudgetError("OPERATION_NOT_FOUND");
    if (row.status !== "in_flight" && row.status !== "uncertain") throw new BudgetError("WRONG_STATE");
    // Deadline expiry stops new steps, not the settlement of a dispatched call.
    const reserved = BigInt(String(row.reserved_minor));
    const actual = params.actualMinor;
    if (params.lateReceipt) {
      // An uncertain call, or one that died in flight (B48). A call that may still be
      // running settles itself — settled from outside, its own settle would fail and
      // lose the cost. Judged on the database's clock against the dispatch it stamped:
      // neither the caller's `now` nor the deadline says when the call went out.
      if (row.status === "in_flight") {
        const clock = await client.query("SELECT clock_timestamp() AS now");
        const databaseNow = new Date((clock.rows[0] as { now: Date }).now).getTime();
        const overAt = inFlightOverAt(new Date(row.updated_at as Date).toISOString());
        if (databaseNow < Date.parse(overAt)) throw new BudgetError("WRONG_STATE");
      }
      // The reservation is the worst case, so a larger typed amount is more likely a
      // unit slip than a charge; a real one is booked in full when the owner says so.
      if (actual > reserved && !params.lateReceipt.allowAboveReservation) {
        throw new BudgetError("AMOUNT_ABOVE_RESERVATION");
      }
    }

    await client.query(
      "UPDATE ai_operations SET status = 'settled', settled_minor = $1, updated_at = $2 WHERE id = $3",
      [actual.toString(), params.now, params.operationId],
    );
    // Convert the hold: release this operation's own reservation, settle what the
    // call cost. A cost above the reservation is settled in full and stays visible
    // on the row (settled_minor > reserved_minor); the budget may then sit above its
    // limit, which refuses every later reservation until the owner acts. Releasing
    // more than the reservation would free other operations' holds (B36).
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0), settled_minor = settled_minor + $2 WHERE id = $3",
      [reserved.toString(), actual.toString(), GLOBAL_BUDGET_ID],
    );
    const ownerBudgetId = `${OWNER_BUDGET_PREFIX}/${params.ownerId}`;
    await client.query(
      "UPDATE ai_budgets SET held_minor = GREATEST(held_minor - $1, 0), settled_minor = settled_minor + $2 WHERE id = $3",
      [reserved.toString(), actual.toString(), ownerBudgetId],
    );
    await client.query("COMMIT");
    return { ...toOperationRow(row), status: "settled" as const,
      settledMinor: params.actualMinor, updatedAt: params.now };
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
    "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at FROM ai_operations WHERE id = $1 AND owner_id = $2",
    [params.operationId, params.ownerId],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? toOperationRow(row) : null;
}

/**
 * The operations that still hold money: the money question is open until the
 * call settles or the owner cancels the hold (`npm run ai:holds` lists exactly
 * these statuses).
 */
export const HOLDING_STATUSES: ReadonlySet<OperationStatus> = new Set(["reserved", "in_flight", "uncertain"]);

/**
 * The operation an idempotency key names, or null. Read-only: a caller that met a
 * ledger refusal uses it to tell an operation that still holds money from one that
 * is closed (the extraction pass, B31).
 */
export async function findOperationByKey(params: Readonly<{
  pool: Pool; ownerId: string; taskType: TaskType; idempotencyKey: string;
}>): Promise<OperationRow | null> {
  const result = await params.pool.query(
    "SELECT id, owner_id, task_type, idempotency_key, status, attempt_count, input_hash, deadline_at, reserved_minor, settled_minor, updated_at FROM ai_operations WHERE owner_id = $1 AND task_type = $2 AND idempotency_key = $3",
    [params.ownerId, params.taskType, params.idempotencyKey],
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
