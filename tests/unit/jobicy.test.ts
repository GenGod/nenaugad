import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot, type JobSnapshot } from "../../src/domain/source-contracts.ts";
import {
  jobicyContractFixture, jobicyExcerptOf, mapJobicyFixture, mapJobicyRecord, type JobicyRawRecord,
} from "../../src/server/import/jobicy-fixture.ts";
import {
  mapHimalayasFixture, AdapterInputError as HimalayaAdapterInputError,
} from "../../src/server/import/himalayas-fixture.ts";
import { runJobicyImport, DEFAULT_MAX_JOBICY_PAGES } from "../../src/server/import/jobicy-adapter.ts";
import { createMemoryPersistence } from "../../src/server/import/himalayas-adapter.ts";
import { jobicyCandidatePolicy, permissionFor } from "../../src/server/source-policies.ts";
import { fetchJobicyWindow } from "../../src/server/import/fetcher.ts";
import { classifySnapshot, hiringCountriesText, projectCard } from "../../src/domain/snapshot-projection.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import { parseManualProfileInput } from "../../src/domain/profile.ts";

const NOW = "2026-09-25T12:00:00.000Z";
const enabledPolicy = { ...jobicyCandidatePolicy, enabled: true };

// The worldwide fixture record with another posting text (still synthetic).
function anywhere(sentences: string, jobExcerpt = "Synthetic fixture: remote role."): JobicyRawRecord {
  return {
    ...jobicyContractFixture[0]!,
    jobDescription: `<p>Synthetic contract fixture. Fully remote position. ${sentences}</p>`,
    jobExcerpt,
  };
}

function geoRule(snapshot: JobSnapshot, residenceCountry: string) {
  const profile = parseManualProfileInput({
    residenceCountry, timezone: null, targetRoles: ["engineer"], skills: [],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
  });
  const evaluation = evaluateJob(snapshot, profile);
  return { status: evaluation.status, outcome: evaluation.rules.find(rule => rule.ruleId === "GEO-01")?.outcome };
}

function geoEvidence(snapshot: JobSnapshot) {
  return snapshot.evidence.filter(item => item.id.startsWith(`ev:${snapshot.id}:geo`));
}

// A jobGeo label as the live feed writes it: parts joined by a comma and two spaces.
function labelled(jobGeo: string | null): JobSnapshot {
  return mapJobicyRecord({ ...jobicyContractFixture[0]!, jobGeo }, NOW);
}

function labelGeography(jobGeo: string, countries: readonly string[], exhaustive: boolean) {
  return {
    scope: "restricted", allowed_countries: countries, excluded_countries: [],
    allowed_subdivisions: [], region_text: jobGeo, exhaustive,
    evidence_ids: ["ev:jobicy:900001:geo"],
  };
}

function cardOf(snapshot: JobSnapshot) {
  return projectCard({
    sourceId: "jobicy", snapshot, contentHash: "", firstSeenAt: NOW, fullPassMisses: 0,
  }, enabledPolicy);
}

const LABEL_EVIDENCE = {
  id: "ev:jobicy:900001:geo", origin_type: "job_source", origin_id: "jobicy:900001",
  origin_version: 1, field_path: "jobGeo", quote: "Anywhere", method: "source_field", confidence: 1,
} as const;

test("policy: jobicy matrix approved and activated; a disabled clone denies everything", () => {
  assert.equal(jobicyCandidatePolicy.status, "approved");
  assert.equal(jobicyCandidatePolicy.enabled, true);
  assert.equal(jobicyCandidatePolicy.terms_hash !== null, true);
  assert.equal(jobicyCandidatePolicy.valid_until, "2026-12-23T00:00:00.000Z");
  for (const permission of ["fetch", "cache", "store_full_text", "store_excerpt",
    "derive_fields", "publish_excerpt"] as const) {
    assert.equal(jobicyCandidatePolicy.permissions[permission], "allowed", permission);
  }
  // Provider transfer (2026-10-01) and local ML inference (2026-10-02, owner
  // decision No 4 — the Fair Use section names AI products and research tools)
  // are granted; full-text republication and everything else stays denied.
  for (const permission of ["publish_full_text",
    "send_email", "index_web_page", "syndicate_google_jobs", "train_model",
    "direct_apply", "bulk_export"] as const) {
    assert.equal(jobicyCandidatePolicy.permissions[permission], "denied", permission);
  }
  assert.equal(jobicyCandidatePolicy.permissions.send_to_ai_provider, "allowed");
  assert.equal(jobicyCandidatePolicy.permissions.process_with_ml, "allowed");
  assert.equal(jobicyCandidatePolicy.min_poll_interval_seconds, 21600);
  // Rollback without code changes: disabling the policy denies fetch again.
  assert.equal(permissionFor({ ...jobicyCandidatePolicy, enabled: false }, "fetch", NOW), "denied");
});

