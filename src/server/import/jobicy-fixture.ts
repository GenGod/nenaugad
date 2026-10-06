// Jobicy adapter mapping + a clearly-labelled CONTRACT FIXTURE.
// Live-feed facts verified against https://jobicy.com/api/v2/remote-jobs on
// 2026-09-25 (owner-directed smoke, count=2): id is an integer, url is the
// canonical Jobicy listing, pubDate is ISO 8601 with a +00:00 offset,
// jobGeo uses labels like "USA"/"UK"/"Anywhere" plus regions like "Europe",
// salary fields are nullable, jobDescription is HTML, jobExcerpt ~55 words.
// The fixture records below are synthetic: no real employers or vacancies.
import type {
  Geography, JobSnapshot, Workplace, Evidence,
} from "../../domain/source-contracts.ts";
import { AdapterInputError, descriptionToText } from "./himalayas-fixture.ts";
import { countryCodeOf, readTextGeography } from "./geography-text.ts";

export type JobicyRawRecord = Readonly<{
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobType?: readonly string[];
  jobGeo?: string | null;
  jobLevel?: string | null;
  jobExcerpt?: string | null;
  jobDescription?: string;
  pubDate?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}>;

export const jobicyContractFixture: readonly JobicyRawRecord[] = [
  {
    id: 900001,
    url: "https://jobicy.com/jobs/900001-platform-engineer-synthetic-fixture",
    jobTitle: "Platform Engineer (synthetic fixture)",
    companyName: "Northwind Fixtures",
    jobType: ["Full-Time"],
    jobGeo: "Anywhere",
    jobLevel: "Senior",
    jobExcerpt: "Synthetic fixture: fully remote platform role, worldwide.",
    jobDescription:
      "<p>Synthetic contract fixture. Fully remote permanent position. " +
      "We maintain a multi-region platform and collaborate asynchronously.</p>",
    pubDate: "2026-09-24T08:00:00+00:00",
    salaryMin: 110000, salaryMax: 140000,
    salaryCurrency: "USD", salaryPeriod: "yearly",
  },
  {
    id: 900002,
    url: "https://jobicy.com/jobs/900002-data-analyst-synthetic-fixture",
    jobTitle: "Data Analyst (synthetic fixture)",
    companyName: "Cobalt Fixtures",
    jobType: ["Contract"],
    jobGeo: "Europe",
    jobLevel: "Mid-Level",
    jobExcerpt: "Synthetic fixture: analyst role, Europe region.",
    jobDescription:
      "<p>Synthetic contract fixture. Permanent remote role for candidates " +
      "located in Europe.</p>",
    pubDate: "2026-09-23T10:30:00+00:00",
    salaryMin: null, salaryMax: null,
    salaryCurrency: null, salaryPeriod: null,
  },
  {
    id: 900003,
    url: "https://jobicy.com/jobs/900003-office-leaning-engineer-synthetic-fixture",
    jobTitle: "Office-leaning Engineer (synthetic fixture)",
    companyName: "Harbor Fixtures",
    jobType: ["Full-Time"],
    jobGeo: "USA",
    jobLevel: null,
    jobExcerpt: "Synthetic fixture: tagged remote but office-leaning.",
    jobDescription:
      "<p>Synthetic contract fixture. Tagged remote, but the team works " +
      "two days per week in our Boston office.</p>",
    pubDate: "2026-09-22T14:00:00+00:00",
    salaryMin: 40, salaryMax: 60,
    salaryCurrency: "USD", salaryPeriod: "hourly",
  },
];

const GEO_WORLDWIDE_LABELS: ReadonlySet<string> = new Set(["ANYWHERE", "ANY", "WORLDWIDE", "GLOBAL"]);
const EMPLOYMENT_TYPE_MAP: Readonly<Record<string, string>> = {
  "full-time": "employment_full_time",
  "part-time": "employment_part_time",
  contract: "contractor",
  freelance: "freelance",
  internship: "internship",
};
const SALARY_PERIOD_MAP: Readonly<Record<string, string>> = {
  yearly: "annual", monthly: "monthly", hourly: "hourly",
  weekly: "weekly", "per year": "annual", "per hour": "hourly",
};
const OFFICE_MARKERS = [
  /days? per week in (?:our |the )?[a-z]+\s+office/iu,
  /in[- ]person \d+ days?/iu,
] as const;
const TEMPORARY_MARKERS = [
  /remote until .{0,40}office/iu,
  /temporarily remote/iu,
] as const;

