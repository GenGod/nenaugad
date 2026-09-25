// Manual S2 profile: parse/validate user input and build canonical
// CandidateProfile + SearchProfile documents (schema 1.0.0 subset).
// The user confirms country/timezone explicitly (spec 9.2); nothing is
// inferred, sensitive attributes are not collected at all.
import type { JobSnapshot } from "./source-contracts.ts";

export const EMPLOYMENT_TYPES = [
  "employment_full_time", "employment_part_time", "contractor",
  "freelance", "internship", "temporary",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const COMPENSATION_PERIODS = [
  "hourly", "daily", "weekly", "fortnightly", "monthly", "annual", "project",
] as const;
export type CompensationPeriod = (typeof COMPENSATION_PERIODS)[number];

export type AvailabilityWindow = Readonly<{
  weekdays: readonly number[];
  start: string;
  end: string;
}>;

export type ManualProfileInput = Readonly<{
  residenceCountry: string | null;
  timezone: string | null;
  targetRoles: readonly string[];
  employmentTypes: readonly EmploymentType[];
  availabilityWindows: readonly AvailabilityWindow[];
  zeroMandatoryAttendance: boolean;
  minimumCompensation: Readonly<{
    amount: string; currency: string; period: CompensationPeriod;
    taxBasis: "gross" | "net" | "unknown"; component: "base" | "total" | "unknown"; hard: boolean;
  }> | null;
  showNeedsReview: boolean;
}>;

export class ProfileValidationError extends Error {
  constructor(code: string) { super(code); }
}

const ISO_COUNTRY = /^[A-Z]{2}$/u;
const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u;

function isIanaTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function parseManualProfileInput(value: unknown): ManualProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProfileValidationError("INVALID_PROFILE_SHAPE");
  }
  const raw = value as Record<string, unknown>;
  const country = raw.residenceCountry;
  if (!(country === null || (typeof country === "string" && ISO_COUNTRY.test(country)))) {
    throw new ProfileValidationError("INVALID_RESIDENCE_COUNTRY");
  }
  const timezone = raw.timezone;
  if (!(timezone === null || (typeof timezone === "string" && isIanaTimeZone(timezone)))) {
    throw new ProfileValidationError("INVALID_TIMEZONE");
  }
  if (timezone !== null && country === null) {
    throw new ProfileValidationError("TIMEZONE_WITHOUT_COUNTRY");
  }
  const targetRoles = raw.targetRoles;
  if (!Array.isArray(targetRoles) || targetRoles.length < 1 || targetRoles.length > 10 ||
    !targetRoles.every(role => typeof role === "string" && role.trim().length >= 2 && role.length <= 80)) {
    throw new ProfileValidationError("INVALID_TARGET_ROLES");
  }
  const employmentTypes = raw.employmentTypes;
  if (!Array.isArray(employmentTypes) || employmentTypes.length < 1 ||
    !employmentTypes.every(type => (EMPLOYMENT_TYPES as readonly string[]).includes(String(type)))) {
    throw new ProfileValidationError("INVALID_EMPLOYMENT_TYPES");
  }
  const windows = raw.availabilityWindows;
  if (!Array.isArray(windows) || windows.length < 1 || windows.length > 7) {
    throw new ProfileValidationError("INVALID_AVAILABILITY");
  }
  const parsedWindows: AvailabilityWindow[] = [];
  for (const window of windows) {
    if (!window || typeof window !== "object") throw new ProfileValidationError("INVALID_AVAILABILITY");
    const w = window as Record<string, unknown>;
    const weekdays = w.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length < 1 ||
      !weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7) ||
      new Set(weekdays).size !== weekdays.length) {
      throw new ProfileValidationError("INVALID_AVAILABILITY");
    }
    if (typeof w.start !== "string" || !HH_MM.test(w.start) ||
      typeof w.end !== "string" || !HH_MM.test(w.end) || w.start >= w.end) {
      throw new ProfileValidationError("INVALID_AVAILABILITY");
    }
    parsedWindows.push({ weekdays: weekdays as number[], start: w.start, end: w.end });
  }
  if (typeof raw.zeroMandatoryAttendance !== "boolean" ||
    typeof raw.showNeedsReview !== "boolean") {
    throw new ProfileValidationError("INVALID_FLAGS");
  }
  let minimumCompensation: ManualProfileInput["minimumCompensation"] = null;
  if (raw.minimumCompensation !== null && raw.minimumCompensation !== undefined) {
    const comp = raw.minimumCompensation;
    if (!comp || typeof comp !== "object") throw new ProfileValidationError("INVALID_COMPENSATION");
    const c = comp as Record<string, unknown>;
    if (typeof c.amount !== "string" || !DECIMAL.test(c.amount) ||
      typeof c.currency !== "string" || !/^[A-Z]{3}$/u.test(c.currency) ||
      !(COMPENSATION_PERIODS as readonly string[]).includes(String(c.period)) ||
      !["gross", "net", "unknown"].includes(String(c.taxBasis)) ||
      !["base", "total", "unknown"].includes(String(c.component)) ||
      typeof c.hard !== "boolean") {
      throw new ProfileValidationError("INVALID_COMPENSATION");
    }
    minimumCompensation = {
      amount: c.amount, currency: c.currency, period: c.period as CompensationPeriod,
      taxBasis: c.taxBasis as "gross" | "net" | "unknown",
      component: c.component as "base" | "total" | "unknown", hard: c.hard,
    };
  }
  return {
    residenceCountry: country,
    timezone,
    targetRoles: (targetRoles as string[]).map(role => role.trim()),
    employmentTypes: employmentTypes as EmploymentType[],
    availabilityWindows: parsedWindows,
    zeroMandatoryAttendance: raw.zeroMandatoryAttendance,
    minimumCompensation,
    showNeedsReview: raw.showNeedsReview,
  };
}

