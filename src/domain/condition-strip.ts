// DS-002b: the five-cell condition strip and the time-zone strip on feed cards
// (docs/solo/context/NENAUGAD_SIGNAL.md §6). A projection of the rules engine's own
// outcomes: nothing is recomputed, upgraded or counted, and the strip is an index in a
// fixed order, never a meter.
import { timezoneOffsetMinutes, type JobEvaluation, type RuleOutcome } from "./matching.ts";
import type { JobSnapshot, Schedule } from "./source-contracts.ts";

export const STRIP_GROUPS = ["country", "hours", "contract", "pay", "skills"] as const;
export type StripGroup = (typeof STRIP_GROUPS)[number];

export type StripCell = Readonly<{
  group: StripGroup;
  label: string;
  outcome: RuleOutcome;
  explanation: string;
}>;

const RULE_OF: Readonly<Record<StripGroup, string>> = {
  country: "GEO-01", hours: "TIME-01", contract: "CONTRACT-01", pay: "SAL-01", skills: "SKILL-01",
};
const LABEL_OF: Readonly<Record<StripGroup, string>> = {
  country: "страна", hours: "часы", contract: "договор", pay: "оплата", skills: "навыки",
};
// GEO-01, CONTRACT-01 and TIME-01 are evaluated per hiring option.
const PER_OPTION: ReadonlySet<StripGroup> = new Set(["country", "hours", "contract"]);
// AND inside an option, as in evaluateJob: a fail outranks an unknown, and
// not_applicable does not hold an option back.
const RANK: Readonly<Record<RuleOutcome, number>> = { pass: 0, not_applicable: 0, unknown: 1, fail: 2 };

/** The option that decides the job's status (OR across options): the first with the
 *  best aggregate. Null when the evaluation has no per-option rules. */
export function bestHiringOptionId(evaluation: JobEvaluation): string | null {
  const worst = new Map<string, number>();
  for (const rule of evaluation.rules) {
    if (rule.hiringOptionId === null) continue;
    worst.set(rule.hiringOptionId, Math.max(worst.get(rule.hiringOptionId) ?? 0, RANK[rule.outcome]));
  }
  let best: string | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const [id, rank] of worst) {
    if (rank < bestRank) { best = id; bestRank = rank; }
  }
  return best;
}

/** Five cells in the fixed order; per-option cells come from one option only, so a
 *  pass on the strip is never assembled from different options. */
export function conditionStrip(evaluation: JobEvaluation): readonly StripCell[] {
  const option = bestHiringOptionId(evaluation);
  return STRIP_GROUPS.map(group => {
    const perOption = PER_OPTION.has(group);
    const rule = evaluation.rules.find(candidate => candidate.ruleId === RULE_OF[group] &&
      (perOption ? option !== null && candidate.hiringOptionId === option : candidate.hiringOptionId === null));
    if (!rule) {
      return { group, label: LABEL_OF[group], outcome: "unknown",
        explanation: perOption ? "Условия найма не опубликованы." : "Правило не оценивало это условие." };
    }
    return { group, label: LABEL_OF[group], outcome: rule.outcome, explanation: rule.explanation };
  });
}

export type ZoneFact = Readonly<{
  offsetsMinutes: readonly number[];
  semantics: Schedule["zone_semantics"];
}>;

export type ZoneStripView = Readonly<{
  cells: readonly Readonly<{ offsetHours: number; accepted: boolean; candidate: boolean }>[];
  acceptedText: string;
  candidateText: string | null;
  /** A standard-offset list covers its zones' summer time (B59-001). */
  summerIncluded: boolean;
}>;

/** The accepted UTC offsets of the option that decides the status, or null when that
 *  option publishes none (Jobicy, or a schedule that is not explicit). */
export function zoneFactOf(snapshot: JobSnapshot, evaluation: JobEvaluation): ZoneFact | null {
  const optionId = bestHiringOptionId(evaluation);
  const schedule = snapshot.hiring_options.find(option => option.id === optionId)?.schedule;
  if (!schedule || schedule.status !== "explicit" || schedule.accepted_utc_offsets_minutes.length === 0) return null;
  return { offsetsMinutes: schedule.accepted_utc_offsets_minutes, semantics: schedule.zone_semantics };
}

export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return "UTC±0";
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  const rest = absolute % 60;
  return `UTC${sign}${Math.floor(absolute / 60)}${rest === 0 ? "" : `:${String(rest).padStart(2, "0")}`}`;
}

// Runs of three or more consecutive whole hours read as a range (the US list is seven
// offsets); shorter runs and half-hour offsets stay listed one by one.
function describeOffsets(values: readonly number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[start]! % 60 === 0 && sorted[end + 1]! - sorted[end]! === 60) end += 1;
    if (end - start >= 2) {
      parts.push(`${formatUtcOffset(sorted[start]!)}…${formatUtcOffset(sorted[end]!)}`);
      start = end + 1;
    } else {
      parts.push(formatUtcOffset(sorted[start]!));
      start += 1;
    }
  }
  return parts.join(", ");
}

// The same sampling as TIME-01: the 15th of every month of a fixed year, no clock.
const REFERENCE_YEAR = 2026;

/** The candidate zone's distinct UTC offsets across the year (winter and summer). */
export function candidateOffsets(timezone: string): readonly number[] {
  const offsets = new Set<number>();
  for (let month = 0; month < 12; month += 1) {
    const offset = timezoneOffsetMinutes(timezone, new Date(Date.UTC(REFERENCE_YEAR, month, 15, 12, 0, 0)));
    if (offset !== null) offsets.add(offset);
  }
  return [...offsets].sort((a, b) => a - b);
}

/** Accepted zones on a −12…+14 hour axis with the candidate's zone marked. Half-hour
 *  offsets mark their whole-hour cell and keep their exact value in the text. */
export function zoneStrip(fact: ZoneFact, candidateOffsetsMinutes: readonly number[]): ZoneStripView {
  const hourOf = (minutes: number): number => Math.trunc(minutes / 60);
  const accepted = new Set(fact.offsetsMinutes.map(hourOf));
  const candidate = new Set(candidateOffsetsMinutes.map(hourOf));
  const cells = Array.from({ length: 27 }, (_, index) => {
    const offsetHours = index - 12;
    return { offsetHours, accepted: accepted.has(offsetHours), candidate: candidate.has(offsetHours) };
  });
  const candidates = [...new Set(candidateOffsetsMinutes)].sort((a, b) => a - b);
  return {
    cells,
    acceptedText: describeOffsets(fact.offsetsMinutes),
    candidateText: candidates.length > 0 ? candidates.map(formatUtcOffset).join(" / ") : null,
    summerIncluded: fact.semantics === "standard_utc_offset",
  };
}
