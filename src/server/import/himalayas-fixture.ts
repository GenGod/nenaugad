// Himalayas adapter mapping + a clearly-labelled CONTRACT FIXTURE.
// Live-feed facts verified against https://himalayas.app/jobs/api on
// 2026-09-24 (owner-directed smoke, limit=2): guid is the full listing URL,
// pubDate/expiryDate are Unix SECONDS (the OpenAPI "ms" claim is wrong),
// excerpt is a separate field, totalCount ~100k, locationRestrictions may be
// empty (= source-defined worldwide, still checked against the text).
// The fixture records below are synthetic: no real employers or vacancies.
import type {
  Geography, JobSnapshot, Workplace, Evidence, Schedule,
} from "../../domain/source-contracts.ts";
import { countryCodeOf, worldwideUnlessTextSays } from "./geography-text.ts";
import { decodeHtmlEntities } from "./html-entities.ts";

export class AdapterInputError extends Error {
  constructor(code: string) { super(code); }
}

export type HimalayasRawRecord = Readonly<{
  guid: string;
  title: string;
  excerpt?: string | null;
  companyName: string;
  employmentType?: string | null;
  description: string;
  pubDate: number;
  expiryDate?: number | null;
  locationRestrictions: readonly (string | Readonly<{ alpha2?: string; name?: string }>)[];
  timezoneRestrictions?: readonly number[];
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  currency?: string | null;
  applicationLink?: string | null;
}>;

export const himalayasContractFixture: readonly HimalayasRawRecord[] = [
  {
    guid: "https://himalayas.app/jobs/fixture-h-001",
    title: "Platform Engineer (synthetic fixture)",
    excerpt: "Synthetic fixture: fully remote permanent platform role.",
    companyName: "Northwind Fixtures",
    employmentType: "Full Time",
    description:
      "<p>Synthetic contract fixture. Fully remote permanent position. " +
      "We maintain a multi-region platform and review pull requests asynchronously.</p>",
    pubDate: 1750000000, // seconds — verified live unit; auto-detected anyway
    expiryDate: 1810000000,
    locationRestrictions: [],
    timezoneRestrictions: [],
    minSalary: 110000, maxSalary: 140000,
    salaryPeriod: "annual", currency: "USD",
    applicationLink: null,
  },
  {
    guid: "https://himalayas.app/jobs/fixture-h-002",
    title: "Data Analyst (synthetic fixture)",
    excerpt: "Synthetic fixture: remote analyst role for DE/NL.",
    companyName: "Cobalt Fixtures",
    employmentType: "Contractor",
    description:
      "<p>Synthetic contract fixture. Permanent remote role. " +
      "Applicants must be based in Germany or the Netherlands.</p>",
    pubDate: 1750086400000, // milliseconds — unit detection must still work
    expiryDate: null,
    locationRestrictions: [],
    timezoneRestrictions: [2],
    minSalary: 60, maxSalary: 75,
    salaryPeriod: "hourly", currency: "EUR",
    applicationLink: "https://himalayas.app/jobs/fixture-h-002",
  },
  {
    guid: "https://himalayas.app/jobs/fixture-h-003",
    title: "Office-leaning Engineer (synthetic fixture)",
    excerpt: "Synthetic fixture: tagged remote but office-leaning.",
    companyName: "Harbor Fixtures",
    employmentType: null,
    description:
      "<p>Synthetic contract fixture. Tagged remote, but the team works " +
      "two days per week in our Berlin office.</p>",
    pubDate: 1750172800,
    expiryDate: null,
    locationRestrictions: [{ alpha2: "DE", name: "Germany" }],
    timezoneRestrictions: [],
    minSalary: null, maxSalary: null,
    salaryPeriod: null, currency: null,
    applicationLink: null,
  },
];

