// S1-007: the RemoteJobs.org source — the approved and activated policy, the mapper (remote
// rule, geography, schedule, salary, dates), the window import, the transport and the ids.
// Every record here is synthetic. The policy is committed approved and enabled (matrix
// approved and activated by the owner 2026-11-07); the refusal tests switch clones of it off.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isJobSnapshot, isSourcePolicy, SNAPSHOT_ID_PATTERN, SNAPSHOT_SOURCE_IDS,
  SOURCE_POLICY_PERMISSIONS, type JobSnapshot,
} from "../../src/domain/source-contracts.ts";
import {
  mapRemoteJobsOrgFixture, mapRemoteJobsOrgRecord, remoteJobsOrgContractFixture,
  remoteJobsOrgExcerptOf, type RemoteJobsOrgApplicantLocation, type RemoteJobsOrgRawRecord,
} from "../../src/server/import/remotejobs-org-fixture.ts";
import {
  REMOTE_JOBS_ORG_DEFAULT_RETRY_AFTER_SECONDS, runRemoteJobsOrgImport,
} from "../../src/server/import/remotejobs-org-adapter.ts";
import { AdapterInputError, mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import { mapJobicyFixture } from "../../src/server/import/jobicy-fixture.ts";
import { mapRemoteFirstJobsFixture } from "../../src/server/import/remote-first-jobs-fixture.ts";
import { createMemoryPersistence } from "../../src/server/import/himalayas-adapter.ts";
import {
  fetchHimalayasPage, fetchJobicyWindow, fetchRemoteFirstJobsPage,
  fetchRemoteJobsOrgPage, REMOTE_JOBS_ORG_MAX_PAGES, REMOTE_JOBS_ORG_PAGE_SIZE,
  retryAfterSecondsOf, type RemoteJobsOrgPageResult,
} from "../../src/server/import/fetcher.ts";
import { nextDueAt } from "../../src/server/import/scheduler.ts";
import {
  getSourcePolicy, maySendTextToProvider, permissionFor, remoteJobsOrgCandidatePolicy,
} from "../../src/server/source-policies.ts";
import { classifySnapshot, policyPublishes } from "../../src/domain/snapshot-projection.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import { parseManualProfileInput } from "../../src/domain/profile.ts";
import { parseEventBatch } from "../../src/domain/events.ts";

const NOW = "2026-11-07T12:00:00.000Z";
const LISTING = "https://remotejobs.org/remote-jobs/";
// The policy as activated by the owner 2026-11-07; tests derive the switched-off forms from it.
const activePolicy = remoteJobsOrgCandidatePolicy;
const [remoteJob, hybridJob, reviewJob] = remoteJobsOrgContractFixture as
  readonly [RemoteJobsOrgRawRecord, RemoteJobsOrgRawRecord, RemoteJobsOrgRawRecord];
const KNOWN_US_CA = remoteJob.applicant_location_requirements!;

function withLocation(patch: Partial<RemoteJobsOrgApplicantLocation> | null): RemoteJobsOrgRawRecord {
  return {
    ...remoteJob,
    applicant_location_requirements: patch === null ? null : { ...KNOWN_US_CA, ...patch },
  };
}

function posting(title: string, description: string, patch: Partial<RemoteJobsOrgRawRecord> = {}): JobSnapshot {
  return mapRemoteJobsOrgRecord({ ...remoteJob, title, description: `<p>${description}</p>`, ...patch }, NOW);
}

function rejectionOf(raw: RemoteJobsOrgRawRecord): string | null {
  try {
    mapRemoteJobsOrgRecord(raw, NOW);
    return null;
  } catch (error) {
    assert.ok(error instanceof AdapterInputError);
    return error.message;
  }
}

function rule(snapshot: JobSnapshot, ruleId: string, residenceCountry = "US") {
  const profile = parseManualProfileInput({
    residenceCountry, timezone: "America/New_York", targetRoles: ["engineer"], skills: [],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
  });
  return evaluateJob(snapshot, profile).rules.find(item => item.ruleId === ruleId)?.outcome;
}

function geographyOf(snapshot: JobSnapshot) {
  return snapshot.hiring_options[0]!.geography;
}

// A paged stand-in for the transport: answers offset n*50 with pages[n] and records the calls.
function pagedFeed(pages: readonly RemoteJobsOrgPageResult[]) {
  const asked: number[] = [];
  return {
    asked,
    transport: async (offset: number): Promise<RemoteJobsOrgPageResult> => {
      asked.push(offset);
      return pages[offset / REMOTE_JOBS_ORG_PAGE_SIZE] ?? { status: "ok", jobs: [], hasMore: false };
    },
  };
}

// Stand-ins for what `fetch` answers, for the tests that run the real fetcher.
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function envelopeBody(offset: number, patch: Record<string, unknown> = {}) {
  return {
    data: [{ id: "synthetic" }], pagination: { total: 51, limit: 50, offset, has_more: true },
    meta: { powered_by: "RemoteJobs.org", search: { request_version: "job-search-request/1" } }, ...patch,
  };
}

// A 200 whose body fails while it is read, as undici reports a connection the other side closed.
function failingBody(): Response {
  const cause = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
  return new Response(new ReadableStream({
    start(controller) { controller.error(Object.assign(new TypeError("terminated"), { cause })); },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

// A full page of distinct synthetic postings, so the walk does not stop early.
function fullPage(page: number, hasMore = true): RemoteJobsOrgPageResult {
  return {
    status: "ok", hasMore,
    jobs: Array.from({ length: REMOTE_JOBS_ORG_PAGE_SIZE }, (_, index) => ({
      ...remoteJob,
      id: `5f0c1e2a-7b3d-4c8e-9a10-${String(page * 1000 + index).padStart(12, "0")}`,
      url: `${LISTING}fixture-job-${page}-${index}`,
      apply_url: `${LISTING}fixture-job-${page}-${index}`,
    })),
  };
}

test("policy: approved and activated; rollback by enabled: false denies everything", () => {
  const policy = remoteJobsOrgCandidatePolicy;
  assert.equal(isSourcePolicy(policy), true);
  assert.equal(getSourcePolicy("remotejobs_org"), policy);
  // Owner decision 6 (the matrix) and the separate activation, both 2026-11-07.
  assert.equal(policy.status, "approved");
  assert.equal(policy.version, 3);
  assert.equal(policy.approved_by, "owner");
  assert.match(policy.approval_reference ?? "",
    /Owner-approved permission matrix 2026-11-07.*activated by the owner 2026-11-07 as a separate decision/u);
  assert.equal(policy.enabled, true);
  assert.equal(permissionFor(policy, "fetch", NOW), "allowed");
  assert.equal(policyPublishes(policy, NOW), true);
  // Active or not, its text never goes to the provider.
  assert.equal(maySendTextToProvider("remotejobs_org", NOW), false);
  // Rollback without other code changes: a disabled or pending clone denies every operation
  // and publishes nothing (0 cards in catalog and matching).
  for (const off of [{ ...policy, enabled: false }, { ...policy, status: "pending" as const }]) {
    for (const permission of SOURCE_POLICY_PERMISSIONS) {
      assert.equal(permissionFor(off, permission, NOW), "denied", permission);
    }
    assert.equal(policyPublishes(off, NOW), false);
  }
});

test("policy: the approved matrix holds owner decisions 1–5 of 2026-11-07", () => {
  const permissions = remoteJobsOrgCandidatePolicy.permissions;
  for (const permission of ["fetch", "cache", "store_full_text", "store_excerpt",
    "derive_fields", "process_with_ml", "publish_excerpt"] as const) {
    assert.equal(permissions[permission], "allowed", permission);
  }
  // Local ML only: nothing about the source's text leaves the machine, approved or not.
  assert.equal(permissions.send_to_ai_provider, "unknown");
  assert.equal(permissionFor(activePolicy, "send_to_ai_provider", NOW), "unknown");
  for (const permission of ["publish_full_text", "send_email", "index_web_page",
    "syndicate_google_jobs", "train_model", "direct_apply", "bulk_export"] as const) {
    assert.equal(permissions[permission], "denied", permission);
  }
  const policy = remoteJobsOrgCandidatePolicy;
  assert.equal(policy.min_poll_interval_seconds, 21600);
  assert.equal(policy.max_retention_hours, 720);
  assert.deepEqual(policy.attribution, {
    required: true, display_name: "RemoteJobs.org", backlink_required: true,
    link_rel: ["nofollow"], logo_allowed: "unknown",
    // Owner decision 2026-11-07: the API page's suggested credit on every card.
    credit_line: { text: "Powered by RemoteJobs.org", url: "https://remotejobs.org" },
  });
  assert.equal(policy.apply_route, "source_required");
  assert.deepEqual(policy.terms_urls, ["https://remotejobs.org/developers/api", "https://www.remotejobs.org/terms"]);
  // Enabled, it publishes; the re-review date still applies.
  assert.equal(policyPublishes(activePolicy, NOW), true);
  assert.equal(permissionFor(activePolicy, "fetch", "2026-12-23T00:00:00.000Z"), "denied");
});

test("mapper: the fixture validates, ids are stable, and each work mode lands where decided", () => {
  const snapshots = mapRemoteJobsOrgFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true, snapshot.id);
  assert.deepEqual(snapshots.map(s => s.id), mapRemoteJobsOrgFixture("2026-11-08T00:00:00.000Z").map(s => s.id));
  const [remote, hybrid, review] = snapshots as [JobSnapshot, JobSnapshot, JobSnapshot];

  assert.equal(remote.id, `remotejobs_org:${remoteJob.id}`);
  assert.equal(remote.source_url, remoteJob.url);
  assert.equal(remote.apply_url, null); // the listing is the application route
  assert.equal(remote.workplace.verification_state, "confirmed");
  assert.equal(classifySnapshot(remote), "main_catalog");
  const evidence = remote.evidence.find(item => item.id.endsWith(":workplace"))!;
  assert.equal(evidence.field_path, "applicant_location_requirements.work_arrangement");
  assert.equal(evidence.method, "source_field");
  // The appended "Apply directly on RemoteJobs.org" line is the source's, not the employer's.
  assert.equal(remote.description_text.includes("Apply directly"), false);
  assert.ok(remote.description_text.endsWith("Operate the platform"), remote.description_text);

  assert.equal(hybrid.workplace.verification_state, "conflicting");
  assert.equal(hybrid.workplace.mandatory_onsite, "required");
  assert.deepEqual(hybrid.conflicts, ["remote-claim-vs-office-text"]);
  assert.equal(classifySnapshot(hybrid), "excluded");

  assert.equal(review.workplace.verification_state, "unknown");
  assert.equal(review.workplace.mandatory_onsite, "unknown");
  assert.equal(review.evidence.find(item => item.id.endsWith(":workplace"))?.quote, "office");
  assert.equal(classifySnapshot(review), "needs_review");
});

test("remote rule: the source's remote field under our office-vocabulary veto", () => {
  // The source's field confirms when the posting says nothing against it.
  assert.equal(classifySnapshot(posting("Data Analyst", "Build dashboards for the finance team.")), "main_catalog");
  // The two fields the filter reads: either one is the source's claim.
  const viaLocation = mapRemoteJobsOrgRecord({
    ...remoteJob, applicant_location_requirements: null,
    location_normalization: { work_arrangement: "remote" },
  }, NOW);
  assert.equal(classifySnapshot(viaLocation), "main_catalog");
  assert.equal(viaLocation.evidence.find(item => item.id.endsWith(":workplace"))?.field_path,
    "location_normalization.work_arrangement");
  // Outside the requested filter: refused, never stored.
  for (const arrangement of ["unknown", null, undefined]) {
    assert.equal(rejectionOf({
      ...remoteJob, location_normalization: { work_arrangement: "unknown" },
      applicant_location_requirements: { ...KNOWN_US_CA, work_arrangement: arrangement as never },
    }), "NOT_REMOTE", String(arrangement));
  }
  // The source's own hybrid or onsite field contradicts the claim: excluded.
  for (const arrangement of ["hybrid", "onsite"]) {
    const contradicted = mapRemoteJobsOrgRecord({ ...remoteJob, location_normalization: { work_arrangement: arrangement } }, NOW);
    assert.equal(classifySnapshot(contradicted), "excluded", arrangement);
    assert.deepEqual(contradicted.conflicts, ["remote-claim-vs-source-arrangement"]);
    assert.equal(contradicted.evidence.find(item => item.id.endsWith(":workplace"))?.quote, arrangement);
  }
  // An office statement excludes, any other office word waits for review, as for Remote
  // First Jobs (the same rule, B65).
  assert.equal(classifySnapshot(posting("Account Manager", "This is an in-person role at our clinic.")), "excluded");
  assert.equal(classifySnapshot(posting("Account Manager (Hybrid)", "Sell to customers.")), "excluded");
  assert.equal(classifySnapshot(posting("Account Manager", "Commuter benefits for the Berlin HQ.")), "needs_review");
  assert.equal(classifySnapshot(posting("Account Manager", "Zwei Tage pro Woche im Büro.")), "needs_review");
  // Temporarily remote is not remote work.
  assert.equal(classifySnapshot(posting("Account Manager", "This role is temporarily remote.")), "excluded");
  // Required travel is read too (B64-001): still listed, REMOTE-01 decides for the candidate.
  const travel = posting("Field Engineer", "Travel up to 50% of the time is required.");
  assert.equal(travel.workplace.mandatory_travel, "required");
  assert.equal(rule(travel, "REMOTE-01"), "fail");
});

test("geography: their structured reading with its status, never wider than it says", () => {
  // Known, whole countries, nothing beside them: the whole list.
  const known = mapRemoteJobsOrgRecord(remoteJob, NOW);
  assert.deepEqual(geographyOf(known), {
    scope: "restricted", allowed_countries: ["US", "CA"], excluded_countries: [],
    allowed_subdivisions: [], region_text: "United States, Canada", exhaustive: true,
    evidence_ids: [`ev:${known.id}:geo`],
  });
  assert.equal(rule(known, "GEO-01", "CA"), "pass");
  assert.equal(rule(known, "GEO-01", "DE"), "fail");
  // Partial: the countries named pass, the others are unknown, never failed.
  const partial = mapRemoteJobsOrgRecord(withLocation({ status: "partial" }), NOW);
  assert.equal(geographyOf(partial).exhaustive, false);
  assert.equal(rule(partial, "GEO-01", "US"), "pass");
  assert.equal(rule(partial, "GEO-01", "DE"), "unknown");
  // A region beside the list makes it incomplete too.
  assert.equal(geographyOf(mapRemoteJobsOrgRecord(withLocation({ regions: ["LATAM"] }), NOW)).exhaustive, false);
  // Exclusions always narrow.
  const excluded = mapRemoteJobsOrgRecord(withLocation({ excluded_countries: ["CA"] }), NOW);
  assert.deepEqual(geographyOf(excluded).allowed_countries, ["US"]);
  assert.equal(rule(excluded, "GEO-01", "CA"), "fail");
  // Subdivisions: a country with some states allowed, or one carved out, is no
  // whole-country permission. Its residents are unknown.
  const states = mapRemoteJobsOrgRecord(withLocation({ allowed_countries: [], allowed_subdivisions: ["US-TX", "US-FL"] }), NOW);
  assert.deepEqual(geographyOf(states).allowed_countries, []);
  assert.deepEqual(geographyOf(states).allowed_subdivisions, ["US-TX", "US-FL"]);
  assert.equal(rule(states, "GEO-01", "US"), "unknown");
  const carvedOut = mapRemoteJobsOrgRecord(withLocation({ excluded_subdivisions: ["CA-QC"] }), NOW);
  assert.deepEqual(geographyOf(carvedOut).allowed_countries, ["US"]);
  assert.equal(geographyOf(carvedOut).exhaustive, false);
  assert.equal(rule(carvedOut, "GEO-01", "CA"), "unknown");
  // An unresolved note is a limit the source could not express ("Charlotte, NC or
  // nearby"): no country passes, the exclusions still hold.
  const unresolved = mapRemoteJobsOrgRecord(withLocation({
    unresolved: ["The role requires Charlotte, NC or nearby."], excluded_countries: ["MX"],
  }), NOW);
  assert.deepEqual(geographyOf(unresolved).allowed_countries, []);
  assert.equal(rule(unresolved, "GEO-01", "US"), "unknown");
  assert.equal(rule(unresolved, "GEO-01", "MX"), "fail");
  // So does a condition that is neither context nor a working-hours requirement, of any
  // kind or effect; its words are kept.
  for (const condition of [{ kind: "license", effect: "require", details: "Current and unrestricted Nurse Practitioner license in Utah." },
    { kind: "residence", effect: "uncertain", details: null }, { kind: "work_location", effect: "conflicting", details: "Charlotte" }]) {
    const limited = mapRemoteJobsOrgRecord(withLocation({ conditions: [condition], excluded_countries: ["MX"] }), NOW);
    assert.deepEqual(geographyOf(limited).allowed_countries, [], JSON.stringify(condition));
    assert.equal(rule(limited, "GEO-01", "US"), "unknown", JSON.stringify(condition));
    assert.equal(rule(limited, "GEO-01", "MX"), "fail", JSON.stringify(condition));
    const quote = limited.evidence.find(item => item.id === `ev:${limited.id}:geo:conditions`)?.quote;
    assert.equal(quote, condition.details ?? `${condition.kind} ${condition.effect}`);
    assert.ok(geographyOf(limited).evidence_ids.includes(`ev:${limited.id}:geo:conditions`));
    assert.equal(isJobSnapshot(limited), true);
  }
  // Context and a working-hours requirement leave the list as it is.
  const hours = mapRemoteJobsOrgRecord(withLocation({ conditions: [
    { kind: "license", effect: "context", details: "Bar membership preferred" },
    { kind: "timezone", effect: "require", details: "US business hours" }] }), NOW);
  assert.deepEqual(geographyOf(hours).allowed_countries, ["US", "CA"]);
  assert.equal(geographyOf(hours).exhaustive, true);
  // Unknown or conflicting status: restricted, but no country is known.
  for (const status of ["unknown", "conflicting"]) {
    const unsure = mapRemoteJobsOrgRecord(withLocation({ status }), NOW);
    assert.equal(geographyOf(unsure).scope, "restricted", status);
    assert.deepEqual(geographyOf(unsure).allowed_countries, [], status);
    assert.equal(rule(unsure, "GEO-01", "US"), "unknown", status);
  }
  // No interpretation (null or empty) is unspecified.
  for (const none of [null, {}]) {
    const silent = mapRemoteJobsOrgRecord({
      ...remoteJob, applicant_location_requirements: none as never,
      location_normalization: { work_arrangement: "remote" },
    }, NOW);
    assert.equal(geographyOf(silent).scope, "unspecified");
    assert.equal(rule(silent, "GEO-01", "US"), "unknown");
  }
  // Bare "Remote" is not worldwide: an unverified worldwide scope is unspecified.
  const unverified = mapRemoteJobsOrgRecord(withLocation({
    scope: "worldwide", allowed_countries: [], worldwide_permission_verified: false,
  }), NOW);
  assert.equal(geographyOf(unverified).scope, "unspecified");
  assert.equal(rule(unverified, "GEO-01", "DE"), "unknown");
  // A verified one is worldwide, and the text can still narrow it.
  const verified = mapRemoteJobsOrgRecord(withLocation({
    scope: "worldwide", allowed_countries: [], worldwide_permission_verified: true, excluded_countries: ["RU"],
  }), NOW);
  assert.equal(geographyOf(verified).scope, "worldwide");
  assert.deepEqual(geographyOf(verified).excluded_countries, ["RU"]);
  assert.equal(rule(verified, "GEO-01", "DE"), "pass");
  assert.equal(rule(verified, "GEO-01", "RU"), "fail");
  // Verified but carving out a state, naming a region or countries, partial, with an
  // unresolved note or a condition: unspecified.
  for (const patch of [{ excluded_subdivisions: ["CA-QC"] }, { allowed_subdivisions: ["US-TX"] },
    { regions: ["EMEA"] }, { allowed_regions: ["Europe"] }, { allowed_countries: ["US"] },
    { status: "partial" }, { unresolved: ["Only some provinces."] },
    { conditions: [{ kind: "residence", effect: "uncertain", details: "Some countries only" }] }]) {
    const doubtful = mapRemoteJobsOrgRecord(withLocation({
      scope: "worldwide", allowed_countries: [], worldwide_permission_verified: true, ...patch,
    }), NOW);
    assert.equal(geographyOf(doubtful).scope, "unspecified", JSON.stringify(patch));
    assert.equal(rule(doubtful, "GEO-01", "CA"), "unknown", JSON.stringify(patch));
  }
  const narrowed = mapRemoteJobsOrgRecord({
    ...withLocation({ scope: "worldwide", allowed_countries: [], worldwide_permission_verified: true }),
    description: "<p>Candidates must reside in Canada.</p>",
  }, NOW);
  assert.equal(geographyOf(narrowed).scope, "restricted");
  assert.deepEqual(geographyOf(narrowed).allowed_countries, ["CA"]);
  assert.deepEqual(narrowed.conflicts, ["geography-source-vs-text"]);
  // A malformed reading is one bad record.
  for (const patch of [{ allowed_countries: ["usa"] }, { allowed_countries: "US" as never },
    { excluded_subdivisions: ["Quebec"] }, { conditions: ["timezone"] as never }]) {
    assert.equal(rejectionOf(withLocation(patch)), "INVALID_GEOGRAPHY", JSON.stringify(patch));
  }
  assert.equal(rejectionOf({
    ...remoteJob, applicant_location_requirements: "US" as never, location_normalization: { work_arrangement: "remote" },
  }), "INVALID_GEOGRAPHY");
});

test("schedule: a required working-hours condition is unknown with the source's words, never not stated", () => {
  const timed = mapRemoteJobsOrgRecord(withLocation({
    conditions: [{ kind: "timezone", effect: "require", details: "You must be within CET ±2 hours" }],
  }), NOW);
  const schedule = timed.hiring_options[0]!.schedule;
  assert.equal(schedule.status, "unknown");
  assert.equal(schedule.zone_semantics, "ambiguous");
  assert.equal(schedule.original_text, "You must be within CET ±2 hours");
  assert.equal(rule(timed, "TIME-01"), "unknown");
  assert.equal(isJobSnapshot(timed), true);
  // Context ("flexible hours") and other kinds are not working-hours requirements.
  const context = mapRemoteJobsOrgRecord(withLocation({
    conditions: [{ kind: "timezone", effect: "context", details: "Flexible working hours" },
      { kind: "license", effect: "require", details: "A Utah licence" }],
  }), NOW);
  assert.equal(context.hiring_options[0]!.schedule.status, "not_stated");
  assert.equal(rule(context, "TIME-01"), "not_applicable");
});

test("salary: native currency and period, never converted; a range needs both", () => {
  const annual = mapRemoteJobsOrgRecord(remoteJob, NOW);
  assert.deepEqual(annual.compensation.ranges.map(range => [range.min, range.max, range.currency, range.period]),
    [["120000", "150000", "USD", "annual"]]);
  assert.equal(annual.compensation.original_text, "USD 120,000–150,000/year");
  const hourly = mapRemoteJobsOrgRecord(reviewJob, NOW);
  assert.deepEqual(hourly.compensation.ranges.map(range => [range.min, range.max, range.currency, range.period]),
    [["25", "30", "CAD", "hourly"]]);
  const monthly = mapRemoteJobsOrgRecord({ ...remoteJob, salary_min: 3000, salary_max: null,
    salary_currency: "EUR", salary_period: "month", salary_text: null, salary_source_text: null }, NOW);
  assert.deepEqual(monthly.compensation.ranges.map(range => [range.min, range.max, range.currency, range.period]),
    [["3000", null, "EUR", "monthly"]]);
  assert.equal(monthly.compensation.original_text, "3000–? EUR / month");
  // A missing currency or an unknown period keeps the source's wording, unstructured.
  for (const patch of [{ salary_currency: null }, { salary_period: null }, { salary_period: "quarter" }, { salary_currency: "usd" }]) {
    const loose = mapRemoteJobsOrgRecord({ ...remoteJob, ...patch }, NOW);
    assert.deepEqual(loose.compensation.ranges, [], JSON.stringify(patch));
    assert.equal(loose.compensation.original_text, "USD 120,000–150,000/year", JSON.stringify(patch));
  }
  // No amount, no salary, whatever the period says (the live feed sends "year" alone).
  assert.deepEqual(mapRemoteJobsOrgRecord(hybridJob, NOW).compensation, { ranges: [], original_text: null, evidence_ids: [] });
  for (const patch of [{ salary_min: -1 }, { salary_max: Number.NaN }, { salary_min: "100" as never },
    { salary_min: 1e21 }, { salary_min: 200, salary_max: 100 }, { salary_currency: 840 as never }]) {
    assert.equal(rejectionOf({ ...remoteJob, ...patch }), "INVALID_SALARY", JSON.stringify(patch));
  }
});

test("employment types: Google JobPosting classes map to contracts; the rest is unknown", () => {
  const types = (value: readonly string[] | null) =>
    mapRemoteJobsOrgRecord({ ...remoteJob, employment_types: value }, NOW).hiring_options[0]!.employment_types;
  assert.deepEqual(types(["FULL_TIME", "CONTRACTOR"]), ["employment_full_time", "contractor"]);
  assert.deepEqual(types(["PART_TIME", "INTERN", "TEMPORARY"]), ["employment_part_time", "internship", "temporary"]);
  assert.deepEqual(types(["VOLUNTEER"]), ["unknown"]);
  assert.deepEqual(types(null), ["unknown"]);
  assert.deepEqual(types([]), ["unknown"]);
  assert.equal(rejectionOf({ ...remoteJob, employment_types: "FULL_TIME" as never }), "INVALID_EMPLOYMENT_TYPES");
});

test("dates: the timestamp with its offset; a zero time is day precision, never an invented time", () => {
  const dateOnly = mapRemoteJobsOrgRecord(remoteJob, NOW);
  assert.equal(dateOnly.dates.source_published_at, "2026-11-06T00:00:00.000Z");
  assert.equal(dateOnly.evidence.find(item => item.id.endsWith(":posted"))?.quote,
    "2026-11-06T00:00:00+00:00 (day precision: no time given)");
  const timed = mapRemoteJobsOrgRecord({ ...remoteJob, posted_at: "2026-11-07T04:52:01+00:00" }, NOW);
  assert.equal(timed.dates.source_published_at, "2026-11-07T04:52:01.000Z");
  assert.equal(timed.evidence.some(item => item.id.endsWith(":posted")), false);
  assert.equal(mapRemoteJobsOrgRecord({ ...remoteJob, posted_at: "2026-10-01T09:00:00Z" }, NOW).dates.source_published_at,
    "2026-10-01T09:00:00.000Z");
  assert.equal(mapRemoteJobsOrgRecord({ ...remoteJob, posted_at: "2026-11-07T01:30:00+02:00" }, NOW).dates.source_published_at,
    "2026-11-06T23:30:00.000Z");
  for (const posted of ["2026-11-07", "2026-11-07T04:52:01", "2026-02-30T00:00:00Z", "yesterday", 1730937600]) {
    assert.equal(rejectionOf({ ...remoteJob, posted_at: posted as never }), "INVALID_PUB_DATE", String(posted));
  }
});

test("validation: identity, the pinned listing URL, an intact application link and required text", () => {
  const cases: [Partial<RemoteJobsOrgRawRecord>, string][] = [
    [{ id: "5F0C1E2A-7B3D-4C8E-9A10-000000900201" }, "INVALID_ID"],
    [{ id: "platform-engineer" }, "INVALID_ID"],
    [{ id: 900201 as never }, "INVALID_ID"],
    [{ url: "not a url" }, "INVALID_URL"],
    [{ url: "http://remotejobs.org/remote-jobs/x" }, "INVALID_URL_HOST"],
    [{ url: "https://www.remotejobs.org/remote-jobs/x" }, "INVALID_URL_HOST"],
    [{ url: "https://evil.example/remote-jobs/x" }, "INVALID_URL_HOST"],
    [{ url: "https://remotejobs.org:8443/remote-jobs/x" }, "INVALID_URL_HOST"],
    [{ url: "https://remotejobs.org/companies/acme" }, "INVALID_URL_PATH"],
    [{ url: "https://remotejobs.org/remote-jobs/Upper-Case" }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}?ref=x` }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}#apply` }, "INVALID_URL_PATH"],
    [{ url: `${remoteJob.url}?` }, "INVALID_URL_PATH"],
    [{ url: `${LISTING}${"a".repeat(220)}` }, "INVALID_URL_PATH"],
    [{ apply_url: "https://boards.example/apply/1" }, "INVALID_APPLY_URL"],
    [{ title: "  " }, "EMPTY_TITLE"],
    [{ company: { name: "" } }, "EMPTY_COMPANY"],
    [{ company: null as never }, "EMPTY_COMPANY"],
    [{ description: "<p> </p>" }, "EMPTY_DESCRIPTION"],
    [{ description: `<p>Apply directly on <a href="https://remotejobs.org">RemoteJobs.org</a>: ${remoteJob.url}</p>` }, "EMPTY_DESCRIPTION"],
    [{ description: null as never }, "EMPTY_DESCRIPTION"],
  ];
  for (const [patch, code] of cases) {
    // Keep apply_url equal to url unless the case is about it.
    const raw = { ...remoteJob, ...patch };
    assert.equal(rejectionOf("apply_url" in patch ? raw : { ...raw, apply_url: raw.url }), code, JSON.stringify(patch));
  }
  for (const apply of [null, undefined]) {
    assert.equal(rejectionOf({ ...remoteJob, apply_url: apply }), null, String(apply));
  }
  assert.equal(rejectionOf(null as never), "INVALID_RECORD");
  assert.equal(rejectionOf([] as never), "INVALID_RECORD");
  // Another original language is kept when the listing was not translated.
  assert.equal(mapRemoteJobsOrgRecord({ ...remoteJob, original_language: "de" }, NOW).description_language, "de");
  assert.equal(mapRemoteJobsOrgRecord({ ...remoteJob, original_language: "de", is_translated: true }, NOW).description_language, "en");
});

test("excerpt: the start of the text, cut at a word", () => {
  const short = mapRemoteJobsOrgRecord(remoteJob, NOW);
  assert.equal(remoteJobsOrgExcerptOf(short), short.description_text);
  const long = posting("Engineer", `${"word ".repeat(200)}end`);
  const excerpt = remoteJobsOrgExcerptOf(long);
  assert.ok(excerpt.length <= 301, String(excerpt.length));
  assert.ok(excerpt.endsWith("word…"), excerpt.slice(-10));
});

test("window import: a disabled (rollback), pending or revoked policy refuses before any request", async () => {
  for (const policy of [{ ...activePolicy, enabled: false }, { ...activePolicy, status: "pending" as const },
    { ...activePolicy, status: "revoked" as const }]) {
    const feed = pagedFeed([fullPage(0)]);
    const persistence = createMemoryPersistence();
    const report = await runRemoteJobsOrgImport({ transport: feed.transport, persistence, policy, now: NOW });
    assert.equal(report.result, "refused_disabled");
    assert.deepEqual(feed.asked, []);
    assert.equal(persistence.state, null);
  }
});

test("window import: pages in order until the feed ends; always partial, idempotent, poll-gated", async () => {
  const persistence = createMemoryPersistence();
  const feed = pagedFeed([fullPage(0), { status: "ok", jobs: [...remoteJobsOrgContractFixture], hasMore: false }]);
  const first = await runRemoteJobsOrgImport({ transport: feed.transport, persistence, policy: activePolicy, now: NOW });
  assert.equal(first.result, "partial");
  assert.equal(first.traversal, "complete");
  assert.equal(first.failedPage, null);
  assert.deepEqual(feed.asked, [0, 50]);
  assert.equal(first.recordsMapped, REMOTE_JOBS_ORG_PAGE_SIZE + 3);
  const stored = await persistence.loadStore();
  assert.equal(Object.keys(stored.store.records).length, REMOTE_JOBS_ORG_PAGE_SIZE + 3);
  assert.equal(stored.excerpts[`remotejobs_org:${remoteJob.id}`], remoteJobsOrgExcerptOf(mapRemoteJobsOrgRecord(remoteJob, NOW)));
  assert.equal(persistence.state?.retryNotBefore, null);

  // Inside the 6-hour interval: refused, nothing requested.
  const early = await runRemoteJobsOrgImport({
    transport: feed.transport, persistence, policy: activePolicy, now: "2026-11-07T15:00:00.000Z",
  });
  assert.equal(early.result, "refused_poll_interval");
  assert.equal(early.nextEligibleAt, "2026-11-07T18:00:00.000Z");
  assert.equal(feed.asked.length, 2);

  // After it: the same postings change nothing, and one that left the window is neither
  // closed nor counted as missed.
  const again = await runRemoteJobsOrgImport({
    transport: pagedFeed([{ status: "ok", jobs: [remoteJob], hasMore: false }]).transport,
    persistence, policy: activePolicy, now: "2026-11-07T18:30:00.000Z",
  });
  assert.equal(again.result, "partial");
  assert.deepEqual(again.changes, [{ id: `remotejobs_org:${remoteJob.id}`, change: "seen", version: 1 }]);
  const absent = (await persistence.loadStore()).store.records[`remotejobs_org:${hybridJob.id}`]!;
  assert.equal(absent.snapshot.lifecycle, "active");
  assert.equal(absent.fullPassMisses, 0);

  // An empty page, or a full one that says there is no more, ends the walk.
  for (const last of [{ status: "ok" as const, jobs: [], hasMore: true }, fullPage(1, false)]) {
    const ended = pagedFeed([fullPage(0), last, fullPage(2)]);
    const report = await runRemoteJobsOrgImport({
      transport: ended.transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
    });
    assert.equal(report.traversal, "complete");
    assert.deepEqual(ended.asked, [0, 50]);
  }
});

test("window import: a page stored by an earlier run ends the walk; the 20-page cap holds", async () => {
  const persistence = createMemoryPersistence();
  await runRemoteJobsOrgImport({
    transport: pagedFeed([fullPage(0), fullPage(1, false)]).transport,
    persistence, policy: activePolicy, now: NOW,
  });
  // Six hours later: one page of new postings, then the page read last time.
  const later = pagedFeed([fullPage(7), fullPage(0), fullPage(1)]);
  const report = await runRemoteJobsOrgImport({
    transport: later.transport, persistence, policy: activePolicy, now: "2026-11-07T18:00:00.000Z",
  });
  assert.equal(report.traversal, "seen");
  assert.deepEqual(later.asked, [0, 50]);
  // A page with one new posting among stored ones is read on.
  const storedPage = fullPage(0);
  assert.equal(storedPage.status, "ok");
  const mixed = pagedFeed([{
    status: "ok", hasMore: true,
    jobs: [...(storedPage.status === "ok" ? storedPage.jobs.slice(1) : []), remoteJob],
  }]);
  const mixedReport = await runRemoteJobsOrgImport({
    transport: mixed.transport, persistence, policy: activePolicy, now: "2026-11-08T00:00:00.000Z",
  });
  assert.notEqual(mixedReport.traversal, "seen");
  assert.deepEqual(mixed.asked, [0, 50]);

  const capped = pagedFeed(Array.from({ length: 25 }, (_, page) => fullPage(page)));
  const cap = await runRemoteJobsOrgImport({
    transport: capped.transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
  });
  assert.equal(cap.traversal, "page_cap");
  assert.equal(cap.pagesFetched, REMOTE_JOBS_ORG_MAX_PAGES);
  assert.deepEqual(capped.asked, Array.from({ length: 20 }, (_, page) => page * 50));
  // A caller cannot raise the cap; it can lower it.
  for (const [maxPages, pages] of [[50, 20], [2, 2], [0, 1]] as const) {
    const asked = pagedFeed(Array.from({ length: 25 }, (_, page) => fullPage(page)));
    await runRemoteJobsOrgImport({
      transport: asked.transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW, maxPages,
    });
    assert.equal(asked.asked.length, pages, String(maxPages));
  }
});

test("window import: a failed first page imports nothing; a failed later page keeps what was read", async () => {
  for (const failure of [
    { status: "server_error", reason: "http_status", httpStatus: 502 },
    { status: "network_error", reason: "timeout" },
  ] as const) {
    const persistence = createMemoryPersistence();
    const report = await runRemoteJobsOrgImport({
      transport: pagedFeed([failure]).transport, persistence, policy: activePolicy, now: NOW,
    });
    assert.equal(report.result, "retry_scheduled");
    // B73: the report names the page and why it failed.
    assert.deepEqual(report.failedPage, { offset: 0, ...failure });
    assert.equal(persistence.state, null); // the window is not used
    assert.deepEqual((await persistence.loadStore()).store.records, {});
  }
  const persistence = createMemoryPersistence();
  const interrupted = await runRemoteJobsOrgImport({
    transport: pagedFeed([fullPage(0), { status: "server_error", reason: "envelope_version", httpStatus: 200 }]).transport,
    persistence, policy: activePolicy, now: NOW,
  });
  assert.equal(interrupted.result, "partial");
  assert.equal(interrupted.traversal, "interrupted");
  assert.equal(interrupted.pagesFetched, 1);
  assert.deepEqual(interrupted.failedPage,
    { offset: 50, status: "server_error", reason: "envelope_version", httpStatus: 200 });
  assert.equal(Object.keys((await persistence.loadStore()).store.records).length, REMOTE_JOBS_ORG_PAGE_SIZE);
  assert.equal(persistence.state?.lastRunAt, NOW);

  // Only the named fields reach the report (and the worker's log line), whatever else a
  // failure object carries.
  const extra = { status: "network_error", reason: "network", errorCode: "ECONNRESET", body: "<html>" };
  const picked = await runRemoteJobsOrgImport({
    transport: pagedFeed([extra as RemoteJobsOrgPageResult]).transport,
    persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
  });
  assert.deepEqual(picked.failedPage, { offset: 0, status: "network_error", reason: "network", errorCode: "ECONNRESET" });
});

test("window import through the real fetcher: the report names the page that failed and why (B73)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const first = fullPage(0);
    const jobs = first.status === "ok" ? first.jobs : [];
    let second: () => Response = () => jsonResponse(envelopeBody(100)); // another page's offset
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset"));
      return offset === 0 ? jsonResponse(envelopeBody(0, { data: jobs })) : second();
    }) as typeof fetch;
    const transport = (offset: number) => fetchRemoteJobsOrgPage({ offset });

    const report = await runRemoteJobsOrgImport({
      transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
    });
    assert.equal(report.result, "partial");
    assert.equal(report.traversal, "interrupted");
    assert.equal(report.pagesFetched, 1);
    assert.deepEqual(report.failedPage,
      { offset: 50, status: "server_error", reason: "envelope_offset", httpStatus: 200 });

    // A connection lost while page 2's body is read is a failed page, not an exception:
    // page 1 is stored (before B73 the run threw and stored nothing).
    second = failingBody;
    const persistence = createMemoryPersistence();
    const cut = await runRemoteJobsOrgImport({ transport, persistence, policy: activePolicy, now: NOW });
    assert.equal(cut.result, "partial");
    assert.equal(cut.traversal, "interrupted");
    assert.deepEqual(cut.failedPage,
      { offset: 50, status: "network_error", reason: "body_read", httpStatus: 200, errorCode: "UND_ERR_SOCKET" });
    assert.equal(Object.keys((await persistence.loadStore()).store.records).length, REMOTE_JOBS_ORG_PAGE_SIZE);
    assert.equal(persistence.state?.lastRunAt, NOW);

    // A clean run names no failed page.
    second = () => jsonResponse(envelopeBody(50, { data: [], pagination: { offset: 50, has_more: false } }));
    const clean = await runRemoteJobsOrgImport({
      transport, persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
    });
    assert.equal(clean.traversal, "complete");
    assert.equal(clean.failedPage, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("window import: Retry-After is respected across runs, and an invalid record is one rejection", async () => {
  // A 429 on the first page: nothing imported, the window not used, the wait stored.
  const persistence = createMemoryPersistence();
  const limited = pagedFeed([{ status: "rate_limited", retryAfterSeconds: 1800 }]);
  const refused = await runRemoteJobsOrgImport({ transport: limited.transport, persistence, policy: activePolicy, now: NOW });
  assert.equal(refused.result, "retry_scheduled");
  assert.deepEqual(refused.failedPage, { offset: 0, status: "rate_limited" });
  assert.equal(refused.nextEligibleAt, "2026-11-07T12:30:00.000Z");
  assert.equal(persistence.state?.retryNotBefore, "2026-11-07T12:30:00.000Z");
  assert.equal(persistence.state?.lastRunAt, null);
  assert.deepEqual((await persistence.loadStore()).store.records, {});
  // Before the wait is over no request is made, whoever runs the import.
  const tooSoon = pagedFeed([fullPage(0, false)]);
  const waiting = await runRemoteJobsOrgImport({
    transport: tooSoon.transport, persistence, policy: activePolicy, now: "2026-11-07T12:20:00.000Z",
  });
  assert.equal(waiting.result, "refused_poll_interval");
  assert.equal(waiting.nextEligibleAt, "2026-11-07T12:30:00.000Z");
  assert.deepEqual(tooSoon.asked, []);
  // The worker's scheduler is not due before it either, whatever the backoff.
  await persistence.recordAttempt(false, NOW);
  const state = persistence.state!;
  assert.equal(nextDueAt({
    state: { lastRunAt: state.lastRunAt, lastAttemptAt: state.lastAttemptAt ?? null,
      consecutiveFailures: state.consecutiveFailures ?? 0, retryNotBefore: state.retryNotBefore ?? null },
    pollIntervalMs: 21600_000, nowMs: Date.parse(NOW),
  }), Date.parse("2026-11-07T12:30:00.000Z"));
  // The owner's resume lifts a stored wait too (a hostile header must not park the source).
  const parked = createMemoryPersistence();
  await runRemoteJobsOrgImport({
    transport: pagedFeed([{ status: "rate_limited", retryAfterSeconds: 9_999_999_999 }]).transport,
    persistence: parked, policy: activePolicy, now: NOW,
  });
  assert.ok(Date.parse(parked.state!.retryNotBefore!) > Date.parse("2300-01-01T00:00:00.000Z"));
  await parked.resumeAttempts();
  assert.equal(parked.state?.retryNotBefore, null);
  // After it the run goes ahead, and a clean run clears the wait.
  const resumed = await runRemoteJobsOrgImport({
    transport: tooSoon.transport, persistence, policy: activePolicy, now: "2026-11-07T12:31:00.000Z",
  });
  assert.equal(resumed.result, "partial");
  assert.equal(persistence.state?.retryNotBefore, null);

  // A 429 that names no wait waits the documented hour; one on a later page keeps the
  // pages read and still stores its wait.
  const silent = createMemoryPersistence();
  const noHeader = await runRemoteJobsOrgImport({
    transport: pagedFeed([{ status: "rate_limited", retryAfterSeconds: null }]).transport,
    persistence: silent, policy: activePolicy, now: NOW,
  });
  assert.equal(REMOTE_JOBS_ORG_DEFAULT_RETRY_AFTER_SECONDS, 3600);
  assert.equal(noHeader.nextEligibleAt, "2026-11-07T13:00:00.000Z");
  const later = createMemoryPersistence();
  const laterPage = await runRemoteJobsOrgImport({
    transport: pagedFeed([fullPage(0), { status: "rate_limited", retryAfterSeconds: 600 }]).transport,
    persistence: later, policy: activePolicy, now: NOW,
  });
  assert.equal(laterPage.result, "partial");
  assert.equal(laterPage.traversal, "interrupted");
  assert.deepEqual(laterPage.failedPage, { offset: 50, status: "rate_limited" });
  assert.equal(laterPage.nextEligibleAt, "2026-11-07T12:10:00.000Z");
  assert.equal(later.state?.retryNotBefore, "2026-11-07T12:10:00.000Z");
  assert.equal(later.state?.lastRunAt, NOW);

  const report = await runRemoteJobsOrgImport({
    transport: pagedFeed([{ status: "ok", hasMore: false,
      jobs: [remoteJob, { ...hybridJob, url: "https://evil.example/x" }, { nope: true }, null, 7, []] }]).transport,
    persistence: createMemoryPersistence(), policy: activePolicy, now: NOW,
  });
  assert.equal(report.result, "partial");
  assert.equal(report.recordsMapped, 1);
  assert.equal(report.recordsRejected, 5);
});

test("fetcher: pinned to remotejobs.org, no redirects, documented parameters, the envelope checked", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const seen: { url: string; redirect: RequestRedirect | undefined }[] = [];
  let answer: () => Response = () => new Response("{}");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), redirect: init?.redirect });
    return answer();
  }) as typeof fetch;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
    jsonResponse(body, status, headers);
  const envelope = envelopeBody;

  answer = json(envelope(100));
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 100 }), { status: "ok", jobs: [{ id: "synthetic" }], hasMore: true });
  const url = new URL(seen[0]!.url);
  assert.equal(url.origin, "https://remotejobs.org");
  assert.equal(url.pathname, "/api/v1/jobs");
  assert.deepEqual([...url.searchParams], [
    ["workArrangement", "remote"], ["sort", "recent"], ["limit", "50"], ["offset", "100"],
    ["requestVersion", "job-search-request/1"],
  ]);
  assert.equal(seen[0]!.redirect, "error");

  // Only the offsets of the first 20 pages; refused before anything is sent.
  for (const offset of [-50, 25, 1000, 1.5, Number.NaN]) {
    assert.deepEqual(await fetchRemoteJobsOrgPage({ offset }),
      { status: "network_error", reason: "invalid_request" }, String(offset));
  }
  assert.equal(seen.length, 1);

  // An envelope that does not answer this request is a failed page, never an empty one,
  // and the failure names the check (B73).
  for (const [body, reason] of [
    [envelope(50), "envelope_offset"], // another offset
    [envelope(100, { meta: { search: { request_version: "job-search-request/2" } } }), "envelope_version"],
    [envelope(100, { meta: undefined }), "envelope_version"],
    [envelope(100, { meta: "job-search-request/1" }), "envelope_version"],
    [envelope(100, { pagination: undefined }), "envelope_pagination"],
    [envelope(100, { pagination: { offset: 100, has_more: "yes" } }), "envelope_pagination"],
    [envelope(100, { data: undefined }), "envelope_data"],
    [envelope(100, { data: Array.from({ length: 51 }, () => ({})) }), "envelope_data"],
    [null, "envelope_data"],
    [[], "envelope_data"],
  ] as const) {
    answer = json(body);
    assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 100 }),
      { status: "server_error", reason, httpStatus: 200 }, JSON.stringify(body)?.slice(0, 80));
  }
  // What arrived is named with its HTTP status; nothing else of the response is kept.
  answer = () => new Response("<html></html>", { headers: { "content-type": "text/html" } });
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "server_error", reason: "content_type", httpStatus: 200 });
  for (const status of [503, 404, 500]) {
    answer = json({ error: "synthetic" }, status);
    assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
      { status: "server_error", reason: "http_status", httpStatus: status });
  }
  answer = () => new Response("{\"data\": [", { headers: { "content-type": "application/json" } });
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "server_error", reason: "invalid_json", httpStatus: 200 });
  answer = () => new Response(" ".repeat(8 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } });
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "server_error", reason: "too_large", httpStatus: 200 });

  // A 429 carries its Retry-After; without one the adapter chooses the wait.
  answer = json({ error: "rate_limited" }, 429, { "retry-after": "120" });
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }), { status: "rate_limited", retryAfterSeconds: 120 });
  answer = json({ error: "rate_limited" }, 429);
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }), { status: "rate_limited", retryAfterSeconds: null });

  // A failed connection keeps the runtime's code when it is a clean one (the cause's first).
  const failedWith = (code: unknown, on: "cause" | "error" = "cause") => () => {
    const coded = (message: string) => Object.assign(new Error(message), { code });
    throw on === "cause" ? new TypeError("fetch failed", { cause: coded("synthetic") }) : coded("synthetic");
  };
  answer = () => { throw new TypeError("redirect"); };
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }), { status: "network_error", reason: "network" });
  answer = failedWith("ECONNRESET");
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "network_error", reason: "network", errorCode: "ECONNRESET" });
  answer = failedWith("ENOTFOUND", "error");
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "network_error", reason: "network", errorCode: "ENOTFOUND" });
  for (const unclean of ["econnreset", "BAD CODE", "X\nY", 104, `E${"X".repeat(64)}`, ""]) {
    answer = failedWith(unclean);
    assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
      { status: "network_error", reason: "network" }, JSON.stringify(unclean));
  }
  // A body that fails while it is read is a failed page, not an exception.
  answer = failingBody;
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0 }),
    { status: "network_error", reason: "body_read", httpStatus: 200, errorCode: "UND_ERR_SOCKET" });
  // No answer within the deadline.
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
  })) as typeof fetch;
  assert.deepEqual(await fetchRemoteJobsOrgPage({ offset: 0, timeoutMs: 5 }), { status: "network_error", reason: "timeout" });
});