test("mapper: fixture validates; ids stable; labels are honest", () => {
  const snapshots = mapJobicyFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true);
  assert.deepEqual(snapshots.map(s => s.id),
    mapJobicyFixture("2026-09-26T00:00:00.000Z").map(s => s.id));

  const worldwide = snapshots.find(s => s.id === "jobicy:900001")!;
  assert.equal(worldwide.hiring_options[0]?.geography.scope, "worldwide");
  assert.equal(classifySnapshot(worldwide), "main_catalog");
  assert.equal(worldwide.dates.source_published_at, "2026-09-24T08:00:00.000Z");

  // "Europe" is a region: no invented country list, rule stays unknown.
  const region = snapshots.find(s => s.id === "jobicy:900002")!;
  assert.equal(region.hiring_options[0]?.geography.scope, "restricted");
  assert.deepEqual(region.hiring_options[0]?.geography.allowed_countries, []);
  assert.equal(region.hiring_options[0]?.geography.exhaustive, false);
  assert.equal(region.hiring_options[0]?.geography.region_text, "Europe");

  // "USA" maps to a concrete ISO country; office text quarantines.
  const usa = snapshots.find(s => s.id === "jobicy:900003")!;
  assert.deepEqual(usa.hiring_options[0]?.geography.allowed_countries, ["US"]);
  assert.equal(usa.workplace.verification_state, "conflicting");
  assert.equal(classifySnapshot(usa), "excluded");
  assert.equal(usa.compensation.original_text, "40–60 USD / hourly");
});

test("geography: a residence rule in the text overrides the 'Anywhere' label (B24, spec 11.1)", () => {
  const snapshot = mapJobicyRecord(anywhere("Applicants must reside in the US."), NOW);
  assert.equal(isJobSnapshot(snapshot), true);
  const geography = snapshot.hiring_options[0]!.geography;
  assert.deepEqual(geography, {
    scope: "restricted", allowed_countries: ["US"], excluded_countries: [],
    allowed_subdivisions: [], region_text: "must reside in the US", exhaustive: true,
    evidence_ids: ["ev:jobicy:900001:geo", "ev:jobicy:900001:geo:restriction"],
  });
  assert.deepEqual(snapshot.hiring_options[0]!.evidence_ids, geography.evidence_ids);
  assert.deepEqual(snapshot.conflicts, ["geography-source-vs-text"]);
  // Both sides of the contradiction stay on record: the label and the employer's text.
  assert.deepEqual(geoEvidence(snapshot), [LABEL_EVIDENCE, {
    id: "ev:jobicy:900001:geo:restriction", origin_type: "job_source",
    origin_id: "jobicy:900001", origin_version: 1, field_path: "jobDescription",
    quote: "must reside in the US", method: "rule", confidence: 0.9,
  }]);
  // Geography is not the catalog gate: the post stays, but no longer as worldwide.
  assert.equal(classifySnapshot(snapshot), "main_catalog");
  assert.deepEqual(cardOf(snapshot).geography, { scope: "restricted", countries: ["US"], exhaustive: true });
  assert.deepEqual(geoRule(snapshot, "DE"), { status: "ineligible", outcome: "fail" });
  assert.equal(geoRule(snapshot, "US").outcome, "pass");
});

