// What the letter-generation route answers for a refusal (B46). Kept out of the route
// file so it can be tested (a Next.js route file may export only its handlers).
import { BudgetError } from "../ai/spending.ts";
import { isExpiredReservation, isUncertainCall } from "../ai/ledger-refusals.ts";
import { LetterError } from "./service.ts";

/**
 * The status and code for a known refusal, or null for anything else (the route logs
 * a code for it and answers 502 `GENERATION_FAILED`). An uncertain call is named
 * before the budget codes: its billing is unknown, and telling the candidate the
 * budget is spent («Бюджет исчерпан») would be false (B46).
 */
export function letterGenerationFailure(error: unknown): Readonly<{ status: number; error: string }> | null {
  if (error instanceof LetterError) return { status: 500, error: error.message };
  // Not a server failure: the hold waits for reconciliation (B37, B46).
  if (isUncertainCall(error)) return { status: 409, error: "OPERATION_UNCERTAIN" };
  // The reservation came past its deadline (B50): nothing was sent, the hold waits for
  // the owner, and a replay of this request meets the same refusal.
  if (isExpiredReservation(error)) return { status: 409, error: "DEADLINE_EXPIRED" };
  if (error instanceof Error && error.message.includes("BUDGET")) return { status: 402, error: "BUDGET_EXCEEDED" };
  if (error instanceof Error && (error.message === "PERSONAL_DATA_BOUNDARY"
    || error.message === "AI_LIVE_DISABLED" || error.message === "AI_PROVIDER_NOT_CONFIGURED")) {
    return { status: 503, error: error.message };
  }
  if (error instanceof BudgetError && error.message === "ATTEMPTS_EXHAUSTED") {
    return { status: 429, error: "GENERATION_LIMIT" };
  }
  return null;
}
