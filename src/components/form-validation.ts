// Client-side field validators (pure, no server imports).
// They mirror the server-side rules for immediate feedback only; the server
// remains the authority — these never replace parseManualProfileInput.

export function validateEmail(value: string): string | null {
  if (value.trim().length === 0) return "Введите email.";
  if (!/^[^\s@]{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/u.test(value.trim())) {
    return "Похоже, в адресе опечатка: нужен формат вида name@example.com.";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length === 0) return "Введите пароль.";
  if (value.length < 10) return `Пароль — минимум 10 символов, сейчас ${value.length}.`;
  return null;
}

export function validateCountry(value: string): string | null {
  if (value.trim().length === 0) return null; // страна может быть не задана
  if (!/^[A-Za-z]{2}$/u.test(value.trim())) return "Страна — двухбуквенный ISO-код, например DE или US.";
  return null;
}

export function validateTimezone(value: string): string | null {
  if (value.trim().length === 0) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return null;
  } catch {
    return "Такого часового пояса IANA нет. Пример: Europe/Berlin.";
  }
}

export function validateRoles(value: string): string | null {
  const roles = value.split(",").map(role => role.trim()).filter(Boolean);
  if (roles.length === 0) return "Укажите хотя бы одну целевую роль.";
  if (roles.some(role => role.length < 2)) return "Каждая роль — минимум 2 символа.";
  return null;
}

export function validateSalaryAmount(value: string): string | null {
  if (value.trim().length === 0) return null;
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u.test(value.trim())) {
    return "Число без пробелов, например 30 или 30.5.";
  }
  return null;
}

export function validateTimeOrder(start: string, end: string): string | null {
  if (start >= end) return "Конец интервала должен быть позже начала.";
  return null;
}
