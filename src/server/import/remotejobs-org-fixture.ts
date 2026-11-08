// RemoteJobs.org adapter mapping + a clearly-labelled CONTRACT FIXTURE (S1-007).
// Live-contract facts from two research requests on 2026-11-07 (the rights review's 50
// jobs without a filter, then the implementation's 50 with workArrangement=remote; both
// kept out of the repository) and the API page of that day:
// - id is a UUID; url and apply_url are the same https://remotejobs.org/remote-jobs/<slug>
//   listing ("Both point to the job's RemoteJobs.org page").
// - posted_at is ISO 8601 with an offset. The first sample carried only dates (a zero
//   time), the second real times: a zero time is recorded as day precision, never
//   replaced by an invented one.
// - Salary bounds are native, each may be null, with a currency and a period (hour, day,
//   week, month, year) that may be null: never converted or annualized.
// - applicant_location_requirements is their pipeline's reading of the whole posting
//   (an LLM step is named in its extraction_version): ISO countries and subdivisions,
//   regions, conditions and a status (known, partial, unknown, conflicting). It can be
//   empty or null ("no valid current interpretation"). Bare "Remote" is not worldwide.
// - workArrangement=remote matches applicant_location_requirements.work_arrangement or
//   location_normalization.work_arrangement (two of the 50 had only the second).
// - description is sanitized HTML with a RemoteJobs.org application link appended; the
//   link is the source's line, not the employer's, and is left out of the stored text.
// The fixture records below are synthetic.
import type {
  Evidence, Geography, HiringOption, JobSnapshot, Workplace,
} from "../../domain/source-contracts.ts";
import { AdapterInputError, descriptionToText } from "./himalayas-fixture.ts";
import { worldwideUnlessTextSays } from "./geography-text.ts";
import { readTravel, withTravel } from "./travel-text.ts";
import { readOfficeVocabulary, remoteFirstJobsExcerptOf } from "./remote-first-jobs-fixture.ts";

export type RemoteJobsOrgCondition = Readonly<{
  kind?: string | null;
  effect?: string | null;
  details?: string | null;
}>;

export type RemoteJobsOrgApplicantLocation = Readonly<{
  scope?: string | null;
  status?: string | null;
  work_arrangement?: string | null;
  allowed_countries?: readonly string[] | null;
  excluded_countries?: readonly string[] | null;
  allowed_subdivisions?: readonly string[] | null;
  excluded_subdivisions?: readonly string[] | null;
  regions?: readonly string[] | null;
  allowed_regions?: readonly string[] | null;
  conditions?: readonly RemoteJobsOrgCondition[] | null;
  unresolved?: readonly string[] | null;
  worldwide_permission_verified?: boolean | null;
}>;

export type RemoteJobsOrgRawRecord = Readonly<{
  id: string;
  title: string;
  url: string;
  apply_url?: string | null;
  company: Readonly<{ name: string; logo_url?: string | null; website?: string | null; url?: string | null }>;
  location?: string | null;
  location_normalization?: Readonly<{ work_arrangement?: string | null }> | null;
  applicant_location_requirements?: RemoteJobsOrgApplicantLocation | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_text?: string | null;
  salary_source_text?: string | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  type?: string | null;
  employment_types?: readonly string[] | null;
  description: string;
  posted_at: string;
  is_translated?: boolean | null;
  original_language?: string | null;
}>;

const LISTING = "https://remotejobs.org/remote-jobs/";
// The line the source appends to every description, as descriptionToText renders it.
const APPENDED_APPLY_LINE = /\s*Apply directly on RemoteJobs\.org: https:\/\/remotejobs\.org\/remote-jobs\/[a-z0-9-]{1,200}$/u;
const NO_CONDITIONS = { conditions: [], unresolved: [], regions: [], allowed_regions: [] } as const;