// "Anywhere" is the source's claim, and the employer's own text can contradict it
// (SP 1.0 §2; spec 11.1: an exclusion beats a broad permission; docs/OPEN_GAPS.md B24).
// A residence rule in the description or excerpt narrows the scope, or leaves the
// countries unknown when it names a region; an explicit exclusion keeps worldwide minus
// those countries. The label and the text both stay as evidence and the contradiction is
// recorded, as in the himalayas adapter.
function worldwideUnlessTextSays(
  raw: JobicyRawRecord, description: string, labelEvidence: Evidence,
): { geography: Geography; conflict: string | null; evidence: readonly Evidence[] } {
  const stated = readTextGeography(`${description} ${raw.jobExcerpt ?? ""}`);
  const contradicted = stated.restriction !== null || stated.exclusion !== null;
  const textEvidence = (kind: string, quote: string): Evidence => ({
    id: `${labelEvidence.id}:${kind}`, origin_type: "job_source",
    origin_id: labelEvidence.origin_id, origin_version: 1,
    field_path: description.includes(quote) ? "jobDescription" : "jobExcerpt",
    quote, method: "rule", confidence: 0.9,
  });
  const evidence = [
    labelEvidence,
    ...(stated.restriction ? [textEvidence("restriction", stated.restriction.quote)] : []),
    ...(stated.exclusion ? [textEvidence("exclusion", stated.exclusion.quote)] : []),
  ];
  const excluded = stated.exclusion?.countries ?? [];
  const evidenceIds = evidence.map(item => item.id);
  const geography: Geography = stated.restriction === null
    ? {
        scope: "worldwide", allowed_countries: [], excluded_countries: excluded,
        allowed_subdivisions: [], region_text: stated.exclusion?.quote ?? null,
        exhaustive: true, evidence_ids: evidenceIds,
      }
    : {
        scope: "restricted", allowed_countries: stated.restriction.countries,
        excluded_countries: excluded, allowed_subdivisions: [],
        region_text: stated.restriction.quote,
        // No country set means the rule names a region: GEO-01 stays unknown.
        exhaustive: stated.restriction.countries.length > 0, evidence_ids: evidenceIds,
      };
  return { geography, conflict: contradicted ? "geography-source-vs-text" : null, evidence };
}

// A jobGeo label names countries, regions or both, joined by commas ("Canada,  USA",
// "EMEA,  LATAM,  Canada,  USA"). Countries come from the shared dictionary; a region or
// an unknown name never becomes a country set (spec 11.1: "Europe", "EU" and "EMEA" are
// not interchangeable with one). A label of countries only is the complete list. A label
// that also names something else keeps its countries as an incomplete list, which GEO-01
// never uses to fail a candidate (docs/OPEN_GAPS.md B25).
function labelGeography(label: string, evidenceId: string): Geography {
  const codes = label.split(",").filter(part => part.trim().length > 0).map(part => countryCodeOf(part));
  const countries = [...new Set(codes.filter(code => code !== null))];
  return {
    scope: "restricted", allowed_countries: countries, excluded_countries: [],
    allowed_subdivisions: [], region_text: label,
    exhaustive: countries.length > 0 && !codes.includes(null), evidence_ids: [evidenceId],
  };
}

// Country and region labels are already narrower than worldwide and are taken as they
// are; only a worldwide label is tested against the text.
function geographyFor(raw: JobicyRawRecord, description: string, evidenceId: string, recordId: string): {
  geography: Geography; conflict: string | null; evidence: readonly Evidence[];
} {
  const label = (raw.jobGeo ?? "").trim();
  const labelEvidence: Evidence = {
    id: evidenceId, origin_type: "job_source", origin_id: recordId,
    origin_version: 1, field_path: "jobGeo",
    quote: label.length > 0 ? label : null, method: "source_field", confidence: 1,
  };
  if (GEO_WORLDWIDE_LABELS.has(label.toUpperCase())) {
    return worldwideUnlessTextSays(raw, description, labelEvidence);
  }
  const geography: Geography = label.length === 0
    ? {
        scope: "unspecified", allowed_countries: [], excluded_countries: [],
        allowed_subdivisions: [], region_text: null, exhaustive: false, evidence_ids: [evidenceId],
      }
    : labelGeography(label, evidenceId);
  return { geography, conflict: null, evidence: [labelEvidence] };
}

function workplaceFor(text: string, evidenceId: string, recordId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  // Jobicy is a remote-only board: an authoritative structured signal for
  // workplace.type=remote (spec 10.2). Office markers still win.
  const officeConflict = OFFICE_MARKERS.some(marker => marker.test(text));
  const temporary = TEMPORARY_MARKERS.some(marker => marker.test(text));
  return {
    workplace: {
      type: "remote",
      permanence: officeConflict ? "unknown" : temporary ? "temporary" : "permanent",
      mandatory_onsite: officeConflict ? "required" : "not_stated",
      mandatory_travel: "not_stated",
      optional_offsites: null,
      verification_state: officeConflict ? "conflicting" : "confirmed",
      evidence_ids: [evidenceId],
    },
    conflict: officeConflict ? "remote-tag-vs-office-text" : null,
    evidence: {
      id: evidenceId, origin_type: "job_source", origin_id: recordId,
      origin_version: 1, field_path: "board:remote-only-feed",
      quote: officeConflict
        ? (OFFICE_MARKERS.find(marker => marker.test(text))?.source ?? null)
        : "remote-only jobs feed",
      method: "rule", confidence: officeConflict ? 1 : 0.9,
    },
  };
}

