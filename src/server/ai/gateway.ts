// The single point where a future model call will enter the system
// (AGENTS Boundaries). Without an owner-approved provider registration this
// fails closed; the guards (worst-case reservation, persistent attempts,
// deadline, uncertain handling, commit-time revalidation, kill switch) are
// exercised through an injectable transport in tests only. SDK auto-retry
// is off by contract: the transport interface makes exactly one attempt.
import type { Pool } from "pg";
import {
  BudgetError, beginAttempt, cancelOperation, ensureBudget, getOperation,
  markUncertain, reserveBudget, settleOperation,
  GLOBAL_BUDGET_ID, type TaskType, type OperationRow,
} from "./spending.ts";

export type ModelTransport = Readonly<{
  // One dispatch. Implementations must NOT retry internally (SP 9: the
  // operation's attempt counter is the only retry budget).
  // prompt is the actual user message for the model.
  dispatchOnce(operation: OperationRow, attempt: number, prompt?: string): Promise<
    | Readonly<{ kind: "result"; actualMinor: bigint; output: string }>
    | Readonly<{ kind: "uncertain" }>
  >;
}>;

export class ProviderNotConfiguredError extends Error {
  readonly code = "AI_PROVIDER_NOT_CONFIGURED";
  constructor() { super("AI_PROVIDER_NOT_CONFIGURED"); }
}

// No provider is registered in this repository; any attempt to reach here
// without an explicit owner-supplied transport fails closed.
export async function executeGuardedOperation(params: Readonly<{
  pool: Pool;
  ownerId: string;
  taskType: TaskType;
  idempotencyKey: string;
  worstCaseMinor: bigint;
  transport: ModelTransport | null; // null = fail closed (production today)
  prompt?: string; // the actual user message for the model
  now: string;
}>): Promise<Readonly<{ output: string; settledMinor: bigint }>> {
  if (params.transport === null) throw new ProviderNotConfiguredError();

  const budget = await params.pool.query(
    "SELECT approved_limit_minor FROM ai_budgets WHERE id = $1",
    [GLOBAL_BUDGET_ID],
  );
  const globalBudget = budget.rows[0] as { approved_limit_minor: string } | undefined;
  if (!globalBudget) throw new BudgetError("BUDGET_UNAVAILABLE");
  if (BigInt(globalBudget.approved_limit_minor) === 0n) throw new BudgetError("BUDGET_EXCEEDED");

  const operation = await reserveBudget({
    pool: params.pool,
    operationId: "",
    ownerId: params.ownerId,
    taskType: params.taskType,
    idempotencyKey: params.idempotencyKey,
    worstCaseMinor: params.worstCaseMinor,
    now: params.now,
  });

  const attempt = await beginAttempt({
    pool: params.pool, ownerId: params.ownerId, operationId: operation.id,
    taskType: params.taskType, now: params.now,
  });

  // Persist the dispatch before the transport call (SP 9). After this
  // point any failure is `uncertain`, never "did not happen".
  const outcome = await params.transport.dispatchOnce(attempt, attempt.attemptCount, params.prompt);
  if (outcome.kind === "uncertain") {
    await markUncertain({ pool: params.pool, ownerId: params.ownerId,
      operationId: operation.id, now: params.now });
    throw new BudgetError("BUDGET_UNAVAILABLE"); // hold retained; never blind retry
  }
  const settled = await settleOperation({
    pool: params.pool, ownerId: params.ownerId, operationId: operation.id,
    actualMinor: outcome.actualMinor, now: params.now,
  });
  return { output: outcome.output, settledMinor: settled.settledMinor };
}

export {
  BudgetError, cancelOperation, ensureBudget, getOperation,
  markUncertain, reserveBudget, settleOperation, beginAttempt,
  GLOBAL_BUDGET_ID,
};
