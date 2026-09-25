// Unit tests for the deterministic post-generation letter validator (CL spec §7–8).
// The validator is rule-based (no LLM): the same input must always give the same verdict.
// Verdict semantics under test (validator.ts):
//   - critical issues (FORBIDDEN_PHRASE, FABRICATED_PERCENT, FABRICATED_YEARS, EMPTY) fail alone;
//   - structural issues (greeting, closing, length, job reference) are warnings:
//     a letter with no critical issue and at most 3 warnings still passes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateLetter, issuesToQuestions } from "../../src/server/letters/validator.ts";
import type { ValidationIssue, ValidationResult } from "../../src/server/letters/validator.ts";

// --- Fixtures ---------------------------------------------------------------

// Baseline letter (RU, 141 words): greeting, closing, mentions the job and the
// company, no digits (so no percentages and no experience years), no forbidden
// phrases. Everything below mutates this letter.
const LETTER_HEAD = "Здравствуйте, команда Орион! ";
const LETTER_TAIL = " С уважением, Иван Петров.";
const LETTER_BODY =
  "Меня заинтересовала позиция Backend-разработчик: описание совпадает с тем, чем я занимаюсь ежедневно. " +
  "Последние годы я разрабатываю сервисы на TypeScript и Node.js, отвечаю за интеграции со внешними API и поддерживаю стабильность релизов. " +
  "В предыдущей команде я перестроил процесс код-ревью и тестирования, благодаря этому инцидентов на релиз стало заметно меньше, а планирование обрело предсказуемость. " +
  "Также налаживал сбор метрик и алерты, чтобы деградация замечалась раньше жалоб пользователей. " +
  "Работаю самостоятельными блоками: ставлю оценки, декомпозирую задачи, показываю прогресс по договорённому графику. " +
  "Пишу аккуратные миграции, уделяю внимание наблюдаемости и логированию, объясняю технические решения понятным языком. " +
  "Удалённый формат мне привычен: асинхронное общение, письменные решения, уважение к часовым поясам. " +
  "Опыт с PostgreSQL и очередями сообщений позволяет мне быстро входить в существующую кодовую базу. " +
  "Внимательно читаю документы и не додумываю факты за их пределами. " +
  "Буду рад обсудить, чем могу быть полезен вашей команде.";
const VALID_LETTER = LETTER_HEAD + LETTER_BODY + LETTER_TAIL;

// Context the model was allowed to know: no percentages anywhere, confirmed
// experience capped at 5 years.
const PARAMS_WITHOUT_YEARS = {
  profileTargetRoles: ["backend-разработчик", "инженер-программист"],
  profileCountry: "DE",
  jobTitle: "Backend-разработчик",
  jobCompany: "Орион",
};
const BASE_PARAMS = { ...PARAMS_WITHOUT_YEARS, maxYearsFromCv: 5 };

type LetterParams = Parameters<typeof validateLetter>[0];

function validate(body: string, overrides: Partial<LetterParams> = {}): ValidationResult {
  return validateLetter({ ...BASE_PARAMS, ...overrides, body });
}