export const remoteJobsOrgContractFixture: readonly RemoteJobsOrgRawRecord[] = [
  {
    id: "5f0c1e2a-7b3d-4c8e-9a10-000000900201",
    title: "Platform Engineer (synthetic fixture)",
    url: `${LISTING}platform-engineer-synthetic-fixture-northwind`,
    apply_url: `${LISTING}platform-engineer-synthetic-fixture-northwind`,
    company: { name: "Northwind Fixtures", logo_url: null, website: null, url: null },
    location: "United States, Canada",
    location_normalization: { work_arrangement: "unknown" },
    applicant_location_requirements: {
      scope: "restricted", status: "known", work_arrangement: "remote",
      allowed_countries: ["US", "CA"], excluded_countries: [],
      allowed_subdivisions: [], excluded_subdivisions: [],
      worldwide_permission_verified: false, ...NO_CONDITIONS,
    },
    salary_min: 120000, salary_max: 150000, salary_text: "USD 120,000–150,000/year",
    salary_source_text: "$120,000 - $150,000", salary_currency: "USD", salary_period: "year",
    type: "Full-time", employment_types: ["FULL_TIME"],
    description:
      "<h2>Platform Engineer</h2><p>Synthetic contract fixture. The team works " +
      "asynchronously across time zones.</p><ul><li>Operate the platform</li></ul>" +
      `<p>Apply directly on <a href="https://remotejobs.org">RemoteJobs.org</a>: ${LISTING}platform-engineer-synthetic-fixture-northwind</p>`,
    posted_at: "2026-11-06T00:00:00+00:00",
    is_translated: false, original_language: null,
  },
  {
    id: "5f0c1e2a-7b3d-4c8e-9a10-000000900202",
    title: "Account Manager (synthetic fixture)",
    url: `${LISTING}account-manager-synthetic-fixture-harbor`,
    apply_url: `${LISTING}account-manager-synthetic-fixture-harbor`,
    company: { name: "Harbor Fixtures", logo_url: null, website: null, url: null },
    location: "Germany",
    location_normalization: { work_arrangement: "unknown" },
    applicant_location_requirements: {
      scope: "restricted", status: "known", work_arrangement: "remote",
      allowed_countries: ["DE"], excluded_countries: [],
      allowed_subdivisions: [], excluded_subdivisions: [],
      worldwide_permission_verified: false, ...NO_CONDITIONS,
    },
    salary_min: null, salary_max: null, salary_text: null, salary_source_text: null,
    salary_currency: null, salary_period: "year",
    type: "Full-time", employment_types: ["FULL_TIME"],
    description: "<p>Synthetic contract fixture. This is a hybrid role: three days per week in our Munich office.</p>",
    posted_at: "2026-11-06T21:40:24+00:00",
    is_translated: false, original_language: null,
  },
  {
    id: "5f0c1e2a-7b3d-4c8e-9a10-000000900203",
    title: "Support Specialist (synthetic fixture)",
    url: `${LISTING}support-specialist-synthetic-fixture-cobalt`,
    apply_url: `${LISTING}support-specialist-synthetic-fixture-cobalt`,
    company: { name: "Cobalt Fixtures", logo_url: null, website: null, url: null },
    location: "Canada",
    location_normalization: { work_arrangement: "unknown" },
    applicant_location_requirements: {
      scope: "restricted", status: "partial", work_arrangement: "remote",
      allowed_countries: ["CA"], excluded_countries: [],
      allowed_subdivisions: [], excluded_subdivisions: ["CA-QC"],
      worldwide_permission_verified: false,
      conditions: [{ kind: "timezone", effect: "require", details: "Available 9 am to 5 pm Eastern Time" }],
      unresolved: [], regions: [], allowed_regions: [],
    },
    salary_min: 25, salary_max: 30, salary_text: "CAD 25–30/hour", salary_source_text: "CAD 25 - 30",
    salary_currency: "CAD", salary_period: "hour",
    type: "Contract", employment_types: ["CONTRACTOR"],
    description: "<p>Synthetic contract fixture. Answer customer tickets; occasional visits to the Toronto office.</p>",
    posted_at: "2026-11-07T04:52:01+00:00",
    is_translated: false, original_language: null,
  },
];

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SLUG_PATH = /^\/remote-jobs\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SLUG_PATH_MAX = 220;
const POSTED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/u;
const ISO_COUNTRY = /^[A-Z]{2}$/u;
const ISO_SUBDIVISION = /^[A-Z]{2}-[A-Z0-9]{1,3}$/u;
const ISO_CURRENCY = /^[A-Z]{3}$/u;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u;
const LANGUAGE = /^[a-z]{2}$/u;
const QUOTE_CHARS = 500;
const PERIODS: Readonly<Record<string, "hourly" | "daily" | "weekly" | "monthly" | "annual">> = {
  hour: "hourly", day: "daily", week: "weekly", month: "monthly", year: "annual",
};
// Google JobPosting classifications; VOLUNTEER, PER_DIEM and OTHER have no contract here.
const EMPLOYMENT: Readonly<Record<string, HiringOption["employment_types"][number]>> = {
  FULL_TIME: "employment_full_time", PART_TIME: "employment_part_time",
  CONTRACTOR: "contractor", TEMPORARY: "temporary", INTERN: "internship",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quoteOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, QUOTE_CHARS);
}

