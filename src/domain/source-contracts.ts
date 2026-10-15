// Structural validators for the canonical domain contracts
// (docs/solo/context/03_DOMAIN_CONTRACTS.schema.json, schema_version 1.0.0).
// They mirror the JSON Schema: required fields, enums, patterns and
// additionalProperties:false. They are intentionally hand-written so the
// runtime keeps zero third-party validator dependencies.

export type TriState = "allowed" | "denied" | "unknown";

export const SOURCE_POLICY_PERMISSIONS = [
  "fetch", "cache", "store_full_text", "store_excerpt", "derive_fields",
  "process_with_ml", "send_to_ai_provider", "publish_full_text", "publish_excerpt",
  "send_email", "index_web_page", "syndicate_google_jobs", "train_model",
  "direct_apply", "bulk_export",
] as const;
export type SourcePolicyPermission = (typeof SOURCE_POLICY_PERMISSIONS)[number];

export type SourcePolicyStatus = "pending" | "approved" | "suspended" | "revoked";
export type ApplyRoute = "source_required" | "direct_allowed" | "unknown";
export type AllowedSurface =
  | "public_web" | "private_matching" | "email"
  | "ordinary_seo" | "google_jobs" | "external_api";

export type SourcePolicy = Readonly<{
  kind: "source_policy";
  schema_version: "1.0.0";
  id: string;
  version: number;
  source_id: string;
  status: SourcePolicyStatus;
  enabled: boolean;
  terms_urls: readonly string[];
  terms_hash: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approval_reference: string | null;
  valid_until: string | null;
  permissions: Readonly<Record<SourcePolicyPermission, TriState>>;
  max_retention_hours: number | null;
  min_poll_interval_seconds: number;
  attribution: Readonly<{
    required: boolean;
    display_name: string;
    backlink_required: boolean;
    link_rel: readonly string[];
    logo_allowed: TriState;
  }>;
  apply_route: ApplyRoute;
  allowed_surfaces: readonly AllowedSurface[];
}>;

export type Workplace = Readonly<{
  type: "remote" | "hybrid" | "onsite" | "unknown";
  permanence: "permanent" | "temporary" | "after_onsite_onboarding" | "unknown";
  mandatory_onsite: "required" | "not_stated" | "explicitly_not_required" | "unknown";
  mandatory_travel: "required" | "not_stated" | "explicitly_not_required" | "unknown";
  optional_offsites: boolean | null;
  verification_state: "confirmed" | "unknown" | "conflicting" | "rejected";
  evidence_ids: readonly string[];
}>;

export type Geography = Readonly<{
  scope: "worldwide" | "restricted" | "unspecified";
  allowed_countries: readonly string[];
  excluded_countries: readonly string[];
  allowed_subdivisions: readonly string[];
  region_text: string | null;
  exhaustive: boolean;
  evidence_ids: readonly string[];
}>;

export type Authorization = Readonly<{
  requirement: "none_stated" | "required" | "unclear";
  authorization_type: "work_authorization" | "residency" | "visa_sponsorship" | "other" | "none_stated";
  any_of_countries: readonly string[];
  original_text: string | null;
  evidence_ids: readonly string[];
}>;

export type LocalWindow = Readonly<{
  weekdays: readonly number[];
  start: string;
  end: string;
  crosses_midnight: boolean;
}>;

export type Schedule = Readonly<{
  status: "explicit" | "not_stated" | "unknown";
  timezone: string | null;
  // standard_utc_offset (B59-001): each offset names the zones whose standard (winter)
  // offset it is; their summer time is included.
  zone_semantics: "iana" | "fixed_utc_offset" | "standard_utc_offset" | "ambiguous" | "not_stated";
  mode: "daily_minimum" | "weekly_total" | "within_offset_set" | "not_stated" | "unknown";
  local_windows: readonly LocalWindow[];
  required_overlap_minutes: number | null;
  accepted_utc_offsets_minutes: readonly number[];
  original_text: string | null;
  evidence_ids: readonly string[];
}>;

export type HiringOption = Readonly<{
  id: string;
  geography: Geography;
  employment_types: readonly (
    "employment_full_time" | "employment_part_time" | "contractor" | "freelance"
    | "internship" | "temporary" | "unknown")[];
  authorization: Authorization;
  schedule: Schedule;
  evidence_ids: readonly string[];
}>;

