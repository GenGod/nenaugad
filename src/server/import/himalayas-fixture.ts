// CONTRACT FIXTURE for the future Himalayas adapter.
// These records are synthetic: they were never fetched from
// https://himalayas.app/jobs/api and contain no real employers or vacancies.
// The live adapter (network transport) is a separate high-risk task that
// requires owner review of the source policy first; S1-001 ships the
// deterministic mapping and its tests only.
import type {
  Geography, JobSnapshot, Workplace, Evidence,
} from "../../domain/source-contracts.ts";

export class AdapterInputError extends Error {
  constructor(code: string) { super(code); }
}

// Minimal shape the fixture uses from the documented public API fields.
export type HimalayasRawRecord = Readonly<{
  guid: string;
  title: string;
  companyName: string;
  companyDomain?: string | null;
  descriptionHtml: string;
  arrangement: "remote" | "hybrid" | "onsite" | "unknown";
  permanentRemote: boolean | null;
  pubDateEpoch: number;
  locations: readonly string[];
  salary?: Readonly<{
    min: number | null; max: number | null;
    currency: string | null; period: "annual" | "hourly";
  }> | null;
  sourceUrl: string;
  applyUrl?: string | null;
}>;

export const himalayasContractFixture: readonly HimalayasRawRecord[] = [
  {
    guid: "fixture-h-001",
    title: "Platform Engineer (synthetic fixture)",
    companyName: "Northwind Fixtures",
    companyDomain: "northwind-fixtures.example",
    descriptionHtml:
      "<p>Synthetic contract fixture. Fully remote permanent position. " +
      "We maintain a multi-region platform and review pull requests asynchronously.</p>",
    arrangement: "remote",
    permanentRemote: true,
    pubDateEpoch: 1750000000, // seconds — the mapper must not read this as milliseconds
    locations: [], // source-defined worldwide, still checked against the text
    salary: { min: 110000, max: 140000, currency: "USD", period: "annual" },
    sourceUrl: "https://himalayas.app/jobs/fixture-h-001",
    applyUrl: null,
  },
  {
    guid: "fixture-h-002",
    title: "Data Analyst (synthetic fixture)",
    companyName: "Cobalt Fixtures",
    companyDomain: "cobalt-fixtures.example",
    descriptionHtml:
      "<p>Synthetic contract fixture. Permanent remote role. " +
      "Applicants must be based in Germany or the Netherlands.</p>",
    arrangement: "remote",
    permanentRemote: true,
    pubDateEpoch: 1750086400000, // milliseconds for the same day: unit must be detected
    locations: [],
    salary: { min: 60000, max: 75000, currency: "EUR", period: "annual" },
    sourceUrl: "https://himalayas.app/jobs/fixture-h-002",
    applyUrl: "https://cobalt-fixtures.example/careers/fixture-h-002",
  },
  {
    guid: "fixture-h-003",
    title: "Office-leaning Engineer (synthetic fixture)",
    companyName: "Harbor Fixtures",
    companyDomain: null,
    descriptionHtml:
      "<p>Synthetic contract fixture. Tagged remote, but the team works " +
      "two days per week in our Berlin office.</p>",
    arrangement: "remote",
    permanentRemote: null,
    pubDateEpoch: 1750172800,
    locations: ["Germany"],
    salary: null,
    sourceUrl: "https://himalayas.app/jobs/fixture-h-003",
    applyUrl: null,
  },
];

const RESTRICTED_COUNTRY_PATTERN = /must be based in ([A-Z][a-z]+)(?: or (?:the )?([A-Z][a-z]+))?/u;
const COUNTRY_ISO: Readonly<Record<string, string>> = {
  Germany: "DE", Netherlands: "NL", France: "FR",
  "United States": "US", Japan: "JP", Poland: "PL", Spain: "ES",
};
const OFFICE_MARKERS = [
  /days? per week in (?:our |the )?[a-z]+\s+office/iu,
  /in[- ]person \d+ days?/iu,
] as const;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

export function descriptionToText(descriptionHtml: string): string {
  return decodeEntities(
    descriptionHtml.replace(/<\/?(p|br|li|ul|ol|strong|em|b|i)[^>]*>/giu, ""),
  ).replace(/\s+/gu, " ").trim();
}

function epochToIsoDateTime(epoch: number): string {
  // Himalayas documentation examples mix seconds and milliseconds; an adapter
  // must detect the unit, never guess. Ambiguous magnitude is rejected.
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw new AdapterInputError("INVALID_PUB_DATE");
  }
  if (epoch >= 1e12) return new Date(epoch).toISOString();
  if (epoch <= 1e11) return new Date(epoch * 1000).toISOString();
  throw new AdapterInputError("AMBIGUOUS_PUB_DATE_UNIT");
}

function detectRestrictedCountries(text: string): { countries: string[]; quote: string } | null {
  const match = text.match(RESTRICTED_COUNTRY_PATTERN);
  if (!match) return null;
  const countries: string[] = [];
  for (const name of match.slice(1)) {
    if (name && COUNTRY_ISO[name]) countries.push(COUNTRY_ISO[name]);
  }
  return countries.length > 0 ? { countries, quote: match[0] } : null;
}

function hasOfficeMarker(text: string): boolean {
  return OFFICE_MARKERS.some(marker => marker.test(text));
}