test("geography: a rule naming a region leaves the countries unknown, never worldwide", () => {
  const snapshot = mapJobicyRecord(anywhere("Candidates must be based in Europe."), NOW);
  assert.equal(isJobSnapshot(snapshot), true);
  assert.deepEqual(snapshot.hiring_options[0]!.geography, {
    scope: "restricted", allowed_countries: [], excluded_countries: [],
    allowed_subdivisions: [], region_text: "must be based in Europe", exhaustive: false,
    evidence_ids: ["ev:jobicy:900001:geo", "ev:jobicy:900001:geo:restriction"],
  });
  assert.deepEqual(snapshot.conflicts, ["geography-source-vs-text"]);
  assert.deepEqual(geoRule(snapshot, "DE"), { status: "needs_review", outcome: "unknown" });
});

test("geography: an exclusion in the text keeps worldwide minus the named country", () => {
  const snapshot = mapJobicyRecord(anywhere("We hire worldwide, except in Brazil."), NOW);
  assert.equal(isJobSnapshot(snapshot), true);
  assert.deepEqual(snapshot.hiring_options[0]!.geography, {
    scope: "worldwide", allowed_countries: [], excluded_countries: ["BR"],
    allowed_subdivisions: [], region_text: "worldwide, except in Brazil", exhaustive: true,
    evidence_ids: ["ev:jobicy:900001:geo", "ev:jobicy:900001:geo:exclusion"],
  });
  assert.deepEqual(snapshot.conflicts, ["geography-source-vs-text"]);
  assert.equal(geoEvidence(snapshot)[1]?.quote, "worldwide, except in Brazil");
  assert.deepEqual(geoRule(snapshot, "BR"), { status: "ineligible", outcome: "fail" });
  assert.equal(geoRule(snapshot, "DE").outcome, "pass");
});

test("geography: a rule stated only in the excerpt cites the excerpt", () => {
  const snapshot = mapJobicyRecord(anywhere("", "Remote role; must be based in Canada."), NOW);
  assert.deepEqual(snapshot.hiring_options[0]!.geography.allowed_countries, ["CA"]);
  assert.equal(geoEvidence(snapshot)[1]?.field_path, "jobExcerpt");
});

test("geography: text without a hiring rule keeps 'Anywhere' worldwide, with no conflict", () => {
  const plain = mapJobicyFixture(NOW)[0]!;
  assert.deepEqual(plain.conflicts, []);
  assert.deepEqual(plain.evidence.map(item => item.id),
    ["ev:jobicy:900001:geo", "ev:jobicy:900001:workplace", "ev:jobicy:900001:comp"]);
  const traps = mapJobicyRecord(anywhere(
    "We are based in San Francisco, CA. If you are located in the EEA, see our privacy notice. " +
    "You must reside outside of a 50 mile radius from our office. You don't need to be based " +
    "in the US. Work from anywhere in the world. Health insurance (US only). You should live " +
    "in a time zone within three hours of UTC."), NOW);
  assert.deepEqual(traps.hiring_options[0]!.geography, plain.hiring_options[0]!.geography);
  assert.deepEqual(traps.conflicts, []);
  assert.deepEqual(geoEvidence(traps), [LABEL_EVIDENCE]);
});

test("geography: country and region labels are not cross-checked against the text", () => {
  const snapshot = mapJobicyRecord({
    ...anywhere("Applicants must reside in Canada."), jobGeo: "USA",
  }, NOW);
  assert.deepEqual(snapshot.hiring_options[0]!.geography.allowed_countries, ["US"]);
  assert.deepEqual(snapshot.conflicts, []);
});

test("geography: a label of countries only is the complete list (B25)", () => {
  const table: readonly (readonly [string, readonly string[]])[] = [
    ["Portugal", ["PT"]],
    ["Hong Kong", ["HK"]],
    ["Türkiye", ["TR"]],
    ["canada", ["CA"]],
    ["Canada,  USA", ["CA", "US"]],
    ["Australia,  Canada,  Singapore,  UK,  USA", ["AU", "CA", "SG", "GB", "US"]],
    ["USA,  United States", ["US"]],
    ["USA,", ["US"]],
  ];
  for (const [jobGeo, countries] of table) {
    const snapshot = labelled(jobGeo);
    assert.equal(isJobSnapshot(snapshot), true, jobGeo);
    assert.deepEqual(snapshot.hiring_options[0]!.geography, labelGeography(jobGeo, countries, true), jobGeo);
    assert.deepEqual(snapshot.conflicts, [], jobGeo);
  }
  const listed = labelled("Canada,  USA");
  assert.equal(geoRule(listed, "CA").outcome, "pass");
  assert.equal(geoRule(listed, "US").outcome, "pass");
  assert.deepEqual(geoRule(listed, "DE"), { status: "ineligible", outcome: "fail" });
  assert.equal(hiringCountriesText(cardOf(listed).geography), "CA, US");
});