export type CompensationRange = Readonly<{
  min: string | null;
  max: string | null;
  currency: string | null;
  period: "hourly" | "daily" | "weekly" | "fortnightly" | "monthly" | "annual" | "project" | "unknown";
  tax_basis: "gross" | "net" | "unknown";
  component: "base" | "total" | "unknown";
  applicable_countries: readonly string[];
  hours_per_week: number | null;
  paid_weeks_per_year: number | null;
  evidence_ids: readonly string[];
}>;

export type Compensation = Readonly<{
  ranges: readonly CompensationRange[];
  original_text: string | null;
  evidence_ids: readonly string[];
}>;

export type RequirementExpression = Readonly<
  | { op: "atom"; attribute: string; operator: "present" | "absent" | "at_least" | "at_most" | "equals" | "one_of"; value: string | number | boolean | readonly string[] }
  | { op: "all" | "any"; children: readonly RequirementExpression[] }
  | { op: "not"; child: RequirementExpression }
>;

export type Requirement = Readonly<{
  id: string;
  category: "skill" | "experience" | "language" | "education" | "certification" | "other";
  strength: "must" | "preferred" | "unclear";
  expression: RequirementExpression;
  original_text: string;
  evidence_ids: readonly string[];
}>;

export type Evidence = Readonly<{
  id: string;
  origin_type: "job_source" | "user_cv" | "user_confirmation" | "manual_review";
  origin_id: string;
  origin_version: number;
  field_path: string;
  quote: string | null;
  method: "source_field" | "rule" | "model" | "user_confirmed" | "human_review";
  confidence: number;
}>;

export type JobSnapshotLifecycle = "active" | "closed" | "stale" | "quarantined" | "tombstoned";

export type JobSnapshot = Readonly<{
  kind: "job_snapshot";
  schema_version: "1.0.0";
  id: string;
  version: number;
  source_record_id: string;
  title: string;
  company_name: string;
  company_domain: string | null;
  source_url: string;
  apply_url: string | null;
  description_text: string;
  description_language: string;
  workplace: Workplace;
  hiring_options: readonly HiringOption[];
  requirements: readonly Requirement[];
  compensation: Compensation;
  dates: Readonly<{
    source_published_at: string | null;
    fetched_at: string;
    last_seen_at: string;
    expires_at: string | null;
  }>;
  lifecycle: JobSnapshotLifecycle;
  conflicts: readonly string[];
  evidence: readonly Evidence[];
}>;

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u;
const ISO_COUNTRY = /^[A-Z]{2}$/u;
const ISO_3 = /^[A-Z]{3}$/u;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u;
const HH_MM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/u;
const ID_LIMIT = { min: 1, max: 160 } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}
function isBoundedId(value: unknown): value is string {
  return isString(value) && value.length >= ID_LIMIT.min && value.length <= ID_LIMIT.max;
}
function isIsoDateTime(value: unknown): value is string {
  return isString(value) && ISO_DATE_TIME.test(value);
}
function isHttpUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return isString(value) && (values as readonly string[]).includes(value);
}
function isCountryList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(c => isString(c) && ISO_COUNTRY.test(c));
}
function isEvidenceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isBoundedId) &&
    new Set(value).size === value.length;
}
function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isEvidence(value: unknown): value is Evidence {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "id", "origin_type", "origin_id", "origin_version", "field_path",
    "quote", "method", "confidence",
  ])) return false;
  return isBoundedId(value.id) &&
    isEnum(value.origin_type, ["job_source", "user_cv", "user_confirmation", "manual_review"]) &&
    isBoundedId(value.origin_id) &&
    isSafeInteger(value.origin_version) && value.origin_version >= 1 &&
    isString(value.field_path) &&
    (value.quote === null || isString(value.quote)) &&
    isEnum(value.method, ["source_field", "rule", "model", "user_confirmed", "human_review"]) &&
    typeof value.confidence === "number" && value.confidence >= 0 && value.confidence <= 1;
}

function isTriState(value: unknown): value is TriState {
  return isEnum(value, ["allowed", "denied", "unknown"]);
}

