// Deterministic compatibility rules v1 (spec section 13).
// No LLM, no network: same inputs — same outputs. Every rule returns
// pass | fail | unknown | not_applicable with reason codes and an
// explanation; aggregation is AND inside a hiring option, OR across options.
import type { JobSnapshot, HiringOption } from "./source-contracts.ts";
import type { ManualProfileInput } from "./profile.ts";
import { extractSkills, skillOverlap, skillCategory } from "./skills.ts";

export const RULESET_VERSION = 5;

export type RuleOutcome = "pass" | "fail" | "unknown" | "not_applicable";

export type RuleResult = Readonly<{
  ruleId: string;
  outcome: RuleOutcome;
  reasonCodes: readonly string[];
  hiringOptionId: string | null;
  explanation: string;
}>;

export type JobEvaluation = Readonly<{
  snapshotId: string;
  status: "eligible" | "needs_review" | "ineligible" | "not_evaluated";
  rules: readonly RuleResult[];
}>;

function timezoneOffsetMinutes(timezone: string, date: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, timeZoneName: "longOffset",
    });
    const part = formatter.formatToParts(date).find(p => p.type === "timeZoneName");
    const match = part?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/u);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
  } catch {
    return null;
  }
}

// Seasonal honesty (spec 11.3; docs/OPEN_GAPS.md B12): a timezone has an offset
// per moment, and transitions do not always land in March/October. Sampling only
// January and July let zones with unusual rules (Ramadan shifts, southern
// hemisphere) pass a check that does not hold all year. The rule samples the
// 15th of every month of a fixed reference year — same inputs, same outcome,
// no clock. This is a rule-behaviour change, hence RULESET_VERSION 3.
const OFFSET_REFERENCE_YEAR = 2026;

function monthlyOffsets(timezone: string): readonly (number | null)[] {
  return Array.from({ length: 12 }, (_, month) =>
    timezoneOffsetMinutes(timezone, new Date(Date.UTC(OFFSET_REFERENCE_YEAR, month, 15, 12, 0, 0))));
}

function ruleGeography(
  option: HiringOption, profile: ManualProfileInput,
): RuleResult {
  const geo = option.geography;
  const base = { ruleId: "GEO-01", hiringOptionId: option.id, reasonCodes: [] as string[] };
  if (profile.residenceCountry === null) {
    return { ...base, outcome: "unknown", reasonCodes: ["LOCATION_UNKNOWN"],
      explanation: "Страна работы не задана в профиле — совместимость по географии не оценена." };
  }
  if (geo.excluded_countries.includes(profile.residenceCountry)) {
    return { ...base, outcome: "fail", reasonCodes: ["LOCATION_MISMATCH"],
      explanation: `Работодатель исключил страну ${profile.residenceCountry}.` };
  }
  if (geo.scope === "worldwide" && geo.allowed_countries.length === 0) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: "Источник заявляет найм по всему миру (по контракту источника)." };
  }
  if (geo.scope === "restricted" && geo.allowed_countries.length > 0) {
    if (geo.allowed_countries.includes(profile.residenceCountry)) {
      return { ...base, outcome: "pass", reasonCodes: [],
        explanation: `Страна ${profile.residenceCountry} входит в опубликованный список.` };
    }
    // An incomplete list (spec 11.1: the label also names a region such as EMEA) cannot
    // rule out a country it does not name (docs/OPEN_GAPS.md B25). This is a
    // rule-behaviour change, hence RULESET_VERSION 4.
    if (!geo.exhaustive) {
      return { ...base, outcome: "unknown", reasonCodes: ["LOCATION_UNKNOWN"],
        explanation: `Список стран неполный: названы ${geo.allowed_countries.join(", ")}, но не только они — страну ${profile.residenceCountry} нужно уточнить у работодателя.` };
    }
    return { ...base, outcome: "fail", reasonCodes: ["LOCATION_MISMATCH"],
      explanation: `Найм только из: ${geo.allowed_countries.join(", ")}; профиль — ${profile.residenceCountry}.` };
  }
  return { ...base, outcome: "unknown", reasonCodes: ["LOCATION_UNKNOWN"],
    explanation: "География найма не опубликована в машиночитаемом виде." };
}

function ruleEmployment(
  option: HiringOption, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "CONTRACT-01", hiringOptionId: option.id, reasonCodes: [] as string[] };
  const jobTypes = option.employment_types;
  if (jobTypes.includes("unknown") && jobTypes.length === 1) {
    return { ...base, outcome: "unknown", reasonCodes: ["CONTRACT_UNKNOWN"],
      explanation: "Форма договора у источника не указана." };
  }
  const known = jobTypes.filter(type => type !== "unknown");
  const match = known.some(type => profile.employmentTypes.includes(type as never));
  return match
    ? { ...base, outcome: "pass", reasonCodes: [],
        explanation: `Форма договора совпадает (${known.join(", ")}).` }
    : { ...base, outcome: "fail", reasonCodes: ["CONTRACT_MISMATCH"],
        explanation: `Работодатель предлагает ${known.join(", ")}; в профиле — ${profile.employmentTypes.join(", ")}.` };
}