// A list the contract defines: absent or null is empty; anything else must be an array of
// strings of the given form, or the record is refused.
function listOf(value: unknown, pattern: RegExp | null, code: string): readonly string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every(item => typeof item === "string" && (pattern === null || pattern.test(item)))) {
    throw new AdapterInputError(code);
  }
  return [...new Set(value as string[])];
}

// The source's remote claim (owner decision 2 of 2026-11-07): only workArrangement=remote
// is requested, so each record must carry it in one of the two fields the filter reads. A
// field that says hybrid or onsite contradicts the claim; a record with neither field
// remote is outside what was requested and is refused.
function sourceArrangementOf(raw: RemoteJobsOrgRawRecord): Readonly<{
  remoteField: string | null; officeField: Readonly<{ path: string; value: string }> | null;
}> {
  const fields: [string, unknown][] = [
    ["applicant_location_requirements.work_arrangement", isObject(raw.applicant_location_requirements)
      ? raw.applicant_location_requirements.work_arrangement : undefined],
    ["location_normalization.work_arrangement", isObject(raw.location_normalization)
      ? raw.location_normalization.work_arrangement : undefined],
  ];
  const remoteField = fields.find(([, value]) => value === "remote")?.[0] ?? null;
  const office = fields.find(([, value]) => value === "hybrid" || value === "onsite");
  return { remoteField, officeField: office ? { path: office[0], value: String(office[1]) } : null };
}

// The workplace: the source's structured remote claim, under our office-vocabulary veto
// (the Remote First Jobs rule, B65). Errors may only run toward hiding a remote posting:
//   1. the source's own hybrid/onsite field, or an office statement in the title or text,
//      excludes the posting (an unresolved contradiction, spec 10.3);
//   2. any other office word sends it to needs-review;
//   3. only then does the source's remote field confirm it.
export function remoteJobsOrgWorkplace(raw: RemoteJobsOrgRawRecord, text: string, recordId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  const { remoteField, officeField } = sourceArrangementOf(raw);
  if (remoteField === null) throw new AdapterInputError("NOT_REMOTE");
  const veto = readOfficeVocabulary(raw.title, text);
  const office = officeField?.value ?? veto.office;
  const officeWord = office === null ? veto.officeWord : null;
  const confirmed = office === null && officeWord === null;
  const evidenceId = `ev:${recordId}:workplace`;
  return {
    workplace: {
      type: "remote",
      permanence: office !== null ? "unknown" : veto.temporary !== null ? "temporary" : "permanent",
      mandatory_onsite: office !== null ? "required" : officeWord !== null ? "unknown" : "not_stated",
      mandatory_travel: "not_stated",
      optional_offsites: null,
      verification_state: office !== null ? "conflicting" : confirmed ? "confirmed" : "unknown",
      evidence_ids: [evidenceId],
    },
    conflict: officeField !== null ? "remote-claim-vs-source-arrangement"
      : office !== null ? "remote-claim-vs-office-text" : null,
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId, origin_version: 1,
      field_path: confirmed ? remoteField : officeField?.path ?? "title+description",
      quote: confirmed ? veto.temporary ?? "remote" : office ?? officeWord,
      method: confirmed || officeField !== null ? "source_field" : "rule",
      confidence: confirmed ? 0.8 : officeWord !== null ? 0.5 : 0.9,
    },
  };
}