const OFFICE_MARKERS = [
  /days? per week in (?:our |the )?[a-z]+\s+office/iu,
  /in[- ]person \d+ days?/iu,
] as const;
const TEMPORARY_MARKERS = [
  /remote until .{0,40}office/iu,
  /temporarily remote/iu,
] as const;
const EMPLOYMENT_TYPE_MAP: Readonly<Record<string, string>> = {
  "Full Time": "employment_full_time",
  "Part Time": "employment_part_time",
  Contractor: "contractor",
  Freelance: "freelance",
  Intern: "internship",
  Temporary: "temporary",
};
const SALARY_PERIOD_MAP: Readonly<Record<string, string>> = {
  hourly: "hourly", weekly: "weekly", fortnightly: "fortnightly",
  monthly: "monthly", annual: "annual",
};

/**
 * Tags that sit inside a word or a sentence: removed without a space, so markup
 * that splits a word ("Py<b>thon</b>") leaves it whole. Every other tag (a
 * paragraph, a heading, a list item, a line break, a cell, anything unknown) marks
 * a boundary and leaves a space.
 */
const INLINE_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "dfn", "em", "font", "i", "kbd",
  "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt",
  "u", "var", "wbr",
]);

/**
 * The longest description an adapter cleans. The largest stored on 2026-10-07 is
 * 18,406 characters; a description far beyond it is refused as one bad record
 * (`DESCRIPTION_TOO_LONG`), so a broken or hostile body cannot hold the worker on
 * the patterns below (B38-001 review).
 */
const MAX_DESCRIPTION_CHARS = 100_000;

/**
 * The plain text of a posting's HTML description, for both adapters. It feeds the
 * matching rules, BM25, the embeddings and the paid extraction (B38): the old
 * version removed ten tag names without a space, so headings, divisions and rules
 * stayed and paragraphs ran together ("…part of it?We bring…"). Entities are
 * decoded once, after the tags are gone, so escaped markup in the source stays text.
 */
export function descriptionToText(html: string): string {
  if (html.length > MAX_DESCRIPTION_CHARS) throw new AdapterInputError("DESCRIPTION_TOO_LONG");
  const withoutTags = html
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<\/?([A-Za-z][A-Za-z0-9-]*)\b[^<>]*>/gu,
      (_tag: string, name: string) => INLINE_TAGS.has(name.toLowerCase()) ? "" : " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/gu, " ").trim();
}

function epochToIsoDateTime(epoch: number): string {
  // The live feed uses seconds; older docs claim ms or ISO. The adapter
  // detects the unit and rejects ambiguous magnitudes instead of guessing.
  if (!Number.isSafeInteger(epoch) || epoch <= 0) {
    throw new AdapterInputError("INVALID_PUB_DATE");
  }
  if (epoch >= 1e12) return new Date(epoch).toISOString();
  if (epoch <= 1e11) return new Date(epoch * 1000).toISOString();
  throw new AdapterInputError("AMBIGUOUS_PUB_DATE_UNIT");
}

