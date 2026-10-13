import assert from "node:assert/strict";
import { test } from "node:test";
import { letterErrorMessage } from "../../src/components/letter-errors.ts";

// B52: an uncertain call (B46) or a reservation too late to be sent (B50) used to show
// the generic "try later", which invited a second paid call while the first might have
// been billed. The wording is the owner's (2026-10-13).
const UNCONFIRMED = "Результат вызова не подтверждён; списание будет сверено владельцем."
  + " Повторная генерация оплачивается отдельно.";

test("an unconfirmed call says so, and that a new generation is a new charge (B52)", () => {
  assert.equal(letterErrorMessage("OPERATION_UNCERTAIN"), UNCONFIRMED);
  assert.equal(letterErrorMessage("DEADLINE_EXPIRED"), UNCONFIRMED);
});

test("the editor's other messages are unchanged", () => {
  assert.equal(letterErrorMessage("BUDGET_EXCEEDED"), "Бюджет исчерпан — обратитесь к владельцу.");
  assert.equal(letterErrorMessage("PROFILE_REQUIRED"), "Сначала заполните профиль.");
  for (const code of ["GENERATION_FAILED", "PERSONAL_DATA_BOUNDARY", "GENERATION_LIMIT", "", undefined]) {
    assert.equal(letterErrorMessage(code), "Не удалось сгенерировать. Попробуйте позже.", String(code));
  }
});