test("fetcher: the other sources answer the bare status as before; a failed body read no longer throws", async () => {
  const originalFetch = globalThis.fetch;
  let answer: () => Response = () => jsonResponse({}, 503);
  globalThis.fetch = (async () => answer()) as typeof fetch;
  try {
    assert.deepEqual(await fetchHimalayasPage(), { status: "server_error" });
    assert.deepEqual(await fetchJobicyWindow(), { status: "server_error" });
    assert.deepEqual(await fetchRemoteFirstJobsPage({ page: 0 }), { status: "server_error" });
    answer = () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) }); };
    assert.deepEqual(await fetchHimalayasPage(), { status: "network_error" });
    answer = failingBody;
    assert.deepEqual(await fetchHimalayasPage(), { status: "network_error" });
    assert.deepEqual(await fetchJobicyWindow(), { status: "network_error" });
    assert.deepEqual(await fetchRemoteFirstJobsPage({ page: 0 }), { status: "network_error" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Retry-After: seconds or an HTTP date, at least a second and never shortened; anything else is unread", () => {
  const now = Date.parse("2026-11-07T12:00:00.000Z");
  assert.equal(retryAfterSecondsOf("120", now), 120);
  assert.equal(retryAfterSecondsOf(" 60 ", now), 60);
  assert.equal(retryAfterSecondsOf("0", now), 1);
  // A long wait is kept as asked, never cut short.
  assert.equal(retryAfterSecondsOf("2592000", now), 2592000);
  assert.equal(retryAfterSecondsOf("Mon, 07 Dec 2026 12:00:00 GMT", now), 30 * 86400);
  assert.equal(retryAfterSecondsOf("Sat, 07 Nov 2026 12:30:00 GMT", now), 1800);
  assert.equal(retryAfterSecondsOf("Sat, 07 Nov 2026 11:00:00 GMT", now), 1);
  for (const unread of [null, "", "soon", "-5", "1.5", "2026-11-07T12:30:00Z"]) {
    assert.equal(retryAfterSecondsOf(unread, now), null, String(unread));
  }
});