// Hiring geography from the source's structured reading (owner decision 3 of 2026-11-07),
// with its status, and never wider than it says:
// - excluded countries always stay (an exclusion only narrows);
// - worldwide only when the source marks it verified and known with nothing beside it:
//   no listed country, region, subdivision, unresolved note or limiting condition (our
//   geography cannot carve a state out of the world); then it is tested against the text
//   like every worldwide claim; any other worldwide reading is unspecified;
// - a restricted list counts only when its status is known or partial and the source
//   left nothing unresolved: an unresolved note is a limit it could not express (in the
//   sample "Charlotte, NC or nearby", a residency doubt), so no country passes then. The
//   same holds for a condition that is neither context nor a working-hours requirement
//   (in the sample "Current and unrestricted Nurse Practitioner license in Utah"): its
//   words are kept as evidence;
// - the list is the whole list only when known with nothing beside it (no subdivision or
//   region). A country named with subdivisions, allowed or excluded, is not a
//   whole-country permission: it leaves the list, so a candidate there is unknown.
function geographyOf(raw: RemoteJobsOrgRawRecord, text: string, recordId: string): {
  geography: Geography; evidence: readonly Evidence[]; conflict: string | null;
} {
  const evidenceId = `ev:${recordId}:geo`;
  const location = raw.applicant_location_requirements;
  if (location !== undefined && location !== null && !isObject(location)) {
    throw new AdapterInputError("INVALID_GEOGRAPHY");
  }
  const read: RemoteJobsOrgApplicantLocation = location ?? {};
  const allowed = listOf(read.allowed_countries, ISO_COUNTRY, "INVALID_GEOGRAPHY");
  const excluded = listOf(read.excluded_countries, ISO_COUNTRY, "INVALID_GEOGRAPHY");
  const allowedSubdivisions = listOf(read.allowed_subdivisions, ISO_SUBDIVISION, "INVALID_GEOGRAPHY");
  const excludedSubdivisions = listOf(read.excluded_subdivisions, ISO_SUBDIVISION, "INVALID_GEOGRAPHY");
  const regions = [...listOf(read.regions, null, "INVALID_GEOGRAPHY"), ...listOf(read.allowed_regions, null, "INVALID_GEOGRAPHY")];
  const unresolved = listOf(read.unresolved, null, "INVALID_GEOGRAPHY");
  const limits = conditionsOf(raw).filter(condition => condition.effect !== "context" &&
    !(condition.kind === "timezone" && condition.effect === "require"));
  const regionText = quoteOf(raw.location);
  const status = typeof read.status === "string" ? read.status : null;
  const sourceEvidence: Evidence = {
    id: evidenceId, origin_type: "job_source", origin_id: recordId, origin_version: 1,
    field_path: "applicant_location_requirements", quote: regionText, method: "source_field",
    confidence: status === "known" ? 0.9 : status === "partial" ? 0.7 : 0.5,
  };
  const limitEvidence: Evidence | null = limits.length === 0 ? null : {
    id: `${evidenceId}:conditions`, origin_type: "job_source", origin_id: recordId, origin_version: 1,
    field_path: "applicant_location_requirements.conditions",
    quote: limits.map(condition => quoteOf(condition.details) ?? `${String(condition.kind)} ${String(condition.effect)}`)
      .join(" | ").slice(0, QUOTE_CHARS),
    method: "source_field", confidence: 0.7,
  };
  const evidence = limitEvidence === null ? [sourceEvidence] : [sourceEvidence, limitEvidence];
  const evidenceIds = evidence.map(item => item.id);
  const unspecified: Geography = {
    scope: "unspecified", allowed_countries: [], excluded_countries: [...excluded],
    allowed_subdivisions: [], region_text: regionText, exhaustive: false, evidence_ids: evidenceIds,
  };
  if (read.scope === "worldwide") {
    if (read.worldwide_permission_verified !== true || status !== "known" || unresolved.length > 0 ||
      limits.length > 0 || allowed.length > 0 || regions.length > 0 ||
      allowedSubdivisions.length > 0 || excludedSubdivisions.length > 0) {
      return { geography: unspecified, evidence, conflict: null };
    }
    const tested = worldwideUnlessTextSays(text, sourceEvidence, () => "description");
    const narrowed = [...new Set([...tested.geography.excluded_countries, ...excluded])];
    return {
      geography: { ...tested.geography, excluded_countries: narrowed },
      evidence: tested.evidence, conflict: tested.conflict,
    };
  }
  if (read.scope !== "restricted") return { geography: unspecified, evidence, conflict: null };
  const listed = (status === "known" || status === "partial") && unresolved.length === 0 && limits.length === 0;
  const withSubdivisions = new Set([...allowedSubdivisions, ...excludedSubdivisions].map(code => code.slice(0, 2)));
  const whole = listed ? allowed.filter(code => !withSubdivisions.has(code) && !excluded.includes(code)) : [];
  const exhaustive = listed && status === "known" && whole.length > 0 && whole.length === allowed.length &&
    allowedSubdivisions.length === 0 && excludedSubdivisions.length === 0 && regions.length === 0;
  return {
    geography: {
      scope: "restricted", allowed_countries: whole, excluded_countries: [...excluded],
      allowed_subdivisions: listed ? [...allowedSubdivisions] : [], region_text: regionText,
      exhaustive, evidence_ids: evidenceIds,
    },
    evidence,
    conflict: null,
  };
}

