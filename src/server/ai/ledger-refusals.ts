// How callers read the spending ledger's refusals. Kept out of the route files so
// the classification is testable (a Next.js route file may export only its
// handlers): misreading a refusal can hide money that is still held (B37).
import { BudgetError } from "./spending.ts";

/**
 * The ledger already holds a terminal answer for this key: the chunk was settled
 * (do not charge again — the scores are in the cache) or it failed terminally
 * (the spending layer refuses a retry by design). Both mean "skip", not "error".
 */
export function isDuplicateChunk(error: unknown): boolean {
  return error instanceof BudgetError
    && (error.message === "WRONG_STATE" || error.message === "IDEMPOTENCY_COLLISION");
}

/**
 * Ledger refusals that must stop the whole run instead of being skipped. A chunk
 * whose earlier call is still uncertain stops it like the first uncertain result
 * (BUDGET_UNAVAILABLE) does: money is held for it, and it is not a duplicate (B37).
 */
export function isStopError(error: unknown): boolean {
  if (error instanceof BudgetError) {
    return error.message === "BUDGET_EXCEEDED" || error.message === "BUDGET_UNAVAILABLE"
      || error.message === "ATTEMPTS_EXHAUSTED" || error.message === "DEADLINE_EXPIRED"
      || error.message === "OPERATION_UNCERTAIN";
  }
  return error instanceof Error
    && (error.message === "AI_PROVIDER_NOT_CONFIGURED" || error.message === "AI_PURPOSE_NOT_APPROVED");
}

/**
 * A replay of a request whose call is still uncertain: nothing was sent and the
 * hold waits for reconciliation (B37). A refusal the caller can act on, not a
 * server failure.
 */
export function isUncertainReplay(error: unknown): boolean {
  return error instanceof BudgetError && error.message === "OPERATION_UNCERTAIN";
}
