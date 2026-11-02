// Remote First Jobs adapter mapping + a clearly-labelled CONTRACT FIXTURE (S1-006).
// Live-contract facts from one research request on 2026-11-02 (page 0, 100 jobs):
// id is a lowercase slug, url is https://remotefirstjobs.com/companies/<company>/jobs/<id>,
// published_at is ISO 8601 WITHOUT an offset and is UTC (the newest job was visible
// 44 minutes after the documented 24-hour delay, which no western offset allows),
// salary_min/salary_max are USD per year converted by the source (0 = none), locations
// holds up to 3 country names and is often empty, description is HTML.
// The feed is NOT remote-only: by owner decision 2026-11-02 a posting is confirmed
// remote only by its own words. The fixture records below are synthetic.
import type {
  Evidence, Geography, JobSnapshot, Workplace,
} from "../../domain/source-contracts.ts";
import { AdapterInputError, descriptionToText } from "./himalayas-fixture.ts";
import { countryCodeOf } from "./geography-text.ts";

export type RemoteFirstJobsRawRecord = Readonly<{
  id: string;
  url: string;
  company_name: string;
  company_logo?: string | null;
  title: string;
  category?: string | null;
  seniority?: string | null;
  description: string;
  salary_min?: number | null;
  salary_max?: number | null;
  locations?: readonly string[] | null;
  published_at: string;
}>;

export const remoteFirstJobsContractFixture: readonly RemoteFirstJobsRawRecord[] = [
  {
    id: "platform-engineer-synthetic-fixture-900101",
    url: "https://remotefirstjobs.com/companies/northwind-fixtures/jobs/platform-engineer-synthetic-fixture-900101",
    company_name: "Northwind Fixtures",
    company_logo: null,
    title: "Platform Engineer (Remote, synthetic fixture)",
    category: "software_development",
    seniority: "senior",
    description:
      "<p>Synthetic contract fixture. This is a fully remote position: the team works " +
      "asynchronously across time zones.</p><ul><li>Operate the platform</li></ul>",
    salary_min: 120000,
    salary_max: 150000,
    locations: ["United States", "Canada"],
    published_at: "2026-11-01T13:30:55",
  },
  {
    id: "account-manager-synthetic-fixture-900102",
    url: "https://remotefirstjobs.com/companies/harbor-fixtures/jobs/account-manager-synthetic-fixture-900102",
    company_name: "Harbor Fixtures",
    company_logo: null,
    title: "Account Manager (synthetic fixture)",
    category: "sales",
    seniority: "middle",
    description:
      "<p>Synthetic contract fixture. This is a hybrid role: three days per week in our " +
      "Munich office.</p>",
    salary_min: 0,
    salary_max: 0,
    locations: ["Germany"],
    published_at: "2026-11-01T09:00:00",
  },
  {
    id: "data-analyst-synthetic-fixture-900103",
    url: "https://remotefirstjobs.com/companies/cobalt-fixtures/jobs/data-analyst-synthetic-fixture-900103",
    company_name: "Cobalt Fixtures",
    company_logo: null,
    title: "Data Analyst (synthetic fixture)",
    category: "data",
    seniority: "middle",
    description: "<p>Synthetic contract fixture. You will build dashboards for the finance team.</p>",
    salary_min: null,
    salary_max: null,
    locations: [""],
    published_at: "2026-10-31T19:03:18",
  },
];

const ID_PATTERN = /^[a-z0-9-]{1,120}$/u;
const PUBLISHED_AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/u;
const EXCERPT_CHARS = 300;