export type CandidateProfileDocument = Readonly<{
  kind: "candidate_profile"; schema_version: "1.0.0"; id: string; version: number;
  owner_id: string; state: "confirmed"; residence_country: string | null;
  timezone: string | null; skills: readonly unknown[]; experience: readonly unknown[];
  languages: readonly unknown[]; education: readonly unknown[];
  certifications: readonly unknown[]; authorizations: readonly unknown[];
  warnings: readonly string[]; evidence: readonly unknown[];
}>;

export type SearchProfileDocument = Readonly<{
  kind: "search_profile"; schema_version: "1.0.0"; id: string; version: number;
  owner_id: string; candidate_profile_id: string; candidate_profile_version: number;
  target_roles: readonly string[]; seniority_preferences: readonly string[];
  employment_types: readonly EmploymentType[];
  availability: Readonly<{ timezone: string | null; local_windows: readonly unknown[] }>;
  zero_mandatory_attendance: boolean; allow_relocation: false;
  minimum_compensation: ManualProfileInput["minimumCompensation"];
  excluded_companies: readonly string[]; excluded_industries: readonly string[];
  show_needs_review: boolean;
}>;

export type ProfileDocuments = Readonly<{
  candidate: CandidateProfileDocument;
  search: SearchProfileDocument;
}>;

export function buildProfileDocuments(params: Readonly<{
  userId: string; version: number; input: ManualProfileInput;
}>): ProfileDocuments {
  const { userId, version, input } = params;
  const candidateId = `cp_${userId.slice(2)}_${version}`;
  const searchId = `sp_${userId.slice(2)}_${version}`;
  return {
    candidate: {
      kind: "candidate_profile", schema_version: "1.0.0", id: candidateId, version,
      owner_id: userId, state: "confirmed",
      residence_country: input.residenceCountry, timezone: input.timezone,
      skills: [], experience: [], languages: [], education: [],
      certifications: [], authorizations: [], warnings: [], evidence: [],
    },
    search: {
      kind: "search_profile", schema_version: "1.0.0", id: searchId, version,
      owner_id: userId, candidate_profile_id: candidateId, candidate_profile_version: version,
      target_roles: input.targetRoles, seniority_preferences: [],
      employment_types: input.employmentTypes,
      availability: {
        timezone: input.timezone,
        local_windows: input.availabilityWindows.map(window => ({
          weekdays: window.weekdays, start: window.start, end: window.end,
          crosses_midnight: false,
        })),
      },
      zero_mandatory_attendance: input.zeroMandatoryAttendance,
      allow_relocation: false,
      minimum_compensation: input.minimumCompensation,
      excluded_companies: [], excluded_industries: [],
      show_needs_review: input.showNeedsReview,
    },
  };
}

export type ProfileSnapshot = Readonly<{
  version: number;
  input: ManualProfileInput;
}>;

export function profileFromDocuments(
  candidate: CandidateProfileDocument, search: SearchProfileDocument,
): ProfileSnapshot {
  return {
    version: search.version,
    input: {
      residenceCountry: candidate.residence_country,
      timezone: candidate.timezone,
      targetRoles: [...search.target_roles],
      employmentTypes: [...search.employment_types],
      availabilityWindows: search.availability.local_windows
        .map(window => window as AvailabilityWindow),
      zeroMandatoryAttendance: search.zero_mandatory_attendance,
      minimumCompensation: search.minimum_compensation,
      showNeedsReview: search.show_needs_review,
    },
  };
}

export type { JobSnapshot };