export function mapJobicyRecord(raw: JobicyRawRecord, fetchedAt: string): JobSnapshot {
  if (!Number.isSafeInteger(raw.id) || raw.id < 1 || raw.id > 1e12) {
    throw new AdapterInputError("INVALID_ID");
  }
  let listingUrl: URL;
  try {
    listingUrl = new URL(raw.url);
  } catch {
    throw new AdapterInputError("INVALID_URL");
  }
  if (listingUrl.protocol !== "https:" || listingUrl.host !== "jobicy.com" ||
    listingUrl.port !== "" || listingUrl.username !== "") {
    throw new AdapterInputError("INVALID_URL_HOST");
  }
  if (typeof raw.jobTitle !== "string" || raw.jobTitle.length === 0) {
    throw new AdapterInputError("EMPTY_TITLE");
  }
  const text = descriptionToText(raw.jobDescription ?? "");
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");
  // Live contract: ISO 8601 with offset ("2026-09-25T04:50:05+00:00").
  if (typeof raw.pubDate !== "string") throw new AdapterInputError("INVALID_PUB_DATE");
  const publishedAt = new Date(raw.pubDate);
  if (Number.isNaN(publishedAt.getTime())) throw new AdapterInputError("INVALID_PUB_DATE");

  const id = `jobicy:${raw.id}`;
  const evidenceText = `${text} ${raw.jobExcerpt ?? ""}`;
  const geo = geographyFor(raw, text, `ev:${id}:geo`, id);
  const workplace = workplaceFor(evidenceText, `ev:${id}:workplace`, id);
  const salaryKnown = raw.salaryMin != null || raw.salaryMax != null;
  const period = raw.salaryPeriod ? SALARY_PERIOD_MAP[raw.salaryPeriod.toLowerCase()] : undefined;
  const salaryOriginal = salaryKnown
    ? `${raw.salaryMin ?? "?"}–${raw.salaryMax ?? "?"} ${raw.salaryCurrency ?? "?"} / ${period ?? "unknown"}`
    : null;
  const employmentTypes = (raw.jobType ?? [])
    .map(type => EMPLOYMENT_TYPE_MAP[type.toLowerCase()])
    .filter(type => type !== undefined);
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id,
    version: 1,
    source_record_id: id,
    title: raw.jobTitle,
    company_name: raw.companyName,
    company_domain: null,
    source_url: raw.url,
    apply_url: null, // direct_apply denied; the canonical listing is the route
    description_text: text,
    description_language: "en",
    workplace: workplace.workplace,
    hiring_options: [{
      id: `opt:${id}:1`,
      geography: geo.geography,
      employment_types: (employmentTypes.length > 0 ? employmentTypes : ["unknown"]) as
        JobSnapshot["hiring_options"][number]["employment_types"],
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
        min: raw.salaryMin == null ? null : String(raw.salaryMin),
        max: raw.salaryMax == null ? null : String(raw.salaryMax),
        currency: raw.salaryCurrency ?? null,
        period: (period ?? "unknown") as "hourly" | "annual",
        tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [`ev:${id}:comp`],
      }] : [],
      original_text: salaryOriginal,
      evidence_ids: salaryKnown ? [`ev:${id}:comp`] : [],
    },
    dates: {
      source_published_at: publishedAt.toISOString(),
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: null,
    },
    lifecycle: "active",
    conflicts: [geo.conflict, workplace.conflict].filter((c): c is string => c !== null),
    evidence: [...geo.evidence, workplace.evidence, ...(salaryKnown ? [{
      id: `ev:${id}:comp`, origin_type: "job_source" as const,
      origin_id: id, origin_version: 1,
      field_path: "salary", quote: salaryOriginal, method: "source_field" as const,
      confidence: 1,
    }] : [])],
  };
}

export function jobicyExcerptOf(raw: JobicyRawRecord): string {
  return typeof raw.jobExcerpt === "string" ? raw.jobExcerpt : "";
}

export function mapJobicyFixture(fetchedAt: string): readonly JobSnapshot[] {
  return jobicyContractFixture.map(raw => mapJobicyRecord(raw, fetchedAt));
}