function ruleAttendance(
  snapshot: JobSnapshot, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "REMOTE-01", hiringOptionId: null, reasonCodes: [] as string[] };
  if (!profile.zeroMandatoryAttendance) {
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "Профиль не требует полного отсутствия обязательного присутствия." };
  }
  return snapshot.workplace.mandatory_onsite === "required"
    ? { ...base, outcome: "fail", reasonCodes: ["MANDATORY_ONSITE"],
        explanation: "У вакансии есть обязательное физическое присутствие." }
    : { ...base, outcome: "pass", reasonCodes: [],
        explanation: "Обязательное присутствие не требуется или не заявлено." };
}

// ROLE-01: do any of the user's target roles appear in the job title or
// description? A positive signal — not a hard gate (jobs without a keyword
// match are still evaluated, the rule is neutral/not_applicable for them).
function ruleRoles(
  snapshot: JobSnapshot, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "ROLE-01", hiringOptionId: null, reasonCodes: [] as string[] };
  if (profile.targetRoles.length === 0) {
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "Целевые роли не заданы." };
  }
  const haystack = `${snapshot.title} ${snapshot.description_text}`.toLowerCase();
  const matched = profile.targetRoles.filter(role =>
    haystack.includes(role.toLowerCase()));
  if (matched.length > 0) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: `Целевая роль «${matched[0]}» найдена в заголовке или описании.` };
  }
  return { ...base, outcome: "not_applicable", reasonCodes: ["NO_ROLE_MATCH"],
    explanation: `Ни одна из целевых ролей (${profile.targetRoles.join(", ")}) не найдена в заголовке.` };
}

// Determine the user's primary skill categories (top 2 by skill count).
function primaryCategories(userSkills: readonly string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const skill of userSkills) {
    const category = skillCategory(skill);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return new Set(sorted.slice(0, 2).map(([category]) => category));
}

// SKILL-01: skill matching with category awareness.
//   matched >= 2 AND at least one from a primary category → pass
//   matched >= 2 BUT all from secondary categories → fail (different field)
//   matched == 1 → not_applicable (weak signal)
//   matched == 0 → fail (proven mismatch)
function ruleSkills(
  snapshot: JobSnapshot, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "SKILL-01", hiringOptionId: null, reasonCodes: [] as string[] };
  if (profile.skills.length === 0) {
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "Навыки не заданы в профиле — загрузите резюме для автозаполнения." };
  }
  const jobSkills = extractSkills(`${snapshot.title} ${snapshot.description_text}`);
  if (jobSkills.length === 0) {
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "В описании вакансии не найдены узнаваемые навыки." };
  }
  const { matched } = skillOverlap(profile.skills, jobSkills);
  const primaries = primaryCategories(profile.skills);
  const primaryMatched = matched.filter(skill => primaries.has(skillCategory(skill)));
  const secondaryMatched = matched.filter(skill => !primaries.has(skillCategory(skill)));

  if (primaryMatched.length >= 1 && matched.length >= 2) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: `Совпало ${matched.length} навыков: ${matched.slice(0, 5).join(", ")}.` };
  }
  if (matched.length >= 2 && primaryMatched.length === 0) {
    const secondaryCats = [...new Set(secondaryMatched.map(skillCategory))].join(", ");
    return { ...base, outcome: "fail", reasonCodes: ["WRONG_FIELD"],
      explanation: `Совпали только вторичные навыки (${secondaryMatched.join(", ")}) из категории ${secondaryCats}. Это другая сфера деятельности.` };
  }
  if (matched.length === 1) {
    return { ...base, outcome: "not_applicable", reasonCodes: ["WEAK_SKILL_OVERLAP"],
      explanation: `Один совпавший навык: ${matched[0]}. Слабый сигнал.` };
  }
  return { ...base, outcome: "fail", reasonCodes: ["ZERO_SKILL_OVERLAP"],
    explanation: `Ни один из ваших навыков (${profile.skills.slice(0, 5).join(", ")}) не найден в вакансии.` };
}

function ruleSalary(
  snapshot: JobSnapshot, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "SAL-01", hiringOptionId: null, reasonCodes: [] as string[] };
  const minimum = profile.minimumCompensation;
  if (minimum === null) {
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "Минимальная компенсация в профиле не задана." };
  }
  const range = snapshot.compensation.ranges[0];
  if (!range || range.currency === null || range.currency !== minimum.currency ||
    range.period !== minimum.period || range.min === null) {
    // Never compare across currencies/periods with an invented rate (spec 12.2).
    return { ...base, outcome: "unknown", reasonCodes: ["SALARY_INCOMPARABLE"],
      explanation: "Зарплата вакансии несопоставима с минимумом профиля (валюта/период/нет данных)." };
  }
  const jobMax = Number(range.max ?? range.min);
  const jobMin = Number(range.min);
  const wanted = Number(minimum.amount);
  if (jobMax >= wanted) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: `Верх диапазона (${range.max ?? range.min} ${range.currency}) покрывает минимум ${minimum.amount}.` };
  }
  if (range.max === null && jobMin < wanted) {
    return { ...base, outcome: "unknown", reasonCodes: ["SALARY_INCOMPARABLE"],
      explanation: "Опубликовано только нижнее значение; верхней границы нет — достаточность не доказана." };
  }
  return minimum.hard
    ? { ...base, outcome: "fail", reasonCodes: ["SALARY_BELOW_MIN"],
        explanation: `Максимум вакансии ${jobMax} ниже жёсткого минимума ${wanted}.` }
    : { ...base, outcome: "pass", reasonCodes: ["SALARY_BELOW_MIN"],
        explanation: `Максимум вакансии ${jobMax} ниже минимума, но пожелание мягкое.` };
}