test("geography: a label that also names a region keeps its countries as an incomplete list (B25)", () => {
  const table: readonly (readonly [string, readonly string[]])[] = [
    ["EMEA,  LATAM,  Canada,  USA", ["CA", "US"]],
    ["Europe,  Türkiye", ["TR"]],
    // Georgia is a country and a US state (spec 11.1): it stays unknown, as in B24.
    ["Georgia,  USA", ["US"]],
  ];
  for (const [jobGeo, countries] of table) {
    const snapshot = labelled(jobGeo);
    assert.equal(isJobSnapshot(snapshot), true, jobGeo);
    assert.deepEqual(snapshot.hiring_options[0]!.geography, labelGeography(jobGeo, countries, false), jobGeo);
    assert.deepEqual(snapshot.conflicts, [], jobGeo);
  }
  // A named country passes; a candidate in the region, or anywhere else, goes to review.
  const mixed = labelled("EMEA,  LATAM,  Canada,  USA");
  assert.equal(geoRule(mixed, "US").outcome, "pass");
  assert.deepEqual(geoRule(mixed, "DE"), { status: "needs_review", outcome: "unknown" });
  assert.deepEqual(geoRule(mixed, "JP"), { status: "needs_review", outcome: "unknown" });
  // The card carries the completeness, so it cannot present CA, US as the whole list.
  assert.deepEqual(cardOf(mixed).geography, { scope: "restricted", countries: ["CA", "US"], exhaustive: false });
  assert.equal(hiringCountriesText(cardOf(mixed).geography), "CA, US (список неполный)");
});

test("geography: a label without a country maps exactly as before", () => {
  for (const jobGeo of ["EMEA", "APAC", "LATAM", "Georgia", "EMEA,  LATAM", ","]) {
    const snapshot = labelled(jobGeo);
    assert.deepEqual(snapshot.hiring_options[0]!.geography, labelGeography(jobGeo, [], false), jobGeo);
    assert.deepEqual(geoRule(snapshot, "DE"), { status: "needs_review", outcome: "unknown" }, jobGeo);
    assert.equal(hiringCountriesText(cardOf(snapshot).geography), null, jobGeo);
  }
  for (const jobGeo of ["", "   ", null]) {
    assert.deepEqual(labelled(jobGeo).hiring_options[0]!.geography, {
      scope: "unspecified", allowed_countries: [], excluded_countries: [],
      allowed_subdivisions: [], region_text: null, exhaustive: false,
      evidence_ids: ["ev:jobicy:900001:geo"],
    });
  }
});

test("excerpt: the feed's HTML entities are decoded for the card (B30)", () => {
  const record = jobicyContractFixture[0]!;
  assert.equal(jobicyExcerptOf({ ...record, jobExcerpt: "R&amp;D tools for &gt;40% of teams&hellip;" }),
    "R&D tools for >40% of teams…");
  assert.equal(jobicyExcerptOf({ ...record, jobExcerpt: null }), "");
});

test("mapper: employment types mapped, unknown when absent; invalid input rejected", () => {
  const [fullTime, contract] = mapJobicyFixture(NOW);
  assert.deepEqual(fullTime!.hiring_options[0]?.employment_types, ["employment_full_time"]);
  assert.deepEqual(contract!.hiring_options[0]?.employment_types, ["contractor"]);
  const noType = mapJobicyRecord({ ...jobicyContractFixture[0]!, jobType: [] }, NOW);
  assert.deepEqual(noType.hiring_options[0]?.employment_types, ["unknown"]);

  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, id: 1.5 }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord(
    { ...jobicyContractFixture[0]!, url: "https://evil.example/jobs/1" }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, pubDate: "not-a-date" }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, jobDescription: "" }, NOW),
    HimalayaAdapterInputError);
});

