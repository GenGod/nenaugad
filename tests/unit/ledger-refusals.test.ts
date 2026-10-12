import assert from "node:assert/strict";
import { test } from "node:test";
import { isDuplicateChunk, isStopError, isUncertainReplay } from "../../src/server/ai/ledger-refusals.ts";
import { BudgetError } from "../../src/server/ai/spending.ts";

// B37: a chunk whose earlier call is still uncertain holds money and has no score.
// Read as a duplicate it would be skipped as "scores are in the cache"; it must stop
// the run, like the first uncertain result does.
test("an uncertain chunk stops the relevance run and is not a duplicate", () => {
  const uncertain = new BudgetError("OPERATION_UNCERTAIN");
  assert.equal(isStopError(uncertain), true);
  assert.equal(isDuplicateChunk(uncertain), false);
  assert.equal(isStopError(new BudgetError("BUDGET_UNAVAILABLE")), true, "the first uncertain result");
});

test("the existing classification is unchanged", () => {
  for (const code of ["WRONG_STATE", "IDEMPOTENCY_COLLISION"] as const) {
    assert.equal(isDuplicateChunk(new BudgetError(code)), true, code);
    assert.equal(isStopError(new BudgetError(code)), false, code);
  }
  for (const code of ["BUDGET_EXCEEDED", "ATTEMPTS_EXHAUSTED", "DEADLINE_EXPIRED"] as const) {
    assert.equal(isStopError(new BudgetError(code)), true, code);
    assert.equal(isDuplicateChunk(new BudgetError(code)), false, code);
  }
  assert.equal(isStopError(new Error("AI_PROVIDER_NOT_CONFIGURED")), true);
  assert.equal(isStopError(new Error("AI_PURPOSE_NOT_APPROVED")), true);
  assert.equal(isStopError(new Error("socket closed")), false);
  assert.equal(isDuplicateChunk(new Error("WRONG_STATE")), false, "only the ledger's own refusal");
});

test("the letter route names an uncertain replay, and only that", () => {
  assert.equal(isUncertainReplay(new BudgetError("OPERATION_UNCERTAIN")), true);
  assert.equal(isUncertainReplay(new BudgetError("BUDGET_UNAVAILABLE")), false);
  assert.equal(isUncertainReplay(new BudgetError("WRONG_STATE")), false);
  assert.equal(isUncertainReplay(new Error("OPERATION_UNCERTAIN")), false, "only the ledger's own refusal");
});