test("snapshot ids: the new source passes the shared id checks; other prefixes do not", () => {
  assert.deepEqual([...SNAPSHOT_SOURCE_IDS], ["himalayas", "jobicy", "remote_first_jobs", "remotejobs_org"]);
  const id = mapRemoteJobsOrgRecord(remoteJob, NOW).id;
  assert.equal(SNAPSHOT_ID_PATTERN.test(id), true);
  assert.deepEqual(parseEventBatch({ type: "click", items: [{ snapshotId: id, position: 0 }] }),
    [{ snapshotId: id, position: 0 }]);
  for (const other of ["remotejobs:5f0c1e2a", "remote-jobs-org:abc", "remotejobs_org:Bad", "remotejobs_org:"]) {
    assert.equal(SNAPSHOT_ID_PATTERN.test(other), false, other);
  }
});

test("cross-source: the fixture never collides with the other three sources' fixtures", () => {
  const ids = [
    ...mapHimalayasFixture(NOW).map(s => s.id),
    ...mapJobicyFixture(NOW).map(s => s.id),
    ...mapRemoteFirstJobsFixture(NOW).map(s => s.id),
    ...mapRemoteJobsOrgFixture(NOW).map(s => s.id),
  ];
  assert.equal(new Set(ids).size, ids.length);
});