function ruleOverlap(
  option: HiringOption, profile: ManualProfileInput,
): RuleResult {
  const base = { ruleId: "TIME-01", hiringOptionId: option.id, reasonCodes: [] as string[] };
  const schedule = option.schedule;
  if (schedule.status !== "explicit" || schedule.accepted_utc_offsets_minutes.length === 0) {
    if (schedule.zone_semantics === "ambiguous") {
      return { ...base, outcome: "unknown", reasonCodes: ["TIMEZONE_AMBIGUOUS"],
        explanation: "Часовые условия источника неоднозначны." };
    }
    return { ...base, outcome: "not_applicable", reasonCodes: [],
      explanation: "Часовые ограничения вакансией не опубликованы." };
  }
  if (profile.timezone === null) {
    return { ...base, outcome: "unknown", reasonCodes: ["TIMEZONE_AMBIGUOUS"],
      explanation: "Часовой пояс профиля не задан." };
  }
  const accepted = schedule.accepted_utc_offsets_minutes;
  const offsets: number[] = [];
  for (const offset of monthlyOffsets(profile.timezone)) {
    if (offset === null) {
      return { ...base, outcome: "unknown", reasonCodes: ["TIMEZONE_AMBIGUOUS"],
        explanation: "Не удалось вычислить смещение часового пояса профиля." };
    }
    offsets.push(offset);
  }
  const inAccepted = offsets.map(offset => accepted.includes(offset));
  if (inAccepted.every(Boolean)) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: "Часовой пояс профиля входит в принимаемые источником зоны весь год." };
  }
  // A standard-offset list (B59-001) names a zone by its standard (winter) offset,
  // the lowest it takes in the year, and covers its summer time. Only an unknown
  // becomes a pass here: a zone with its lowest offset listed always meets the list
  // in some month, so it could not have failed. RULESET_VERSION 5.
  if (schedule.zone_semantics === "standard_utc_offset" && accepted.includes(Math.min(...offsets))) {
    return { ...base, outcome: "pass", reasonCodes: [],
      explanation: "Стандартное (зимнее) смещение часового пояса профиля входит в принимаемые источником зоны; летнее время включено." };
  }
  if (!inAccepted.some(Boolean)) {
    return { ...base, outcome: "fail", reasonCodes: ["OVERLAP_INSUFFICIENT"],
      explanation: "Часовой пояс профиля вне принимаемых источником зон." };
  }
  return { ...base, outcome: "unknown", reasonCodes: ["TIMEZONE_AMBIGUOUS"],
    explanation: "Зона профиля входит в принимаемые только часть года (сезонные правила или переход на летнее время)." };
}

function aggregateOption(outcomes: readonly RuleOutcome[]): RuleOutcome {
  if (outcomes.includes("fail")) return "fail";
  if (outcomes.includes("unknown")) return "unknown";
  return "pass";
}

export function evaluateJob(snapshot: JobSnapshot, profile: ManualProfileInput): JobEvaluation {
  const jobLevel: RuleResult[] = [
    ruleAttendance(snapshot, profile),
    ruleSalary(snapshot, profile),
    ruleRoles(snapshot, profile),
    ruleSkills(snapshot, profile),
  ];
  const optionOutcomes = snapshot.hiring_options.map(option => {
    const rules = [ruleGeography(option, profile), ruleEmployment(option, profile), ruleOverlap(option, profile)];
    return { optionId: option.id, outcome: aggregateOption(rules.map(rule => rule.outcome)), rules };
  });
  const rules: RuleResult[] = [...jobLevel];
  for (const option of optionOutcomes) rules.push(...option.rules);
  // OR across hiring options (spec 13.2).
  let status: JobEvaluation["status"];
  if (optionOutcomes.some(option => option.outcome === "pass")) status = "eligible";
  else if (optionOutcomes.some(option => option.outcome === "unknown")) status = "needs_review";
  else status = "ineligible";
  // Job-level hard constraints (attendance, salary, skills) cap the status:
  // a job-level fail means the job cannot be eligible even if a hiring
  // option passes logistics (spec 13.2: "После условий найма применяются
  // выбранные пользователем hard preferences и обязательные требования").
  if (status === "eligible" && jobLevel.some(rule => rule.outcome === "fail")) {
    status = "needs_review";
  }
  return { snapshotId: snapshot.id, status, rules };
}