// The conditions of the applicant reading: absent or null is none; anything else must be
// a list of objects, or the record is refused.
function conditionsOf(raw: RemoteJobsOrgRawRecord): readonly RemoteJobsOrgCondition[] {
  const location = raw.applicant_location_requirements;
  const conditions = isObject(location) ? location.conditions : undefined;
  if (conditions === undefined || conditions === null) return [];
  if (!Array.isArray(conditions) || !conditions.every(isObject)) throw new AdapterInputError("INVALID_GEOGRAPHY");
  return conditions;
}

// A working-hours requirement the source found but could not express as offsets: the
// schedule is unknown and ambiguous (TIME-01 unknown), with the source's words, never
// "not stated". Context conditions ("flexible hours") are not requirements.
function scheduleOf(raw: RemoteJobsOrgRawRecord, recordId: string): {
  schedule: HiringOption["schedule"]; evidence: Evidence | null;
} {
  const required = conditionsOf(raw).filter(condition => condition.kind === "timezone" && condition.effect === "require")
    .map(condition => quoteOf(condition.details) ?? "timezone requirement");
  const notStated: HiringOption["schedule"] = {
    status: "not_stated", timezone: null, zone_semantics: "not_stated",
    mode: "not_stated", local_windows: [], required_overlap_minutes: null,
    accepted_utc_offsets_minutes: [], original_text: null, evidence_ids: [],
  };
  if (required.length === 0) return { schedule: notStated, evidence: null };
  const evidenceId = `ev:${recordId}:schedule`;
  const quote = required.join(" | ").slice(0, QUOTE_CHARS);
  return {
    schedule: {
      ...notStated, status: "unknown", zone_semantics: "ambiguous", mode: "unknown",
      original_text: quote, evidence_ids: [evidenceId],
    },
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId, origin_version: 1,
      field_path: "applicant_location_requirements.conditions", quote, method: "source_field", confidence: 0.7,
    },
  };
}

function amountOf(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !DECIMAL.test(String(value))) {
    throw new AdapterInputError("INVALID_SALARY");
  }
  return value;
}

function codeOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new AdapterInputError("INVALID_SALARY");
  return value;
}

// Native bounds in their own currency and period (owner decision, as the API page says:
// "Amounts are not annualized or converted"). A range is structured only when its
// currency and period are both known; otherwise the source's wording is kept as text.
function compensationOf(raw: RemoteJobsOrgRawRecord, recordId: string): {
  compensation: JobSnapshot["compensation"]; evidence: Evidence | null;
} {
  const min = amountOf(raw.salary_min);
  const max = amountOf(raw.salary_max);
  if (min !== null && max !== null && min > max) throw new AdapterInputError("INVALID_SALARY");
  const currencyCode = codeOf(raw.salary_currency);
  const periodCode = codeOf(raw.salary_period);
  const currency = currencyCode !== null && ISO_CURRENCY.test(currencyCode) ? currencyCode : null;
  const period = periodCode !== null ? PERIODS[periodCode] ?? null : null;
  if (min === null && max === null) {
    return { compensation: { ranges: [], original_text: null, evidence_ids: [] }, evidence: null };
  }
  const evidenceId = `ev:${recordId}:comp`;
  const structured = currency !== null && period !== null;
  const original = quoteOf(raw.salary_text) ?? quoteOf(raw.salary_source_text) ??
    `${min ?? "?"}–${max ?? "?"}${currency ? ` ${currency}` : ""}${periodCode ? ` / ${periodCode}` : ""}`;
  return {
    compensation: {
      ranges: structured ? [{
        min: min === null ? null : String(min), max: max === null ? null : String(max),
        currency, period: period!, tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [evidenceId],
      }] : [],
      original_text: original,
      evidence_ids: [evidenceId],
    },
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId, origin_version: 1,
      field_path: "salary_min,salary_max,salary_currency,salary_period", quote: original,
      method: "source_field", confidence: structured ? 1 : 0.5,
    },
  };
}

function employmentTypesOf(raw: RemoteJobsOrgRawRecord): HiringOption["employment_types"] {
  const types = listOf(raw.employment_types, null, "INVALID_EMPLOYMENT_TYPES");
  const mapped = [...new Set(types.map(type => EMPLOYMENT[type] ?? "unknown"))];
  return mapped.length === 0 ? ["unknown"] : mapped;
}

// The posting timestamp with its offset. A zero time is how the source writes a date
// alone: it is kept as given and recorded as day precision, never given a time.
function postedAtOf(value: unknown, recordId: string): { publishedAt: string; evidence: Evidence | null } {
  if (typeof value !== "string") throw new AdapterInputError("INVALID_PUB_DATE");
  const match = POSTED_AT.exec(value);
  if (!match) throw new AdapterInputError("INVALID_PUB_DATE");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as
    [number, number, number, number, number, number];
  // Date rolls an impossible calendar value over ("02-30" becomes "03-02"): refuse it.
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new AdapterInputError("INVALID_PUB_DATE");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AdapterInputError("INVALID_PUB_DATE");
  const dateOnly = hour === 0 && minute === 0 && second === 0 && !/\.\d*[1-9]/u.test(value);
  return {
    publishedAt: date.toISOString(),
    evidence: dateOnly ? {
      id: `ev:${recordId}:posted`, origin_type: "job_source", origin_id: recordId, origin_version: 1,
      field_path: "posted_at", quote: `${value} (day precision: no time given)`,
      method: "source_field", confidence: 1,
    } : null,
  };
}