// The rule has three tiers (owner decision 2026-11-02, review H1). Errors may only run
// toward hiding a remote posting, never toward showing an office one as remote.
//   1. An office STATEMENT (title or text) excludes the posting, even beside a remote
//      statement: an unresolved contradiction is quarantined (spec 10.3).
//   2. Any other office WORD blocks confirmation: the posting goes to needs-review.
//   3. Only then does a remote statement confirm it.
// "Hybrid cloud", "hybrid apps" and the like are not a work mode.
const HYBRID = String.raw`hybrid(?![- ](?:cloud|it\b|infrastructure|apps?\b|mobile\b|networks?\b|search\b))`;
const NEGATED_REMOTE = [
  /\bnon[- ]?remote\b/iu,
  /\bnot\s+(?:(?:a|an|100\s?%|fully|completely|entirely)\s+){0,2}remote\b/iu,
] as const;
const OFFICE_TITLE = [
  new RegExp(String.raw`\b(?:${HYBRID}|on[- ]?site|in[- ]office|office[- ]based)\b`, "iu"),
  ...NEGATED_REMOTE,
] as const;
const OFFICE_STATEMENTS = [
  /\bhybrid (?:role|position|job|work|working|schedule|model|setup|set-up|arrangement|policy|opportunity)\b/iu,
  /\b(?:role|position|job) is hybrid\b/iu,
  /\b(?:on[- ]?site|in[- ]office|in[- ]person) (?:role|position|job)\b/iu,
  /\b(?:days?|times?) (?:a|per|each) week (?:in|at|from) (?:the |our |an? )?[^.]{0,40}?\boffice\b/iu,
  /\boffice\b[^.]{0,40}?\b(?:[1-5]|one|two|three|four|five) days? (?:a|per|each) week\b/iu,
  /\bin[- ]office (?:\w+ )?(?:days?|requirement|presence|attendance)\b/iu,
  // An obligation, not a history or a joke: "one year of work onsite in Germany" is
  // experience, and "don't ask to work in our office (we don't have one)" is remote.
  /\b(?:will|must|(?:required|expected|needs?) to) (?:work|be|report) (?:on[- ]?site|in[- ]office|in (?:the|our) office)\b/iu,
  /\bin[- ]person \d+ days?\b/iu,
  ...NEGATED_REMOTE,
] as const;
// ANY office vocabulary blocks a confirmation and sends the posting to a human. Listing
// office phrasings one by one always missed some ("work from our London office", "the
// Berlin HQ", "commute to", "relocation"), so the word itself is enough. "Microsoft
// Office" or "Office Manager" go to review too, which is the allowed direction; "your
// home office" does not.
const OFFICE_WORDS = [
  new RegExp(String.raw`\b${HYBRID}\b`, "iu"),
  /\bon[- ]?site\b/iu,
  /(?<!\bhome[- ]?)\boffices?\b/iu,
  /\bin[- ]person\b/iu,
  /\bcommut\w*/iu,
  /\brelocat\w*/iu,
  /\b(?:hq|headquarters)\b/iu,
  /\bpartially remote\b/iu,
  /\bwork(?:ing)? from home (?:\d|one|two|three|four|five)\b/iu,
] as const;
// The title's remote LABEL: "(Remote)", "[Remote]", "- Remote" at the end, "· Remote",
// "Remote/Travel", "- 100% Remote - US". A word that starts a job name ("Remote Sensing
// Scientist") or a compound ("Remote-First Company", "Remote-friendly") is not one.
const REMOTE_TITLE = /(?:^|[([|,/·-]\s*|\b(?:fully|100\s?%)\s+)remote(?=\s*$|\s*[)\]|,/·]|\s+-)/iu;
// Remote statements in the text about this posting's work mode. "Remote-first" is a
// company's culture, not this role's arrangement, and does not confirm on its own.
const REMOTE_TEXT = [
  /\b(?:fully|100\s?%|completely|entirely|permanently)[ -]remote\b/iu,
  /\bremote[- ]only\b/iu,
  /\bwork(?:ing)? from anywhere\b/iu,
  /\b(?:this|the) (?:role|position|job|opportunity) is (?:a )?(?:fully )?remote\b/iu,
  /\bremote (?:role|position|job|opportunity)\b/iu,
  /\blocation\s*:\s*(?:fully\s+)?remote\b/iu,
] as const;
const TEMPORARY_TEXT = [/\bremote until .{0,40}office/iu, /\btemporarily remote\b/iu] as const;

// Unicode hyphens and dashes read as "-" and a soft hyphen as nothing, so "on\u2011site"
// (U+2011) or "on\u00adsite" cannot pass patterns written with an ASCII hyphen. The
// evidence quote is taken from this folded text.
function foldDashes(text: string): string {
  return text.replace(/\u00ad/gu, "").replace(/[\u2010-\u2015\u2212]/gu, "-");
}

function firstMatch(patterns: readonly RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return null;
}

