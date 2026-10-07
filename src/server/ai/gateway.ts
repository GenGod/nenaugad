// The single point where a model call enters the system (AGENTS Boundaries):
// the approved purpose is checked here, before any money moves, and the guards
// (worst-case reservation, persistent attempts, deadline, uncertain handling,
// commit-time revalidation, kill switch) sit behind it. Without an
// owner-approved provider registration this fails closed; the guards are
// exercised through an injectable transport. SDK auto-retry is off by contract:
// the transport interface makes exactly one attempt.
import type { Pool } from "pg";
import { readConfig } from "../config.ts";
import { GPT6_LUNA, isPurposeApproved, type ApprovedPurpose } from "./provider.ts";
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

export class PurposeNotApprovedError extends Error {
  readonly code = "AI_PURPOSE_NOT_APPROVED";
  constructor() { super("AI_PURPOSE_NOT_APPROVED"); }
}

export class LiveAiDisabledError extends Error {
  readonly code = "AI_LIVE_DISABLED";
  constructor() { super("AI_LIVE_DISABLED"); }
}

/**
 * The spending bucket each approved purpose books into. The gateway derives the
 * task type from the purpose instead of accepting both, so a purpose can never
 * borrow another operation's attempt budget or mix up the two registries.
 */
export const PURPOSE_TASK_TYPE: Readonly<Record<ApprovedPurpose, TaskType>> = {
  cover_letter: "cover_letter",
  job_matching: "job_matching",
  extraction: "job_extraction",
};

/**
 * The one guarded entry point.
 *
 * `purpose` is typed as a plain string on purpose: the whitelist must be checked
 * at run time, because a purpose is data that can be revoked, not only a type.
 * The check happens before the budget is touched, so an unapproved purpose costs
 * nothing and leaves no operation row behind.
 */
export async function executeGuardedOperation(params: Readonly<{
  pool: Pool;
  ownerId: string;
  purpose: string;
  idempotencyKey: string;
  worstCaseMinor: bigint;
  transport: ModelTransport | null; // null = fail closed (production today)
  prompt?: string; // the actual user message for the model
  now: string;
}>): Promise<Readonly<{ output: string; settledMinor: bigint; operationId: string }>> {
  // The switch the owner asked for: unless LIVE_AI_ENABLED is exactly "true", no
  // provider call may spend — an API key in the environment is not approval
  // (AGENTS.md). Checked here, in the single entry point, before any money moves.
  if (!readConfig(process.env).liveAi) throw new LiveAiDisabledError();
  if (!isPurposeApproved(params.purpose)) throw new PurposeNotApprovedError();
  // The owner's per-operation ceiling, compared here because this is where the
  // provider tariff meets a reservation. It used to be printed by a seed script
  // and compared nowhere (docs/OPEN_GAPS.md A5).
  if (params.worstCaseMinor > GPT6_LUNA.operationCeilingMicroCents) {
    throw new BudgetError("OPERATION_CEILING_EXCEEDED");
  }
  if (params.transport === null) throw new ProviderNotConfiguredError();
  const taskType = PURPOSE_TASK_TYPE[params.purpose];

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
    taskType,
    idempotencyKey: params.idempotencyKey,
    worstCaseMinor: params.worstCaseMinor,
    now: params.now,
  });

  const attempt = await beginAttempt({
    pool: params.pool, ownerId: params.ownerId, operationId: operation.id,
    taskType, now: params.now,
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
  // The operation id travels out for provenance: a stored result must be able
  // to name the paid operation that produced it (job_extractions.operation_id).
  return { output: outcome.output, settledMinor: settled.settledMinor, operationId: operation.id };
}

export {
  BudgetError, cancelOperation, ensureBudget, getOperation,
  markUncertain, reserveBudget, settleOperation, beginAttempt,
  GLOBAL_BUDGET_ID,
};