test("attribution: the policy's credit line reaches every RemoteJobs.org card and no other source's", async () => {
  const { projectCard } = await import("../../src/domain/snapshot-projection.ts");
  const { himalayasCandidatePolicy, jobicyCandidatePolicy, remoteFirstJobsCandidatePolicy } =
    await import("../../src/server/source-policies.ts");
  const stored = (snapshot: JobSnapshot) => ({
    sourceId: snapshot.id.split(":")[0]!, snapshot, contentHash: "", firstSeenAt: NOW, fullPassMisses: 0,
  });
  const credit = { text: "Powered by RemoteJobs.org", url: "https://remotejobs.org" };
  assert.deepEqual(remoteJobsOrgCandidatePolicy.attribution.credit_line, credit);
  const own = mapRemoteJobsOrgRecord(remoteJob, NOW);
  for (const policy of [activePolicy, { ...activePolicy, enabled: false }]) {
    const card = projectCard(stored(own), policy);
    assert.deepEqual(card.source.creditLine, credit);
    // The listing link and the application route stay as they were.
    assert.equal(card.apply.url, remoteJob.url);
    assert.equal(card.source.displayName, "RemoteJobs.org");
  }
  for (const [policy, snapshot] of [
    [himalayasCandidatePolicy, mapHimalayasFixture(NOW)[0]!],
    [jobicyCandidatePolicy, mapJobicyFixture(NOW)[0]!],
    [remoteFirstJobsCandidatePolicy, mapRemoteFirstJobsFixture(NOW)[0]!],
  ] as const) {
    assert.equal(policy.attribution.credit_line, undefined, policy.source_id);
    assert.equal(projectCard(stored(snapshot), policy).source.creditLine, null, policy.source_id);
  }
  // A credit line is plain text and an https link; anything else is not a policy.
  for (const bad of [{ text: "Powered by", url: "javascript:alert(1)" }, { text: "Powered by", url: "http://remotejobs.org" },
    { text: " ", url: "https://remotejobs.org" }, { text: "x".repeat(81), url: "https://remotejobs.org" },
    { text: "Powered by", url: "https://remotejobs.org", logo: "https://remotejobs.org/logo.png" }, "Powered by"]) {
    const policy = { ...remoteJobsOrgCandidatePolicy, attribution: { ...remoteJobsOrgCandidatePolicy.attribution, credit_line: bad } };
    assert.equal(isSourcePolicy(policy), false, JSON.stringify(bad));
  }
});