function firstOfficeMarkerSource(text: string): string | null {
  return OFFICE_MARKERS.find(marker => marker.test(text))?.source ?? null;
}

function geographyFor(raw: HimalayasRawRecord, text: string, evidenceId: string): {
  geography: Geography; conflict: string | null; evidence: Evidence;
} {
  const restriction = detectRestrictedCountries(text);
  // Empty locations is a source-defined worldwide assertion — it survives only
  // when the description text does not contradict it (spec 5.2, SP section 2).
  if (!restriction) {
    return {
      geography: {
        scope: raw.locations.length === 0 ? "worldwide" : "restricted",
        allowed_countries: [],
        excluded_countries: [],
        allowed_subdivisions: raw.locations.length === 0 ? [] : [...raw.locations],
        region_text: raw.locations.length === 0 ? null : raw.locations.join(", "),
        exhaustive: true,
        evidence_ids: [evidenceId],
      },
      conflict: null,
      evidence: {
        id: evidenceId, origin_type: "job_source",
        origin_id: `himalayas:${raw.guid}`, origin_version: 1,
        field_path: "locations", quote: null, method: "source_field", confidence: 1,
      },
    };
  }
  return {
    geography: {
      scope: "restricted",
      allowed_countries: restriction.countries,
      excluded_countries: [],
      allowed_subdivisions: [],
      region_text: restriction.quote,
      exhaustive: true,
      evidence_ids: [evidenceId],
    },
    conflict: "geography-source-vs-text",
    evidence: {
      id: evidenceId, origin_type: "job_source",
      origin_id: `himalayas:${raw.guid}`, origin_version: 1,
      field_path: "locations", quote: restriction.quote, method: "rule", confidence: 0.9,
    },
  };
}

function workplaceFor(raw: HimalayasRawRecord, text: string, evidenceId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  const officeConflict = raw.arrangement === "remote" && hasOfficeMarker(text);
  const verificationState = officeConflict ? "conflicting"
    : raw.arrangement === "unknown" ? "unknown" : "confirmed";
  return {
    workplace: {
      type: raw.arrangement,
      permanence: raw.permanentRemote === true ? "permanent"
        : raw.permanentRemote === false ? "temporary" : "unknown",
      mandatory_onsite: officeConflict ? "required" : "not_stated",
      mandatory_travel: "not_stated",
      optional_offsites: null,
      verification_state: verificationState,
      evidence_ids: [evidenceId],
    },
    conflict: officeConflict ? "remote-tag-vs-office-text" : null,
    evidence: {
      id: evidenceId, origin_type: "job_source",
      origin_id: `himalayas:${raw.guid}`, origin_version: 1,
      field_path: "arrangement",
      quote: officeConflict ? firstOfficeMarkerSource(text) : null,
      method: "source_field", confidence: 1,
    },
  };
}

export function mapHimalayasRecord(raw: HimalayasRawRecord, fetchedAt: string): JobSnapshot {
  if (!/^[A-Za-z0-9-]{1,100}$/u.test(raw.guid)) throw new AdapterInputError("INVALID_GUID");
  const text = descriptionToText(raw.descriptionHtml);
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");
  const geo = geographyFor(raw, text, `ev:${raw.guid}:geo`);
  const workplace = workplaceFor(raw, text, `ev:${raw.guid}:workplace`);
  const salaryOriginal = raw.salary && (raw.salary.min !== null || raw.salary.max !== null)
    ? `${raw.salary.min ?? "?"}–${raw.salary.max ?? "?"} ${raw.salary.currency ?? "?"} / ${raw.salary.period}`
    : null;
  const conflicts = [geo.conflict, workplace.conflict].filter((c): c is string => c !== null);
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id: `himalayas:${raw.guid}`,
    version: 1,
    source_record_id: `himalayas:${raw.guid}`,
    title: raw.title,
    company_name: raw.companyName,
    company_domain: raw.companyDomain ?? null,
    source_url: raw.sourceUrl,
    apply_url: raw.applyUrl ?? null,
    description_text: text,
    description_language: "en",
    workplace: workplace.workplace,
    hiring_options: [{
      id: `opt:${raw.guid}:1`,
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
      evidence_ids: [geo.evidence.id],
    }],
    requirements: [],
    compensation: {
      ranges: raw.salary ? [{
        min: raw.salary.min === null ? null : String(raw.salary.min),
        max: raw.salary.max === null ? null : String(raw.salary.max),
        currency: raw.salary.currency,
        period: raw.salary.period === "annual" ? "annual" : "hourly",
        tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [`ev:${raw.guid}:comp`],
      }] : [],
      original_text: salaryOriginal,
      evidence_ids: raw.salary ? [`ev:${raw.guid}:comp`] : [],
    },
    dates: {
      source_published_at: epochToIsoDateTime(raw.pubDateEpoch),
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: null,
    },
    lifecycle: "active",
    conflicts,
    evidence: [geo.evidence, workplace.evidence, ...(raw.salary ? [{
      id: `ev:${raw.guid}:comp`, origin_type: "job_source" as const,
      origin_id: `himalayas:${raw.guid}`, origin_version: 1,
      field_path: "salary", quote: salaryOriginal, method: "source_field" as const,
      confidence: 1,
    }] : [])],
  };
}

export function mapHimalayasFixture(fetchedAt: string): readonly JobSnapshot[] {
  return himalayasContractFixture.map(raw => mapHimalayasRecord(raw, fetchedAt));
}