// The feed's name ("Remote Jobs API") is the source's claim that a posting is remote;
// the posting's own words decide whether that claim is confirmed, contradicted or open.
function workplaceFor(rawTitle: string, rawText: string, evidenceId: string, recordId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  const title = foldDashes(rawTitle);
  const text = foldDashes(rawText);
  const office = firstMatch(OFFICE_TITLE, title) ?? firstMatch(OFFICE_STATEMENTS, text);
  const officeWord = office === null
    ? firstMatch(OFFICE_WORDS, title) ?? firstMatch(OFFICE_WORDS, text)
    : null;
  const remote = office === null && officeWord === null
    ? REMOTE_TITLE.exec(title)?.[0]?.replace(/^[([|,/·-]?\s*/u, "") ?? firstMatch(REMOTE_TEXT, text)
    : null;
  const temporary = remote !== null && firstMatch(TEMPORARY_TEXT, text) !== null;
  const state: Workplace["verification_state"] =
    office !== null ? "conflicting" : remote !== null ? "confirmed" : "unknown";
  const quote = office ?? officeWord ?? remote;
  return {
    workplace: {
      type: "remote",
      // An office word leaves the source's claim unverified (needs-review), not refuted.
      permanence: office !== null ? "unknown" : temporary ? "temporary" : "permanent",
      mandatory_onsite: office !== null ? "required" : officeWord !== null ? "unknown" : "not_stated",
      mandatory_travel: "not_stated",
      optional_offsites: null,
      verification_state: state,
      evidence_ids: [evidenceId],
    },
    conflict: office !== null ? "remote-claim-vs-office-text" : null,
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId,
      origin_version: 1,
      field_path: quote !== null ? "title+description" : "feed:remote-jobs-api",
      quote,
      method: "rule",
      confidence: state === "unknown" ? 0.5 : 0.9,
    },
  };
}

// Up to three country names. They are never a complete list (the feed caps them at
// three), so a candidate elsewhere is unknown, never failed; empty is unspecified,
// never worldwide (the feed does not define it as worldwide).
function geographyFor(raw: RemoteFirstJobsRawRecord, evidenceId: string, recordId: string): {
  geography: Geography; evidence: Evidence;
} {
  if (raw.locations != null && (!Array.isArray(raw.locations) ||
    !raw.locations.every(name => typeof name === "string"))) {
    throw new AdapterInputError("INVALID_LOCATIONS");
  }
  const names = [...new Set((raw.locations ?? []).map(name => name.trim()).filter(name => name.length > 0))];
  const codes = names.map(name => countryCodeOf(name)).filter((code): code is string => code !== null);
  const evidence: Evidence = {
    id: evidenceId, origin_type: "job_source", origin_id: recordId,
    origin_version: 1, field_path: "locations",
    quote: names.length > 0 ? names.join(", ") : null, method: "source_field", confidence: 1,
  };
  const geography: Geography = names.length === 0
    ? {
        scope: "unspecified", allowed_countries: [], excluded_countries: [],
        allowed_subdivisions: [], region_text: null, exhaustive: false, evidence_ids: [evidenceId],
      }
    : {
        scope: "restricted", allowed_countries: [...new Set(codes)], excluded_countries: [],
        allowed_subdivisions: [], region_text: names.join(", "), exhaustive: false,
        evidence_ids: [evidenceId],
      };
  return { geography, evidence };
}

function salaryOf(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AdapterInputError("INVALID_SALARY");
  }
  return value === 0 ? null : value;
}

function publishedAtOf(value: unknown): string {
  if (typeof value !== "string") throw new AdapterInputError("INVALID_PUB_DATE");
  const match = PUBLISHED_AT.exec(value);
  if (!match) throw new AdapterInputError("INVALID_PUB_DATE");
  // Date rolls an impossible calendar time over ("02-30" becomes "03-02"): refuse it.
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as
    [number, number, number, number, number, number];
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new AdapterInputError("INVALID_PUB_DATE");
  }
  // No offset is the live contract and is read as UTC (an assumption: the live check
  // rules out western offsets only); Date would read it as local time.
  const date = new Date(match[7] === undefined ? `${value}Z` : value);
  if (Number.isNaN(date.getTime())) throw new AdapterInputError("INVALID_PUB_DATE");
  return date.toISOString();
}