function insertMid(text: string, insertion: string): string {
  return text.replace("Также налаживал", `${insertion} Также налаживал`);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function codesOf(result: ValidationResult): string[] {
  return result.issues.map(issue => issue.code);
}

// 7 RU + 7 EN samples, one per forbidden-phrase rule in validator.ts.
const FORBIDDEN_PHRASE_SAMPLES: readonly string[] = [
  "идеально подхожу на эту роль",
  "давно восхищаюсь вашей компанией",
  "это уникальная возможность",
  "я эксперт во всех областях",
  "у меня есть право работать в любой стране",
  "готов к переезду в другой город",
  "свободно владею английским",
  "a perfect fit for this role",
  "have long admired your product",
  "a unique opportunity",
  "an expert in all areas",
  "the right to work in any country",
  "willing to relocate for this position",
  "fluent in English and German",
];

// --- 1. Valid letter --------------------------------------------------------

test("valid baseline letter passes with no issues", () => {
  const words = countWords(VALID_LETTER);
  // Fixture guard: keep the baseline inside the standard CL §5 band (80–350).
  assert.ok(words >= 80 && words <= 350, `baseline letter must stay in 80–350 words, got ${words}`);
  const result = validate(VALID_LETTER);
  assert.deepEqual(result.issues, []);
  assert.equal(result.passed, true);
});

// --- 2. Forbidden phrases ---------------------------------------------------

test("every forbidden phrase (RU and EN) is detected and alone fails validation", () => {
  for (const phrase of FORBIDDEN_PHRASE_SAMPLES) {
    const result = validate(insertMid(VALID_LETTER, phrase));
    assert.equal(result.passed, false, `must fail for phrase: ${phrase}`);
    assert.deepEqual(codesOf(result), ["FORBIDDEN_PHRASE"], `exactly one issue expected for: ${phrase}`);
    assert.ok((result.issues[0]?.message.length ?? 0) > 0, `explanation required for: ${phrase}`);
  }
});

// --- 3. Fabricated percentages ----------------------------------------------

test("percentages absent from the source material are reported as fabricated", () => {
  const single = validate(insertMid(VALID_LETTER, "улучшил ключевые показатели на 40%"));
  assert.equal(single.passed, false);
  assert.deepEqual(codesOf(single), ["FABRICATED_PERCENT"]);
  assert.ok(single.issues[0]?.message.includes("40%"));

  // Decimal with a comma separator and a space before the percent sign.
  const decimal = validate(insertMid(VALID_LETTER, "сократил потери на 12,5 %"));
  assert.deepEqual(codesOf(decimal), ["FABRICATED_PERCENT"]);
  assert.ok(decimal.issues[0]?.message.includes("12,5%"));

  // Every fabricated metric is reported, not just the first one.
  const multiple = validate(insertMid(VALID_LETTER, "вырос на 20%, конверсия на 30%"));
  assert.equal(multiple.passed, false);
  assert.deepEqual(codesOf(multiple), ["FABRICATED_PERCENT", "FABRICATED_PERCENT"]);
  assert.ok(multiple.issues[0]?.message.includes("20%"));
  assert.ok(multiple.issues[1]?.message.includes("30%"));
});

test("percentages are accepted when the job or profile actually contains a percent", () => {
  const fromJobTitle = validate(insertMid(VALID_LETTER, "улучшил показатели на 40%"), {
    jobTitle: "Backend-разработчик (100% remote)",
  });
  assert.deepEqual(codesOf(fromJobTitle), []);
  assert.equal(fromJobTitle.passed, true);

  const fromRoles = validate(insertMid(VALID_LETTER, "улучшил показатели на 40%"), {
    profileTargetRoles: ["QA-инженер (50% автоматизация)"],
  });
  assert.deepEqual(codesOf(fromRoles), []);
  assert.equal(fromRoles.passed, true);
});

// --- 4. Fabricated years ----------------------------------------------------

test("experience years beyond maxYearsFromCv are reported as fabricated in RU and EN", () => {
  const ru = validate(insertMid(VALID_LETTER, "имею опыт 10 лет в похожих проектах"));
  assert.equal(ru.passed, false);
  assert.deepEqual(codesOf(ru), ["FABRICATED_YEARS"]);
  assert.ok(ru.issues[0]?.message.includes("10"));

  const en = validate(insertMid(VALID_LETTER, "over 10 years of hands-on experience"));
  assert.equal(en.passed, false);
  assert.deepEqual(codesOf(en), ["FABRICATED_YEARS"]);
  assert.ok(en.issues[0]?.message.includes("years"));
});

test("years within the confirmed bound and unstated bounds trigger no issue", () => {
  // Exactly the maximum is confirmed experience, not an exaggeration.
  const atBound = validate(insertMid(VALID_LETTER, "пишу production-код уже 5 лет"));
  assert.deepEqual(codesOf(atBound), []);
  assert.equal(atBound.passed, true);

  // null = years not stated in the CV: the check must be skipped entirely.
  const nullBound = validate(insertMid(VALID_LETTER, "мой стаж составляет 12 лет"), {
    maxYearsFromCv: null,
  });
  assert.deepEqual(codesOf(nullBound), []);
  assert.equal(nullBound.passed, true);

  // Key omitted entirely: same skip path.
  const omitted = validateLetter({ ...PARAMS_WITHOUT_YEARS, body: insertMid(VALID_LETTER, "мой стаж составляет 12 лет") });
  assert.deepEqual(codesOf(omitted), []);
  assert.equal(omitted.passed, true);
});

// --- 5. Length bounds -------------------------------------------------------

test("letters below the hard lower bound are flagged TOO_SHORT", () => {
  const shortLetter =
    "Здравствуйте! Меня заинтересовала позиция Backend-разработчик в компании Орион, стек и формат совпадают с моим опытом. С уважением, Иван Петров.";
  const words = countWords(shortLetter);
  assert.ok(words < 40, `fixture must stay under 40 words, got ${words}`);
  const result = validate(shortLetter);
  assert.deepEqual(codesOf(result), ["TOO_SHORT"]);
  // Length is a warning, not a critical issue: one warning alone does not block
  // publication (validator messages reference the 80-word target, the hard
  // verdict bound is 40).
  assert.equal(result.passed, true);
});

test("letters above the hard upper bound are flagged TOO_LONG", () => {
  const filler =
    "я внимательно изучаю требования, уточняю контекст у команды и предлагаю решения, опирающиеся на проверяемые факты из описания";
  const longLetter = LETTER_HEAD + LETTER_BODY + " " + Array.from({ length: 28 }, () => filler).join(" ") + LETTER_TAIL;
  const words = countWords(longLetter);
  assert.ok(words > 400, `fixture must exceed 400 words, got ${words}`);
  const result = validate(longLetter);
  assert.deepEqual(codesOf(result), ["TOO_LONG"]);
  // A single length warning does not block publication on its own.
  assert.equal(result.passed, true);
});

// --- 6. Structural completeness ---------------------------------------------

test("a letter without a greeting is flagged NO_GREETING", () => {
  const result = validate(LETTER_BODY + LETTER_TAIL);
  assert.deepEqual(codesOf(result), ["NO_GREETING"]);
  assert.equal(result.passed, true); // single structural warning is tolerated
});

test("a letter without a closing is flagged NO_CLOSING", () => {
  const result = validate(LETTER_HEAD + LETTER_BODY);
  assert.deepEqual(codesOf(result), ["NO_CLOSING"]);
  assert.equal(result.passed, true); // single structural warning is tolerated
});

// --- 7. Job reference -------------------------------------------------------

test("a letter that never mentions the job title or company is flagged NO_JOB_REFERENCE", () => {
  const result = validate(VALID_LETTER, { jobTitle: "Штурман", jobCompany: "Полярная звезда" });
  assert.deepEqual(codesOf(result), ["NO_JOB_REFERENCE"]);
  assert.equal(result.passed, true); // single structural warning is tolerated
});

// --- 8. Empty body ----------------------------------------------------------

test("empty and whitespace-only letters return EMPTY and fail immediately", () => {
  for (const body of ["", "   \n\t  "]) {
    const result = validate(body);
    assert.equal(result.passed, false);
    assert.deepEqual(codesOf(result), ["EMPTY"]);
  }
});

// --- 9. Issue accumulation --------------------------------------------------

test("three structural warnings accumulate in order and are still tolerated", () => {
  // Body only: no greeting, no closing, and job params that match nothing inside.
  const result = validate(LETTER_BODY, { jobTitle: "Штурман", jobCompany: "Полярная звезда" });
  assert.deepEqual(codesOf(result), ["NO_GREETING", "NO_CLOSING", "NO_JOB_REFERENCE"]);
  // No critical issue and at most 3 warnings: the letter still passes.
  assert.equal(result.passed, true);
});

test("four structural warnings accumulate and fail the letter", () => {
  const fourWarnings = "Меня заинтересовала удалённая работа с вашим продуктом, стек совпадает с ежедневным опытом.";
  assert.ok(countWords(fourWarnings) < 40, "fixture must stay under 40 words");
  const result = validate(fourWarnings, { jobTitle: "Штурман", jobCompany: "Полярная звезда" });
  assert.deepEqual(codesOf(result), ["NO_GREETING", "NO_CLOSING", "TOO_SHORT", "NO_JOB_REFERENCE"]);
  assert.equal(result.passed, false);
});

test("a critical issue keeps failing when combined with structural warnings", () => {
  // No greeting + one forbidden phrase: only 2 issues, but one is critical.
  const result = validate(insertMid(LETTER_BODY, "это уникальная возможность") + LETTER_TAIL);
  assert.deepEqual(codesOf(result), ["NO_GREETING", "FORBIDDEN_PHRASE"]);
  assert.equal(result.passed, false);
});

// --- 10. Critical issues fail alone ------------------------------------------

test("each critical issue code forces passed=false even as the only issue", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["FORBIDDEN_PHRASE", insertMid(VALID_LETTER, "это уникальная возможность")],
    ["FABRICATED_PERCENT", insertMid(VALID_LETTER, "улучшил показатели на 40%")],
    ["FABRICATED_YEARS", insertMid(VALID_LETTER, "имею опыт 10 лет в похожих проектах")],
  ];
  for (const [expectedCode, body] of cases) {
    const result = validate(body);
    assert.equal(result.issues.length, 1, `expected a single issue for ${expectedCode}`);
    assert.deepEqual(codesOf(result), [expectedCode]);
    assert.equal(result.passed, false, `${expectedCode} alone must fail validation`);
  }
});