export function isSourcePolicy(value: unknown): value is SourcePolicy {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "kind", "schema_version", "id", "version", "source_id", "status", "enabled",
    "terms_urls", "terms_hash", "reviewed_at", "approved_by", "approval_reference",
    "valid_until", "permissions", "max_retention_hours", "min_poll_interval_seconds",
    "attribution", "apply_route", "allowed_surfaces",
  ])) return false;
  if (value.kind !== "source_policy" || value.schema_version !== "1.0.0") return false;
  if (!isBoundedId(value.id) || !isBoundedId(value.source_id)) return false;
  if (!isSafeInteger(value.version) || value.version < 1) return false;
  if (!isEnum(value.status, ["pending", "approved", "suspended", "revoked"])) return false;
  if (typeof value.enabled !== "boolean") return false;
  if (!Array.isArray(value.terms_urls) || !value.terms_urls.every(isHttpUrl)) return false;
  if (value.terms_hash !== null && !isString(value.terms_hash)) return false;
  if (value.reviewed_at !== null && !isIsoDateTime(value.reviewed_at)) return false;
  if (value.approved_by !== null && !isBoundedId(value.approved_by)) return false;
  if (value.approval_reference !== null && !isString(value.approval_reference)) return false;
  if (value.valid_until !== null && !isIsoDateTime(value.valid_until)) return false;
  const permissions = value.permissions;
  if (!isObject(permissions) ||
    !hasOnlyKeys(permissions, SOURCE_POLICY_PERMISSIONS) ||
    !SOURCE_POLICY_PERMISSIONS.every(permission => isTriState(permissions[permission]))) return false;
  if (value.max_retention_hours !== null &&
    (!isSafeInteger(value.max_retention_hours) || value.max_retention_hours < 0)) return false;
  if (!isSafeInteger(value.min_poll_interval_seconds) ||
    value.min_poll_interval_seconds < 1) return false;
  const attribution = value.attribution;
  if (!isObject(attribution) || !hasOnlyKeys(attribution, [
    "required", "display_name", "backlink_required", "link_rel", "logo_allowed",
  ])) return false;
  if (typeof attribution.required !== "boolean" ||
    !isString(attribution.display_name) ||
    typeof attribution.backlink_required !== "boolean" ||
    !Array.isArray(attribution.link_rel) || !attribution.link_rel.every(isString) ||
    !isTriState(attribution.logo_allowed)) return false;
  if (!isEnum(value.apply_route, ["source_required", "direct_allowed", "unknown"])) return false;
  if (!Array.isArray(value.allowed_surfaces) ||
    !value.allowed_surfaces.every(surface => isEnum(surface, [
      "public_web", "private_matching", "email", "ordinary_seo", "google_jobs", "external_api",
    ]))) return false;
  return true;
}

function isWorkplace(value: unknown): value is Workplace {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "type", "permanence", "mandatory_onsite", "mandatory_travel",
    "optional_offsites", "verification_state", "evidence_ids",
  ])) return false;
  return isEnum(value.type, ["remote", "hybrid", "onsite", "unknown"]) &&
    isEnum(value.permanence, ["permanent", "temporary", "after_onsite_onboarding", "unknown"]) &&
    isEnum(value.mandatory_onsite, ["required", "not_stated", "explicitly_not_required", "unknown"]) &&
    isEnum(value.mandatory_travel, ["required", "not_stated", "explicitly_not_required", "unknown"]) &&
    (value.optional_offsites === null || typeof value.optional_offsites === "boolean") &&
    isEnum(value.verification_state, ["confirmed", "unknown", "conflicting", "rejected"]) &&
    isEvidenceIds(value.evidence_ids);
}

function isGeography(value: unknown): value is Geography {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "scope", "allowed_countries", "excluded_countries", "allowed_subdivisions",
    "region_text", "exhaustive", "evidence_ids",
  ])) return false;
  return isEnum(value.scope, ["worldwide", "restricted", "unspecified"]) &&
    isCountryList(value.allowed_countries) && isCountryList(value.excluded_countries) &&
    Array.isArray(value.allowed_subdivisions) && value.allowed_subdivisions.every(isString) &&
    (value.region_text === null || isString(value.region_text)) &&
    typeof value.exhaustive === "boolean" && isEvidenceIds(value.evidence_ids);
}