export function mapRemoteFirstJobsRecord(raw: RemoteFirstJobsRawRecord, fetchedAt: string): JobSnapshot {
  // A null or a scalar in the page is one bad record, not a failed run.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdapterInputError("INVALID_RECORD");
  }
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    throw new AdapterInputError("INVALID_ID");
  }
  let listingUrl: URL;
  try {
    listingUrl = new URL(raw.url);
  } catch {
    throw new AdapterInputError("INVALID_URL");
  }
  if (listingUrl.protocol !== "https:" || listingUrl.host !== "remotefirstjobs.com" ||
    listingUrl.port !== "" || listingUrl.username !== "" || listingUrl.password !== "") {
    throw new AdapterInputError("INVALID_URL_HOST");
  }
  // URL parsing drops an empty "?" or "#", so the raw string is checked.
  if (raw.url.includes("?") || raw.url.includes("#")) throw new AdapterInputError("INVALID_URL_PATH");
  // The listing URL names the record it belongs to; a URL to another listing is refused.
  if (!/^\/companies\/[a-z0-9-]{1,120}\/jobs\/[a-z0-9-]{1,120}$/u.test(listingUrl.pathname) ||
    !listingUrl.pathname.endsWith(`/jobs/${raw.id}`)) {
    throw new AdapterInputError("INVALID_URL_PATH");
  }
  if (typeof raw.title !== "string" || raw.title.trim().length === 0) {
    throw new AdapterInputError("EMPTY_TITLE");
  }
  if (typeof raw.company_name !== "string" || raw.company_name.trim().length === 0) {
    throw new AdapterInputError("EMPTY_COMPANY");
  }
  if (typeof raw.description !== "string") throw new AdapterInputError("EMPTY_DESCRIPTION");
  const text = descriptionToText(raw.description);
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");
  const publishedAt = publishedAtOf(raw.published_at);
  const salaryMin = salaryOf(raw.salary_min);
  const salaryMax = salaryOf(raw.salary_max);

  const id = `remote_first_jobs:${raw.id}`;
  const geo = geographyFor(raw, `ev:${id}:geo`, id);
  const workplace = workplaceFor(raw.title, text, `ev:${id}:workplace`, id);
  const salaryKnown = salaryMin !== null || salaryMax !== null;
  // The source converts every salary to USD per year (a monthly euro range arrives as
  // its annual dollar value), so the original posting's currency is not recoverable.
  const salaryOriginal = salaryKnown
    ? `${salaryMin ?? "?"}–${salaryMax ?? "?"} USD / annual (converted by the source)`
    : null;
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id,
    version: 1,
    source_record_id: id,
    title: raw.title.trim(),
    company_name: raw.company_name.trim(),
    company_domain: null,
    source_url: listingUrl.href,
    apply_url: null, // direct_apply denied; the listing on Remote First Jobs is the route
    description_text: text,
    description_language: "en",
    workplace: workplace.workplace,
    hiring_options: [{
      id: `opt:${id}:1`,
      geography: geo.geography,
      employment_types: ["unknown"],
      authorization: {
        requirement: "none_stated", authorization_type: "none_stated",
        any_of_countries: [], original_text: null, evidence_ids: [],
      },
      schedule: {
        status: "not_stated", timezone: null, zone_semantics: "not_stated",
        mode: "not_stated", local_windows: [], required_overlap_minutes: null,
        accepted_utc_offsets_minutes: [], original_text: null, evidence_ids: [],
      },
      evidence_ids: geo.geography.evidence_ids,
    }],
    requirements: [],
    compensation: {
      ranges: salaryKnown ? [{
        min: salaryMin === null ? null : String(salaryMin),
        max: salaryMax === null ? null : String(salaryMax),
        currency: "USD",
        period: "annual",
        tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [`ev:${id}:comp`],
      }] : [],
      original_text: salaryOriginal,
      evidence_ids: salaryKnown ? [`ev:${id}:comp`] : [],
    },
    dates: {
      source_published_at: publishedAt,
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: null,
    },
    lifecycle: "active",
    conflicts: workplace.conflict === null ? [] : [workplace.conflict],
    evidence: [geo.evidence, workplace.evidence, ...(salaryKnown ? [{
      id: `ev:${id}:comp`, origin_type: "job_source" as const,
      origin_id: id, origin_version: 1,
      field_path: "salary_min,salary_max", quote: salaryOriginal, method: "source_field" as const,
      confidence: 1,
    }] : [])],
  };
}

/** The card's excerpt: the feed has none, so the start of the posting text, cut at a word. */
export function remoteFirstJobsExcerptOf(snapshot: JobSnapshot): string {
  const text = snapshot.description_text;
  if (text.length <= EXCERPT_CHARS) return text;
  const cut = text.slice(0, EXCERPT_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function mapRemoteFirstJobsFixture(fetchedAt: string): readonly JobSnapshot[] {
  return remoteFirstJobsContractFixture.map(raw => mapRemoteFirstJobsRecord(raw, fetchedAt));
}