test("attribution: every surface that shows a listing renders the credit line, with the same rel and no logo", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const component = read("src/components/source-credit.tsx");
  assert.match(component, /rel="nofollow noreferrer"/u);
  assert.match(component, /lang="en"/u);
  assert.doesNotMatch(component, /<img|logo_url|Image/u);
  // The catalog card, the matched card, saved and hidden rows, and the digest.
  for (const [file, uses] of [
    ["src/components/snapshot-card.tsx", 1], ["src/app/matched/page.tsx", 1],
    ["src/app/saved/page.tsx", 2], ["src/app/whats-new/page.tsx", 1],
  ] as const) {
    assert.equal(read(file).match(/<SourceCredit credit=\{/gu)?.length ?? 0, uses, file);
  }
  assert.match(read("src/server/digest-service.ts"), /sourceCredit: entry\.job\.card\.source\.creditLine/u);
  // Driven by the policy: no surface names a source to decide it.
  for (const file of ["src/components/source-credit.tsx", "src/components/snapshot-card.tsx",
    "src/app/matched/page.tsx", "src/app/saved/page.tsx", "src/app/whats-new/page.tsx"]) {
    const code = read(file).split(/\r?\n/u).filter(line => !line.trim().startsWith("//")).join(" ");
    assert.doesNotMatch(code, /remotejobs_org|Powered by/u, file);
  }
});