function isAuthorization(value: unknown): value is Authorization {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "requirement", "authorization_type", "any_of_countries", "original_text", "evidence_ids",
  ])) return false;
  return isEnum(value.requirement, ["none_stated", "required", "unclear"]) &&
    isEnum(value.authorization_type, [
      "work_authorization", "residency", "visa_sponsorship", "other", "none_stated"]) &&
    isCountryList(value.any_of_countries) &&
    (value.original_text === null || isString(value.original_text)) &&
    isEvidenceIds(value.evidence_ids);
}

function isLocalWindow(value: unknown): value is LocalWindow {
  if (!isObject(value) || !hasOnlyKeys(value, ["weekdays", "start", "end", "crosses_midnight"])) {
    return false;
  }
  return Array.isArray(value.weekdays) && value.weekdays.length >= 1 &&
    value.weekdays.every(day => Number.isSafeInteger(day) && day >= 1 && day <= 7) &&
    new Set(value.weekdays).size === value.weekdays.length &&
    isString(value.start) && HH_MM.test(value.start) &&
    isString(value.end) && HH_MM.test(value.end) &&
    typeof value.crosses_midnight === "boolean";
}

function isSchedule(value: unknown): value is Schedule {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "status", "timezone", "zone_semantics", "mode", "local_windows",
    "required_overlap_minutes", "accepted_utc_offsets_minutes", "original_text", "evidence_ids",
  ])) return false;
  return isEnum(value.status, ["explicit", "not_stated", "unknown"]) &&
    (value.timezone === null || isString(value.timezone)) &&
    isEnum(value.zone_semantics, ["iana", "fixed_utc_offset", "standard_utc_offset", "ambiguous", "not_stated"]) &&
    isEnum(value.mode, ["daily_minimum", "weekly_total", "within_offset_set", "not_stated", "unknown"]) &&
    Array.isArray(value.local_windows) && value.local_windows.every(isLocalWindow) &&
    (value.required_overlap_minutes === null ||
      (isSafeInteger(value.required_overlap_minutes) &&
        value.required_overlap_minutes >= 0 && value.required_overlap_minutes <= 10080)) &&
    Array.isArray(value.accepted_utc_offsets_minutes) &&
    value.accepted_utc_offsets_minutes.every(offset =>
      Number.isSafeInteger(offset) && offset >= -840 && offset <= 840) &&
    (value.original_text === null || isString(value.original_text)) &&
    isEvidenceIds(value.evidence_ids);
}

function isHiringOption(value: unknown): value is HiringOption {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "id", "geography", "employment_types", "authorization", "schedule", "evidence_ids",
  ])) return false;
  const employmentTypes = ["employment_full_time", "employment_part_time", "contractor",
    "freelance", "internship", "temporary", "unknown"] as const;
  return isBoundedId(value.id) && isGeography(value.geography) &&
    Array.isArray(value.employment_types) && value.employment_types.length >= 1 &&
    value.employment_types.every(type => isEnum(type, employmentTypes)) &&
    new Set(value.employment_types).size === value.employment_types.length &&
    isAuthorization(value.authorization) && isSchedule(value.schedule) &&
    isEvidenceIds(value.evidence_ids);
}

function isCompensationRange(value: unknown): value is CompensationRange {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "min", "max", "currency", "period", "tax_basis", "component",
    "applicable_countries", "hours_per_week", "paid_weeks_per_year", "evidence_ids",
  ])) return false;
  return (value.min === null || (isString(value.min) && DECIMAL.test(value.min))) &&
    (value.max === null || (isString(value.max) && DECIMAL.test(value.max))) &&
    (value.currency === null || (isString(value.currency) && ISO_3.test(value.currency))) &&
    isEnum(value.period, ["hourly", "daily", "weekly", "fortnightly", "monthly", "annual", "project", "unknown"]) &&
    isEnum(value.tax_basis, ["gross", "net", "unknown"]) &&
    isEnum(value.component, ["base", "total", "unknown"]) &&
    isCountryList(value.applicable_countries) &&
    (value.hours_per_week === null || (typeof value.hours_per_week === "number" &&
      value.hours_per_week > 0 && value.hours_per_week <= 168)) &&
    (value.paid_weeks_per_year === null || (typeof value.paid_weeks_per_year === "number" &&
      value.paid_weeks_per_year > 0 && value.paid_weeks_per_year <= 53)) &&
    isEvidenceIds(value.evidence_ids);
}

