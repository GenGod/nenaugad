// What the letter editor says for a failed generation (pure, no server imports).

/**
 * A call whose result is unknown (OPERATION_UNCERTAIN, B46) or whose reservation came
 * too late to be sent (DEADLINE_EXPIRED, B50): money is held until the owner reconciles
 * it, and a new click is a new key, a new hold and a new charge. "Try later" invited
 * exactly that (B52). The wording is the owner's (2026-10-13).
 */
const UNCONFIRMED = "Результат вызова не подтверждён; списание будет сверено владельцем."
  + " Повторная генерация оплачивается отдельно.";

export function letterErrorMessage(code: string | undefined): string {
  if (code === "OPERATION_UNCERTAIN" || code === "DEADLINE_EXPIRED") return UNCONFIRMED;
  if (code === "BUDGET_EXCEEDED") return "Бюджет исчерпан — обратитесь к владельцу.";
  if (code === "PROFILE_REQUIRED") return "Сначала заполните профиль.";
  return "Не удалось сгенерировать. Попробуйте позже.";
}