test("window import: always partial, idempotent, poll-gated, disabled refuses", async () => {
  // Disabled clone: no transport call.
  let calls = 0;
  const refused = await runJobicyImport({
    transport: async () => { calls += 1; return { status: "ok", jobs: [] }; },
    persistence: createMemoryPersistence(),
    policy: { ...jobicyCandidatePolicy, enabled: false }, now: NOW,
  });
  assert.equal(refused.result, "refused_disabled");
  assert.equal(calls, 0);

  const persistence = createMemoryPersistence();
  const window = async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] });
  const first = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.equal(first.result, "partial");
  assert.equal(first.recordsMapped, 3);
  // Re-import inside the 6h window is refused; at/after the gate it runs.
  const tooSoon = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: "2026-09-25T17:00:00.000Z",
  });
  assert.equal(tooSoon.result, "refused_poll_interval");
  assert.equal(tooSoon.nextEligibleAt, "2026-09-25T18:00:00.000Z");
  const afterGate = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: "2026-09-25T18:00:00.000Z",
  });
  assert.equal(afterGate.result, "partial");
  const store = await persistence.loadStore();
  assert.equal(Object.keys(store.store.records).length, 3);
  for (const stored of Object.values(store.store.records)) {
    assert.equal(stored.snapshot.version, 1);
    assert.equal(stored.fullPassMisses, 0); // window absence never counts as a miss
  }
  // A shrinking window must not stale anything (absence ≠ closure).
  const shrunk = await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [jobicyContractFixture[0]!] }),
    persistence, policy: enabledPolicy, now: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(shrunk.result, "partial");
  const afterShrink = await persistence.loadStore();
  for (const stored of Object.values(afterShrink.store.records)) {
    assert.equal(stored.snapshot.lifecycle, "active");
  }
  // Failure classification: 429 → retry, window not consumed.
  const failing = createMemoryPersistence();
  const rateLimited = await runJobicyImport({
    transport: async () => ({ status: "rate_limited" as const }),
    persistence: failing, policy: enabledPolicy, now: NOW,
  });
  assert.equal(rateLimited.result, "retry_scheduled");
  assert.equal(failing.state, null);
});

// A labelled stand-in for fetchJobicyWindow: serves the given pages in order and
// records the cursor of every request (B57-001).
type Page = Awaited<ReturnType<typeof fetchJobicyWindow>>;
function pagedFeed(pages: readonly Page[]) {
  const cursors: (string | null)[] = [];
  const transport = async (cursor: string | null): Promise<Page> => {
    cursors.push(cursor);
    return pages[cursors.length - 1] ?? { status: "server_error" };
  };
  return { transport, cursors };
}
const [jobA, jobB, jobC] = jobicyContractFixture;