function listingSlug(guid: string): { id: string; sourceUrl: string } {
  let url: URL;
  try {
    url = new URL(guid);
  } catch {
    throw new AdapterInputError("INVALID_GUID");
  }
  if (url.protocol !== "https:" || url.host !== "himalayas.app" ||
    url.port !== "" || url.username !== "" || url.password !== "") {
    throw new AdapterInputError("INVALID_GUID_HOST");
  }
  const slug = url.pathname.replace(/^\/+|\/+$/gu, "").replace(/\//gu, "-");
  if (!/^[a-z0-9-]{1,120}$/u.test(slug)) throw new AdapterInputError("INVALID_GUID_SLUG");
  return { id: `himalayas:${slug}`, sourceUrl: guid };
}

const ISO_ALPHA2 = /^[A-Z]{2}$/u;

// A location restriction names a country (spec 5.2: the source's own restriction). The
// name resolves through the shared dictionary; a name outside it, or an ambiguous one such
// as Georgia (spec 11.1), resolves through the entry's ISO alpha2 code when it has one.
// Every entry counts: an unreadable one is a restriction without a country, because a
// non-empty list never becomes worldwide (spec 11.1).
function normalizeLocations(
  raw: HimalayasRawRecord["locationRestrictions"],
): { name: string; country: string | null }[] {
  return raw.map(entry => {
    if (typeof entry === "string") return { name: entry, country: countryCodeOf(entry) };
    const byName = entry.name ? countryCodeOf(entry.name) : null;
    const byCode = entry.alpha2 !== undefined && ISO_ALPHA2.test(entry.alpha2) ? entry.alpha2 : null;
    return { name: entry.name || entry.alpha2 || "", country: byName ?? byCode };
  });
}

// Empty locations is the source's worldwide claim: it holds only when the employer's own
// text does not contradict it, read by the detector jobicy uses (spec 5.2, SP 1.0 §2;
// owner decision 2026-10-13, docs/OPEN_GAPS.md B26). A list is the source's own
// restriction and stands; it is complete only when every location is a known country,
// and an incomplete one fails no candidate (B25, B27).
function geographyFor(raw: HimalayasRawRecord, description: string, evidenceId: string, recordId: string): {
  geography: Geography; conflict: string | null; evidence: readonly Evidence[];
} {
  const locations = normalizeLocations(raw.locationRestrictions);
  const named = locations.map(location => location.name).filter(name => name.length > 0);
  const names = named.length === 0 ? null : named.join(", ");
  const sourceEvidence: Evidence = {
    id: evidenceId, origin_type: "job_source",
    origin_id: recordId, origin_version: 1,
    field_path: "locationRestrictions", quote: names,
    method: "source_field", confidence: 1,
  };
  if (locations.length === 0) {
    return worldwideUnlessTextSays(`${description} ${raw.excerpt ?? ""}`, sourceEvidence,
      quote => description.includes(quote) ? "description" : "excerpt");
  }
  return {
    geography: {
      scope: "restricted",
      allowed_countries: [...new Set(locations.map(location => location.country).filter(country => country !== null))],
      excluded_countries: [],
      allowed_subdivisions: [],
      region_text: names,
      exhaustive: locations.every(location => location.country !== null),
      evidence_ids: [evidenceId],
    },
    conflict: null,
    evidence: [sourceEvidence],
  };
}

function workplaceFor(_raw: HimalayasRawRecord, text: string, evidenceId: string, recordId: string): {
  workplace: Workplace; conflict: string | null; evidence: Evidence;
} {
  // The feed is a remote-only jobs board: an authoritative structured signal
  // for workplace.type=remote (spec 10.2). Office markers in the text still
  // win and quarantine the record; temporary markers downgrade permanence.
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
      id: evidenceId, origin_type: "job_source",
      origin_id: recordId, origin_version: 1,
      field_path: "board:remote-only-feed",
      quote: officeConflict
        ? (OFFICE_MARKERS.find(marker => marker.test(text))?.source ?? null)
        : "remote-only jobs feed",
      method: "rule", confidence: officeConflict ? 1 : 0.9,
    },
  };
}

function scheduleFor(raw: HimalayasRawRecord): Schedule {
  // Live contract (verified 2026-09-24): timezoneRestrictions are numeric UTC
  // offsets in hours (fractional .25/.5/.75 allowed), despite the OpenAPI
  // claiming strings. A set spanning -11..14 means no restriction is stated.
  const rawZones = raw.timezoneRestrictions ?? [];
  const offsets = rawZones
    .map(zone => parseZoneHours(zone))
    .filter(offset => offset !== null);
  const explicit = offsets.length > 0;
  const unrestricted = explicit && Math.min(...offsets) <= -660 && Math.max(...offsets) >= 840;
  const stated = explicit && !unrestricted;
  return {
    status: stated ? "explicit" : "not_stated",
    timezone: null,
    zone_semantics: stated ? "fixed_utc_offset" : rawZones.length > 0 ? "ambiguous" : "not_stated",
    mode: stated ? "within_offset_set" : "not_stated",
    local_windows: [],
    required_overlap_minutes: null,
    accepted_utc_offsets_minutes: stated ? offsets : [],
    original_text: stated ? JSON.stringify(rawZones) : null,
    evidence_ids: [],
  };
}

function parseZoneHours(zone: number): number | null {
  if (typeof zone !== "number" || !Number.isFinite(zone)) return null;
  const minutes = Math.round(zone * 60);
  if (Math.abs(zone * 60 - minutes) > 1e-9) return null;
  return minutes >= -840 && minutes <= 840 ? minutes : null;
}

