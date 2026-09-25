// Hide-reason vocabulary and validation for personal job feedback.
// Fixed codes only (privacy minimization); no free text in v1.
export const HIDE_REASONS: readonly (readonly [string, string])[] = [
  ["salary_mismatch", "Зарплата не подходит"],
  ["geography_mismatch", "География найма не подходит"],
  ["wrong_level", "Не тот уровень позиции"],
  ["wrong_stack", "Не тот стек/роли"],
  ["company_uninteresting", "Компания не интересна"],
  ["remote_conditions_unclear", "Условия удалёнки неясны"],
  ["other", "Другое"],
];

export const HIDE_REASON_CODES: readonly string[] = HIDE_REASONS.map(([code]) => code);

export function isHideReason(value: unknown): value is string {
  return typeof value === "string" && (HIDE_REASON_CODES as readonly string[]).includes(value);
}

export function hideReasonLabel(code: string): string {
  return HIDE_REASONS.find(([candidate]) => candidate === code)?.[1] ?? code;
}