test("window import follows the cursor, unchanged and in order, until it is null", async () => {
  const persistence = createMemoryPersistence();
  const feed = pagedFeed([
    { status: "ok", jobs: [jobA], nextCursor: "c1" },
    { status: "ok", jobs: [jobB], nextCursor: "c2" },
    { status: "ok", jobs: [jobC], nextCursor: null },
  ]);
  const report = await runJobicyImport({
    transport: feed.transport, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.deepEqual(feed.cursors, [null, "c1", "c2"]);
  assert.equal(report.result, "partial");
  assert.equal(report.traversal, "complete");
  assert.equal(report.pagesFetched, 3);
  assert.equal(report.recordsMapped, 3);
  assert.equal(Object.keys((await persistence.loadStore()).store.records).length, 3);
  for (const stored of Object.values((await persistence.loadStore()).store.records)) {
    assert.equal(stored.fullPassMisses, 0); // a complete walk is still a window, not a snapshot
  }
});

test("window import stops at the page cap, 10 by default", async () => {
  let calls = 0;
  const endless = async () => {
    calls += 1;
    return { status: "ok" as const, jobs: [jobA], nextCursor: `page-${calls}` };
  };
  const capped = await runJobicyImport({
    transport: endless, persistence: createMemoryPersistence(), policy: enabledPolicy, now: NOW,
    maxPages: 2,
  });
  assert.equal(capped.traversal, "page_cap");
  assert.equal(capped.pagesFetched, 2);
  assert.equal(calls, 2);
  calls = 0;
  const byDefault = await runJobicyImport({
    transport: endless, persistence: createMemoryPersistence(), policy: enabledPolicy, now: NOW,
  });
  assert.equal(byDefault.pagesFetched, DEFAULT_MAX_JOBICY_PAGES);
  assert.equal(calls, 10);
  calls = 0;
  const zero = await runJobicyImport({
    transport: endless, persistence: createMemoryPersistence(), policy: enabledPolicy, now: NOW,
    maxPages: 0,
  });
  assert.equal(zero.pagesFetched, 1); // a run never uses the window without reading a page
  assert.equal(calls, 1);
});

test("a later page that fails keeps the pages read; the run counts", async () => {
  const persistence = createMemoryPersistence();
  const feed = pagedFeed([
    { status: "ok", jobs: [jobA, jobB], nextCursor: "c1" },
    { status: "rate_limited" },
  ]);
  const report = await runJobicyImport({
    transport: feed.transport, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.equal(report.result, "partial");
  assert.equal(report.traversal, "interrupted");
  assert.equal(report.pagesFetched, 1);
  assert.equal(report.recordsMapped, 2);
  assert.equal(feed.cursors.length, 2); // no third request after the failure
  assert.equal(Object.keys((await persistence.loadStore()).store.records).length, 2);
  assert.equal(persistence.state?.lastRunAt, NOW); // the 6-hour window is used
});

test("a job repeated across pages keeps its first copy and that copy's excerpt", async () => {
  const persistence = createMemoryPersistence();
  const feed = pagedFeed([
    { status: "ok", jobs: [{ ...jobA!, jobExcerpt: "first page" }], nextCursor: "c1" },
    { status: "ok", jobs: [{ ...jobA!, jobExcerpt: "second page" }], nextCursor: null },
  ]);
  const report = await runJobicyImport({
    transport: feed.transport, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.equal(report.recordsMapped, 2);
  const store = await persistence.loadStore();
  assert.equal(Object.keys(store.store.records).length, 1);
  assert.equal(store.excerpts[`jobicy:${jobA!.id}`], "first page");
});

test("fetcher: the jobicy cursor reaches the URL unchanged; a malformed one sends nothing", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ jobs: [], nextCursor: "eyJ0IjoxfQ.sig_-", hasMore: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const first = await fetchJobicyWindow({ count: 200 });
  assert.equal(first.status, "ok");
  assert.equal(first.status === "ok" ? first.nextCursor : undefined, "eyJ0IjoxfQ.sig_-");
  assert.equal(new URL(seen[0] ?? "").searchParams.has("cursor"), false);
  await fetchJobicyWindow({ count: 200, cursor: "eyJ0IjoxfQ.sig_-" });
  const second = new URL(seen[1] ?? "");
  assert.equal(second.searchParams.get("cursor"), "eyJ0IjoxfQ.sig_-");
  assert.equal(second.searchParams.get("count"), "200"); // the page size stays the same
  const refused = await fetchJobicyWindow({ count: 200, cursor: "https://evil.example/x" });
  assert.equal(refused.status, "network_error");
  assert.equal(seen.length, 2);
});

test("fetcher: jobicy window is pinned to jobicy.com", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ jobs: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const ok = await fetchJobicyWindow({ count: 250 });
  assert.equal(ok.status, "ok");
  const url = new URL(seen[0] ?? "");
  assert.equal(url.host, "jobicy.com");
  assert.equal(url.searchParams.get("count"), "200"); // capped at the documented max
});

test("cross-source: himalayas and jobicy fixtures never collide", () => {
  const ids = new Set([
    ...mapHimalayasFixture(NOW).map(s => s.id),
    ...mapJobicyFixture(NOW).map(s => s.id),
  ]);
  assert.equal(ids.size,
    mapHimalayasFixture(NOW).length + mapJobicyFixture(NOW).length);
  assert.equal(jobicyContractFixture.every(r => r.companyName.endsWith("Fixtures")), true);
});
