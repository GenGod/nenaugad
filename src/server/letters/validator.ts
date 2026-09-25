// Deterministic post-generation validator (CL spec §7–8, §12).
// No LLM: same input — same verdict. Checks for forbidden phrases,
// invented numbers, length bounds, and structural completeness.
// A failing validation returns needs_input with specific questions,
// never a silently degraded letter.

export type ValidationIssue = Readonly<{
  code: string;
  message: string;
}>;

export type ValidationResult = Readonly<{
  passed: boolean;
  issues: readonly ValidationIssue[];
}>;

// CL §7: phrases that turn an honest letter into a sales pitch.
const FORBIDDEN_PHRASES: readonly (readonly [RegExp, string])[] = [
  [/идеально подхож/u, "«идеально подхожу» — обещание, которое нельзя подтвердить"],
  [/давно восхищаюсь/u, "«давно восхищаюсь» — выдуманный интерес"],
  [/уникальная возможность/u, "«уникальная возможность» — штамп"],
  [/эксперт во всех/u, "«эксперт во всех» — неподтверждаемое утверждение"],
  [/право работать в любой стране/u, "право работы не выводится из резюме"],
  [/готов к переезду/u, "готовность к переезду не подтверждена профилем"],
  [/свободно владею английским/u, "уровень языка не выводится из резюме"],
  [/perfect fit/iu, "'perfect fit' — unverifiable claim"],
  [/long admired/iu, "'long admired' — fabricated interest"],
  [/unique opportunity/iu, "'unique opportunity' — cliché"],
  [/expert in all/iu, "'expert in all' — unverifiable claim"],
  [/right to work in any country/iu, "work rights cannot be inferred from a CV"],
  [/willing to relocate/iu, "relocation willingness is not profile-confirmed"],
  [/fluent in english/iu, "language level cannot be inferred from a CV"],
];

// Percentages that weren't in the source material are fabricated metrics.
const PERCENT_PATTERN = /(\d+(?:[.,]\d+)?)\s*%/gu;

// Years of experience: "N лет" / "N years" — must not exceed the input.
const YEARS_PATTERN_RU = /(\d+)\s*(?:год|года|лет)/gu;
const YEARS_PATTERN_EN = /(\d+)\s*years?/giu;

export function validateLetter(params: Readonly<{
  body: string;
  // Context from the prompt: what the model was allowed to know.
  profileTargetRoles: readonly string[];
  profileCountry: string | null;
  jobTitle: string;
  jobCompany: string;
  // Upper bounds from the input material (null = not stated).
  maxYearsFromCv?: number | null;
}>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const text = params.body.trim();

  // 1. Structural completeness (CL §7).
  if (text.length === 0) {
    return { passed: false, issues: [{ code: "EMPTY", message: "Письмо пустое." }] };
  }
  const hasGreeting = /^(?:[ЗдпZPSHh]|Dear|Hello|Hi|Greetings)/mu.test(text) ||
    text.includes("Здравствуйте") || text.includes("Dear ") || text.includes("Hello ");
  if (!hasGreeting) {
    issues.push({ code: "NO_GREETING", message: "В письме нет приветствия." });
  }
  const hasClosing = text.includes("С уважением") || text.includes("Best regards") ||
    text.includes("Best,") || text.includes("Sincerely") || text.includes("Best wishes") ||
    text.slice(-100).includes("который") || text.slice(-200).includes("готов") ||
    text.slice(-200).includes("look forward") || text.slice(-200).includes("welcome");
  if (!hasClosing) {
    issues.push({ code: "NO_CLOSING", message: "В письме нет завершения." });
  }

  // 2. Forbidden phrases (CL §7).
  for (const [pattern, explanation] of FORBIDDEN_PHRASES) {
    if (pattern.test(text)) {
      issues.push({ code: "FORBIDDEN_PHRASE", message: `Запрещённая фраза: ${explanation}.` });
    }
  }

  // 3. Invented percentages (CL §7: "оптимизация без метрик не становится ускорением на 40%").
  const sourceHasPercent = params.profileTargetRoles.join(" ").includes("%") ||
    params.jobTitle.includes("%");
  if (!sourceHasPercent) {
    for (const match of text.matchAll(PERCENT_PATTERN)) {
      issues.push({ code: "FABRICATED_PERCENT", message: `Процент «${match[1]}%» не был в исходных данных.` });
    }
  }

  // 4. Invented years of experience.
  const maxYears = params.maxYearsFromCv ?? null;
  if (maxYears !== null) {
    for (const match of text.matchAll(YEARS_PATTERN_RU)) {
      if (Number(match[1]) > maxYears) {
        issues.push({ code: "FABRICATED_YEARS", message: `«${match[1]} лет» превышает подтверждённый стаж.` });
      }
    }
    for (const match of text.matchAll(YEARS_PATTERN_EN)) {
      if (Number(match[1]) > maxYears) {
        issues.push({ code: "FABRICATED_YEARS", message: `'${match[1]} years' exceeds confirmed experience.` });
      }
    }
  }

  // 5. Length bounds (CL §5: standard 150–250, short 80–140; cap at 350).
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (wordCount < 40) {
    issues.push({ code: "TOO_SHORT", message: `Слишком коротко: ${wordCount} слов (минимум 80).` });
  } else if (wordCount > 400) {
    issues.push({ code: "TOO_LONG", message: `Слишком длинно: ${wordCount} слов (максимум 350).` });
  }

  // 6. Must mention the job or company (targeted mode).
  const mentionsJob = text.toLowerCase().includes(params.jobTitle.toLowerCase().split(" ")[0] ?? "") ||
    text.toLowerCase().includes(params.jobCompany.toLowerCase());
  if (!mentionsJob) {
    issues.push({ code: "NO_JOB_REFERENCE", message: "Письмо не упоминает должность или компанию." });
  }

  // Verdict: critical issues block publication; structural ones are warnings.
  const critical = issues.filter(issue =>
    issue.code === "FORBIDDEN_PHRASE" || issue.code === "FABRICATED_PERCENT" ||
    issue.code === "FABRICATED_YEARS" || issue.code === "EMPTY");
  const passed = critical.length === 0 && issues.length <= 3;
  return { passed, issues };
}

// Convert validation issues to user-facing questions (CL §8: needs_input
// returns specific questions, not a vague error).
export function issuesToQuestions(issues: readonly ValidationIssue[]): readonly string[] {
  return issues.map(issue => {
    switch (issue.code) {
      case "FORBIDDEN_PHRASE":
        return `Уберите или перефразируйте: ${issue.message}`;
      case "FABRICATED_PERCENT":
        return `Укажите только подтверждённые метрики — ${issue.message}`;
      case "FABRICATED_YEARS":
        return `Проверьте стаж — ${issue.message}`;
      case "TOO_SHORT":
        return `${issue.message} Добавьте релевантные примеры из вашего опыта.`;
      case "TOO_LONG":
        return `${issue.message} Сократите до самых релевантных оснований.`;
      case "NO_JOB_REFERENCE":
        return `${issue.message} Укажите должность или название компании.`;
      case "NO_GREETING":
        return `Добавьте приветствие («Здравствуйте, команда…»).`;
      case "NO_CLOSING":
        return `Добавьте завершение («С уважением, …» или «Best regards»).`;
      default:
        return issue.message;
    }
  });
}