// --- 11. issuesToQuestions ---------------------------------------------------

test("every known issue code maps to a specific non-empty user-facing prompt", () => {
  const cases: readonly (readonly [ValidationIssue, string])[] = [
    [
      { code: "FORBIDDEN_PHRASE", message: "Запрещённая фраза: «идеально подхожу»." },
      "Уберите или перефразируйте: Запрещённая фраза: «идеально подхожу».",
    ],
    [
      { code: "FABRICATED_PERCENT", message: "Процент «40%» не был в исходных данных." },
      "Укажите только подтверждённые метрики — Процент «40%» не был в исходных данных.",
    ],
    [
      { code: "FABRICATED_YEARS", message: "«10 лет» превышает подтверждённый стаж." },
      "Проверьте стаж — «10 лет» превышает подтверждённый стаж.",
    ],
    [
      { code: "TOO_SHORT", message: "Слишком коротко: 19 слов (минимум 80)." },
      "Слишком коротко: 19 слов (минимум 80). Добавьте релевантные примеры из вашего опыта.",
    ],
    [
      { code: "TOO_LONG", message: "Слишком длинно: 617 слов (максимум 350)." },
      "Слишком длинно: 617 слов (максимум 350). Сократите до самых релевантных оснований.",
    ],
    [
      { code: "NO_JOB_REFERENCE", message: "Письмо не упоминает должность или компанию." },
      "Письмо не упоминает должность или компанию. Укажите должность или название компании.",
    ],
    [{ code: "NO_GREETING", message: "В письме нет приветствия." }, "Добавьте приветствие («Здравствуйте, команда…»)."],
    [
      { code: "NO_CLOSING", message: "В письме нет завершения." },
      "Добавьте завершение («С уважением, …» или «Best regards»).",
    ],
  ];
  const questions = issuesToQuestions(cases.map(([issue]) => issue));
  assert.equal(questions.length, cases.length);
  for (const [index, [, expected]] of cases.entries()) {
    assert.equal(questions[index], expected);
    assert.ok((questions[index]?.length ?? 0) > 0, `question ${index} must be non-empty`);
  }
});

test("unknown and EMPTY codes fall through to the raw message, still non-empty", () => {
  const unknown: ValidationIssue = { code: "SOME_UNKNOWN_CODE", message: "Что-то случилось." };
  const empty: ValidationIssue = { code: "EMPTY", message: "Письмо пустое." };
  assert.deepEqual(issuesToQuestions([unknown, empty]), ["Что-то случилось.", "Письмо пустое."]);
});

test("issuesToQuestions returns one specific question per accumulated issue", () => {
  const fourWarnings = "Меня заинтересовала удалённая работа с вашим продуктом, стек совпадает с ежедневным опытом.";
  const result = validate(fourWarnings, { jobTitle: "Штурман", jobCompany: "Полярная звезда" });
  const questions = issuesToQuestions(result.issues);
  assert.equal(questions.length, result.issues.length);
  assert.equal(questions[0], "Добавьте приветствие («Здравствуйте, команда…»).");
  assert.equal(questions[1], "Добавьте завершение («С уважением, …» или «Best regards»).");
  assert.ok(questions[2]?.includes("Добавьте релевантные примеры из вашего опыта."));
  assert.ok(questions[3]?.endsWith("Укажите должность или название компании."));
});