function isCompensation(value: unknown): value is Compensation {
  if (!isObject(value) || !hasOnlyKeys(value, ["ranges", "original_text", "evidence_ids"])) {
    return false;
  }
  return Array.isArray(value.ranges) && value.ranges.every(isCompensationRange) &&
    (value.original_text === null || isString(value.original_text)) &&
    isEvidenceIds(value.evidence_ids);
}

function isRequirementExpression(value: unknown, depth = 0): value is RequirementExpression {
  if (!isObject(value) || depth > 8) return false;
  if (value.op === "atom") {
    return hasOnlyKeys(value, ["op", "attribute", "operator", "value"]) &&
      isString(value.attribute) &&
      isEnum(value.operator, ["present", "absent", "at_least", "at_most", "equals", "one_of"]) &&
      (isString(value.value) || typeof value.value === "number" || typeof value.value === "boolean" ||
        (Array.isArray(value.value) && value.value.every(isString)));
  }
  if (value.op === "not") {
    return hasOnlyKeys(value, ["op", "child"]) && isRequirementExpression(value.child, depth + 1);
  }
  if (value.op === "all" || value.op === "any") {
    return hasOnlyKeys(value, ["op", "children"]) && Array.isArray(value.children) &&
      value.children.length >= 1 &&
      value.children.every(child => isRequirementExpression(child, depth + 1));
  }
  return false;
}

function isRequirement(value: unknown): value is Requirement {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "id", "category", "strength", "expression", "original_text", "evidence_ids",
  ])) return false;
  return isBoundedId(value.id) &&
    isEnum(value.category, ["skill", "experience", "language", "education", "certification", "other"]) &&
    isEnum(value.strength, ["must", "preferred", "unclear"]) &&
    isRequirementExpression(value.expression) && isString(value.original_text) &&
    isEvidenceIds(value.evidence_ids);
}

export function isJobSnapshot(value: unknown): value is JobSnapshot {
  if (!isObject(value) || !hasOnlyKeys(value, [
    "kind", "schema_version", "id", "version", "source_record_id", "title", "company_name",
    "company_domain", "source_url", "apply_url", "description_text", "description_language",
    "workplace", "hiring_options", "requirements", "compensation", "dates", "lifecycle",
    "conflicts", "evidence",
  ])) return false;
  if (value.kind !== "job_snapshot" || value.schema_version !== "1.0.0") return false;
  if (!isBoundedId(value.id) || !isBoundedId(value.source_record_id)) return false;
  if (!isSafeInteger(value.version) || value.version < 1) return false;
  if (!isString(value.title) || !isString(value.company_name)) return false;
  if (value.company_domain !== null && !isString(value.company_domain)) return false;
  if (!isHttpUrl(value.source_url)) return false;
  if (value.apply_url !== null && !isHttpUrl(value.apply_url)) return false;
  if (!isString(value.description_text) || !isString(value.description_language)) return false;
  const dates = value.dates;
  if (!isObject(dates) || !hasOnlyKeys(dates, [
    "source_published_at", "fetched_at", "last_seen_at", "expires_at",
  ])) return false;
  if (dates.source_published_at !== null && !isIsoDateTime(dates.source_published_at)) return false;
  if (!isIsoDateTime(dates.fetched_at) || !isIsoDateTime(dates.last_seen_at)) return false;
  if (dates.expires_at !== null && !isIsoDateTime(dates.expires_at)) return false;
  return isWorkplace(value.workplace) &&
    Array.isArray(value.hiring_options) && value.hiring_options.every(isHiringOption) &&
    Array.isArray(value.requirements) && value.requirements.every(isRequirement) &&
    isCompensation(value.compensation) &&
    isEnum(value.lifecycle, ["active", "closed", "stale", "quarantined", "tombstoned"]) &&
    Array.isArray(value.conflicts) && value.conflicts.every(isString) &&
    Array.isArray(value.evidence) && value.evidence.every(isEvidence);
}
