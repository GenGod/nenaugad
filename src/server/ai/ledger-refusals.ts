// How callers read the spending ledger's refusals. Kept out of the route files so
// the classification is testable (a Next.js route file may export only its
// handlers): misreading a refusal can hide money that is still held (B37).
import { BudgetError, HOLDING_STATUSES, type OperationStatus } from "./spending.ts";


/**
 * Ledger refusals that must stop the whole run instead of being skipped. A chunk
 * whose call is uncertain (its own result, or an earlier one) stops it: money is held
 * for it, and it is not a duplicate (B37, B46). BUDGET_UNAVAILABLE is a missing budget
 * row.
 * For a relevance chunk, `chunkRefusal` looks ATTEMPTS_EXHAUSTED and DEADLINE_EXPIRED up
 * before it asks this: past its deadline they name a taken key, not a run's end (B45).
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
 * A call whose billing is uncertain: its own result timed out or failed after the
 * dispatch (B46), or a replay of such a request, which sends nothing (B37). The hold
 * waits for reconciliation. A refusal the caller can act on, not a server failure, and
 * not a spent budget.
 */
export function isUncertainCall(error: unknown): boolean {
  return error instanceof BudgetError && error.message === "OPERATION_UNCERTAIN";
}

/**
 * A reservation whose attempt came past its deadline (B50): nothing was sent, and
 * its worst case stays held until the owner releases it (`npm run ai:holds --
 * --cancel=`). A refusal the caller can name, not a failed generation.
 */
export function isExpiredReservation(error: unknown): boolean {
  return error instanceof BudgetError && error.message === "DEADLINE_EXPIRED";
}

/**
 * The ledger's refusals that say only that a chunk's content-addressed key is taken.
 * Past its 120 s deadline a replay is refused `DEADLINE_EXPIRED` before the ledger
 * looks at the operation's state (and `ATTEMPTS_EXHAUSTED` likewise), so these two
 * name a taken key as well as `WRONG_STATE` and `IDEMPOTENCY_COLLISION` do.
 */
const TAKEN_KEY_CODES: ReadonlySet<string> = new Set([
  "WRONG_STATE", "IDEMPOTENCY_COLLISION", "DEADLINE_EXPIRED", "ATTEMPTS_EXHAUSTED",
]);

/**
 * What a refused relevance chunk means for the run (B45). A chunk is formed only from
 * postings without a cached score, so a taken key almost never means "the scores are
 * in the cache", as it used to be read. The chunk's own operation says what it is:
 * - `held`: money is still held for it (in flight — another run or a crash mid-call —
 *   reserved or uncertain); the run stops, as it does for an uncertain chunk;
 * - `closed`: settled with no score stored, cancelled or failed; counted and not paid
 *   for again under this key (B31's rule for extraction, per chunk here: a chunk formed
 *   differently is a new key, and is paid for);
 * - `stop`: a refusal about the run, not the key (`isStopError`), with no lookup;
 * - `failed`: anything else, with no lookup.
 */
export async function chunkRefusal(
  error: unknown, operationFor: () => Promise<Readonly<{ status: OperationStatus }> | null>,
): Promise<Readonly<{ kind: "stop" | "closed" | "failed" } | { kind: "held"; status: OperationStatus }>> {
  if (error instanceof BudgetError && TAKEN_KEY_CODES.has(error.message)) {
    const operation = await operationFor();
    return operation !== null && HOLDING_STATUSES.has(operation.status)
      ? { kind: "held", status: operation.status }
      : { kind: "closed" };
  }
  return { kind: isStopError(error) ? "stop" : "failed" };
}