function employmentTypesFor(raw: HimalayasRawRecord): string[] {
  const mapped = raw.employmentType ? EMPLOYMENT_TYPE_MAP[raw.employmentType] : undefined;
  return [mapped ?? "unknown"];
}

function validHttpUrlOrNull(value: string | null): string | null {
  if (value === null || value === "") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

export function mapHimalayasRecord(raw: HimalayasRawRecord, fetchedAt: string): JobSnapshot {
  const { id, sourceUrl } = listingSlug(raw.guid);
  const text = descriptionToText(raw.description);
  if (text.length === 0) throw new AdapterInputError("EMPTY_DESCRIPTION");
  if (typeof raw.title !== "string" || raw.title.length === 0) {
    throw new AdapterInputError("EMPTY_TITLE");
  }
  const evidenceText = `${text} ${raw.excerpt ?? ""}`;
  const geo = geographyFor(raw, text, `ev:${id}:geo`, id);
  const workplace = workplaceFor(raw, evidenceText, `ev:${id}:workplace`, id);
  const salaryKnown = raw.minSalary != null || raw.maxSalary != null;
  const period = raw.salaryPeriod ? SALARY_PERIOD_MAP[raw.salaryPeriod] : undefined;
  const salaryOriginal = salaryKnown
    ? `${raw.minSalary ?? "?"}–${raw.maxSalary ?? "?"} ${raw.currency ?? "?"} / ${period ?? "unknown"}`
    : null;
  const conflicts = [geo.conflict, workplace.conflict].filter((c): c is string => c !== null);
  const applyUrl = validHttpUrlOrNull(raw.applicationLink ?? null);
  return {
    kind: "job_snapshot",
    schema_version: "1.0.0",
    id,
    version: 1,
    source_record_id: id,
    title: raw.title,
    company_name: raw.companyName,
    company_domain: null,
    source_url: sourceUrl,
    apply_url: applyUrl,
    description_text: text,
    description_language: "en",
    workplace: workplace.workplace,
    hiring_options: [{
      id: `opt:${id}:1`,
      geography: geo.geography,
      employment_types: employmentTypesFor(raw) as JobSnapshot["hiring_options"][number]["employment_types"],
      authorization: {
        requirement: "none_stated", authorization_type: "none_stated",
        any_of_countries: [], original_text: null, evidence_ids: [],
      },
      schedule: scheduleFor(raw),
      evidence_ids: geo.geography.evidence_ids,
    }],
    requirements: [],
    compensation: {
      ranges: salaryKnown ? [{
        min: raw.minSalary == null ? null : String(raw.minSalary),
        max: raw.maxSalary == null ? null : String(raw.maxSalary),
        currency: raw.currency ?? null,
        period: (period ?? "unknown") as "hourly" | "annual",
        tax_basis: "unknown", component: "unknown",
        applicable_countries: [], hours_per_week: null, paid_weeks_per_year: null,
        evidence_ids: [`ev:${id}:comp`],
      }] : [],
      original_text: salaryOriginal,
      evidence_ids: salaryKnown ? [`ev:${id}:comp`] : [],
    },
    dates: {
      source_published_at: epochToIsoDateTime(raw.pubDate),
      fetched_at: fetchedAt,
      last_seen_at: fetchedAt,
      expires_at: raw.expiryDate ? epochToIsoDateTime(raw.expiryDate) : null,
    },
    lifecycle: "active",
    conflicts,
    evidence: [...geo.evidence, workplace.evidence, ...(salaryKnown ? [{
      id: `ev:${id}:comp`, origin_type: "job_source" as const,
      origin_id: id, origin_version: 1,
      field_path: "salary", quote: salaryOriginal, method: "source_field" as const,
      confidence: 1,
    }] : [])],
  };
}

export function mapHimalayasFixture(fetchedAt: string): readonly JobSnapshot[] {
  return himalayasContractFixture.map(raw => mapHimalayasRecord(raw, fetchedAt));
}
