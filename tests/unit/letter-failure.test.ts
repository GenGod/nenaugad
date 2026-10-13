import assert from "node:assert/strict";
import { test } from "node:test";
import { letterGenerationFailure } from "../../src/server/letters/generation-failure.ts";
import { LetterError } from "../../src/server/letters/service.ts";
import { BudgetError } from "../../src/server/ai/spending.ts";

// B46: what the letter route answers for each refusal. An uncertain call used to reach
// the editor as 402 BUDGET_EXCEEDED («Бюджет исчерпан») when only its billing was unknown.
test("an uncertain call is 409 OPERATION_UNCERTAIN, not a spent budget (B46)", () => {
  assert.deepEqual(letterGenerationFailure(new BudgetError("OPERATION_UNCERTAIN")),
    { status: 409, error: "OPERATION_UNCERTAIN" });
});

test("the rest of the letter route's answers are unchanged", () => {
  for (const code of ["BUDGET_EXCEEDED", "BUDGET_UNAVAILABLE", "OWNER_BUDGET_MISSING"] as const) {
    assert.deepEqual(letterGenerationFailure(new BudgetError(code)), { status: 402, error: "BUDGET_EXCEEDED" }, code);
  }
  assert.deepEqual(letterGenerationFailure(new BudgetError("DEADLINE_EXPIRED")), { status: 409, error: "DEADLINE_EXPIRED" });
  assert.deepEqual(letterGenerationFailure(new BudgetError("ATTEMPTS_EXHAUSTED")), { status: 429, error: "GENERATION_LIMIT" });
  for (const code of ["PERSONAL_DATA_BOUNDARY", "AI_LIVE_DISABLED", "AI_PROVIDER_NOT_CONFIGURED"]) {
    assert.deepEqual(letterGenerationFailure(new Error(code)), { status: 503, error: code }, code);
  }
  assert.deepEqual(letterGenerationFailure(new LetterError("LETTER_NOT_FOUND")), { status: 500, error: "LETTER_NOT_FOUND" });
  // Any error naming a budget is still a budget answer; only the ledger's own
  // ATTEMPTS_EXHAUSTED is the generation limit (the old rule matched any "ATTEMPTS").
  assert.deepEqual(letterGenerationFailure(new Error("X_BUDGET_Y")), { status: 402, error: "BUDGET_EXCEEDED" });
  assert.equal(letterGenerationFailure(new Error("ATTEMPTS_EXHAUSTED")), null);
  // Anything else is the route's own: it logs a code and answers 502 GENERATION_FAILED.
  for (const error of [new Error("socket closed"), new BudgetError("WRONG_STATE"), "not an error"]) {
    assert.equal(letterGenerationFailure(error), null, String(error));
  }
});