function listingUrlOf(raw: RemoteJobsOrgRawRecord): URL {
  let listing: URL;
  try {
    listing = new URL(raw.url);
  } catch {
    throw new AdapterInputError("INVALID_URL");
  }
  if (listing.protocol !== "https:" || listing.host !== "remotejobs.org" ||
    listing.port !== "" || listing.username !== "" || listing.password !== "") {
    throw new AdapterInputError("INVALID_URL_HOST");
  }
  // URL parsing drops an empty "?" or "#", so the raw string is checked.
  if (raw.url.includes("?") || raw.url.includes("#") || listing.pathname.length > SLUG_PATH_MAX ||
    !SLUG_PATH.test(listing.pathname) || listing.href !== raw.url) {
    throw new AdapterInputError("INVALID_URL_PATH");
  }
  // The application link is the same listing (the API page); another one is refused,
  // so the link a card shows is always the source's application route, intact.
  if (raw.apply_url !== undefined && raw.apply_url !== null && raw.apply_url !== raw.url) {
    throw new AdapterInputError("INVALID_APPLY_URL");
  }
  return listing;
}

export function mapRemoteJobsOrgRecord(raw: RemoteJobsOrgRawRecord, fetchedAt: string): JobSnapshot {
  // A null or a scalar in the page is one bad record, not a failed run.
  if (!isObject(raw)) throw new AdapterInputError("INVALID_RECORD");
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) throw new AdapterInputError("INVALID_ID");
  if (typeof raw.url !== "string") throw new AdapterInputError("INVALID_URL");
  const listing = listingUrlOf(raw);
  if (typeof raw.title !== "string" || raw.title.trim().length === 0) throw new AdapterInputError("EMPTY_TITLE");
  if (!isObject(raw.company) || typeof raw.company.name !== "string" || raw.company.name.trim().length === 0) {
    throw new AdapterInputError("EMPTY_COMPANY");
  }
  if (typeof raw.description !== "string") throw new AdapterInputError("EMPTY_DESCRIPTION");
  const text = descriptionToText(raw.description).replace(APPENDED_APPLY_LINE, "");
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");

  const id = `remotejobs_org:${raw.id}`;
  const posted = postedAtOf(raw.posted_at, id);
  const workplace = remoteJobsOrgWorkplace(raw, text, id);
  const geo = geographyOf(raw, text, id);
  const schedule = scheduleOf(raw, id);
  const pay = compensationOf(raw, id);
  const employmentTypes = employmentTypesOf(raw);
  const title = raw.title.trim();
  // Required travel from the title and text (B64-001); the profile decides what it means.
  const travelled = withTravel(workplace.workplace, [
    ...geo.evidence, workplace.evidence,
    ...[schedule.evidence, pay.evidence, posted.evidence].filter((item): item is Evidence => item !== null),
  ], readTravel(title, text), id);
  // The text is the source's English unless it records another original language and
  // was not translated.
  const language = raw.is_translated !== true && typeof raw.original_language === "string" &&
    LANGUAGE.test(raw.original_language) ? raw.original_language : "en";
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id,
    version: 1,
    source_record_id: id,
    title,
    company_name: raw.company.name.trim(),
    company_domain: null,
    source_url: listing.href,
    apply_url: null, // direct_apply denied; the listing on RemoteJobs.org is the route
    description_text: text,
    description_language: language,
    workplace: travelled.workplace,
    hiring_options: [{
      id: `opt:${id}:1`,
      geography: geo.geography,
      employment_types: employmentTypes,
      authorization: {
        requirement: "none_stated", authorization_type: "none_stated",
        any_of_countries: [], original_text: null, evidence_ids: [],
      },
      schedule: schedule.schedule,
      evidence_ids: [...geo.geography.evidence_ids, ...schedule.schedule.evidence_ids],
    }],
    requirements: [],
    compensation: pay.compensation,
    dates: {
      source_published_at: posted.publishedAt,
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: null,
    },
    lifecycle: "active",
    conflicts: [workplace.conflict, geo.conflict].filter((item): item is string => item !== null),
    evidence: travelled.evidence,
  };
}

/** The card's excerpt: the API gives none, so the start of the text, cut at a word. */
export const remoteJobsOrgExcerptOf: (snapshot: JobSnapshot) => string = remoteFirstJobsExcerptOf;

export function mapRemoteJobsOrgFixture(fetchedAt: string): readonly JobSnapshot[] {
  return remoteJobsOrgContractFixture.map(raw => mapRemoteJobsOrgRecord(raw, fetchedAt));
}
