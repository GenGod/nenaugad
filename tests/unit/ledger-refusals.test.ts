import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkRefusal, isExpiredReservation, isStopError, isUncertainCall } from "../../src/server/ai/ledger-refusals.ts";
import { BudgetError, type OperationStatus } from "../../src/server/ai/spending.ts";

/** A lookup that answers `status`, and counts how often it was asked. */
function lookup(status: OperationStatus | null): { operationFor: () => Promise<{ status: OperationStatus } | null>; asked: () => number } {
  let asked = 0;
  return {
    operationFor: async () => { asked += 1; return status === null ? null : { status }; },
    asked: () => asked,
  };
}

// B37: a chunk whose earlier call is still uncertain holds money and has no score.
// Read as a duplicate it would be skipped as "scores are in the cache"; it must stop
// the run, like the first uncertain result does.
test("an uncertain chunk stops the relevance run", async () => {
  const uncertain = new BudgetError("OPERATION_UNCERTAIN");
  assert.equal(isStopError(uncertain), true);
  const asked = lookup("uncertain");
  assert.deepEqual(await chunkRefusal(uncertain, asked.operationFor), { kind: "stop" });
  assert.equal(asked.asked(), 0, "a stop needs no lookup");
  assert.equal(isStopError(new BudgetError("BUDGET_UNAVAILABLE")), true, "a missing global budget row");
});

test("the stop list is unchanged", () => {
  for (const code of ["WRONG_STATE", "IDEMPOTENCY_COLLISION"] as const) {
    assert.equal(isStopError(new BudgetError(code)), false, code);
  }
  for (const code of ["BUDGET_EXCEEDED", "ATTEMPTS_EXHAUSTED", "DEADLINE_EXPIRED"] as const) {
    assert.equal(isStopError(new BudgetError(code)), true, code);
  }
  assert.equal(isStopError(new Error("AI_PROVIDER_NOT_CONFIGURED")), true);
  assert.equal(isStopError(new Error("AI_PURPOSE_NOT_APPROVED")), true);
  assert.equal(isStopError(new Error("socket closed")), false);
});

// B45: a taken key says only that the chunk's operation exists. Its status says
// whether money is still held for it (stop: another run, or the owner) or it is
// closed with no score stored (counted, not paid for again).
test("a taken chunk key is told apart by its operation, not read as cached scores", async () => {
  // Past its deadline a replay is refused DEADLINE_EXPIRED before the ledger looks at
  // the state; ATTEMPTS_EXHAUSTED likewise. Both say only that the key is taken.
  for (const code of ["WRONG_STATE", "IDEMPOTENCY_COLLISION", "DEADLINE_EXPIRED", "ATTEMPTS_EXHAUSTED"] as const) {
    for (const status of ["in_flight", "reserved", "uncertain"] as const) {
      assert.deepEqual(await chunkRefusal(new BudgetError(code), lookup(status).operationFor),
        { kind: "held", status }, `${code} ${status}`);
    }
    for (const status of ["settled", "cancelled", "failed", null] as const) {
      assert.deepEqual((await chunkRefusal(new BudgetError(code), lookup(status).operationFor)).kind,
        "closed", `${code} ${status}`);
    }
  }
  // Refusals that are not about this chunk's key stop the run without a lookup.
  for (const code of ["BUDGET_EXCEEDED", "BUDGET_UNAVAILABLE", "OPERATION_UNCERTAIN"] as const) {
    const asked = lookup("settled");
    assert.deepEqual(await chunkRefusal(new BudgetError(code), asked.operationFor), { kind: "stop" }, code);
    assert.equal(asked.asked(), 0, code);
  }
  for (const error of [new Error("socket closed"), new Error("WRONG_STATE"), new BudgetError("OPERATION_NOT_FOUND")]) {
    const asked = lookup("in_flight");
    assert.deepEqual(await chunkRefusal(error, asked.operationFor), { kind: "failed" }, error.message);
    assert.equal(asked.asked(), 0, "only the ledger's own taken-key refusals are looked up");
  }
});

test("an uncertain call is named, the first result or a replay, and only that", () => {
  assert.equal(isUncertainCall(new BudgetError("OPERATION_UNCERTAIN")), true);
  assert.equal(isUncertainCall(new BudgetError("BUDGET_UNAVAILABLE")), false, "a missing budget row is not");
  assert.equal(isUncertainCall(new BudgetError("WRONG_STATE")), false);
  assert.equal(isUncertainCall(new Error("OPERATION_UNCERTAIN")), false, "only the ledger's own refusal");
});

// B50: a reservation whose attempt came past its deadline holds its worst case and
// sent nothing. The letter route names it instead of answering "generation failed".
test("an expired reservation is named, not read as a failed generation", () => {
  assert.equal(isExpiredReservation(new BudgetError("DEADLINE_EXPIRED")), true);
  assert.equal(isExpiredReservation(new BudgetError("OPERATION_UNCERTAIN")), false);
  assert.equal(isExpiredReservation(new BudgetError("WRONG_STATE")), false);
  assert.equal(isExpiredReservation(new Error("DEADLINE_EXPIRED")), false, "only the ledger's own refusal");
});
