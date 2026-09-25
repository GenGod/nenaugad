import assert from "node:assert/strict";
import { test } from "node:test";
import { mapHimalayasFixture } from "../../src/server/import/himalayas-fixture.ts";
import type { JobSnapshot } from "../../src/domain/source-contracts.ts";
import { parseManualProfileInput, profileFromDocuments, buildProfileDocuments } from "../../src/domain/profile.ts";
import { evaluateJob, RULESET_VERSION } from "../../src/domain/matching.ts";

const NOW = "2026-09-24T12:00:00.000Z";

function profileWith(overrides: Record<string, unknown>) {
  const base = {
    residenceCountry: "DE", timezone: "Europe/Berlin",
    targetRoles: ["engineer"], employmentTypes: ["contractor"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance: true, minimumCompensation: null, showNeedsReview: true,
    ...overrides,
  };
  const documents = buildProfileDocuments({ userId: "u_test", version: 1, input: parseManualProfileInput(base) });
  return profileFromDocuments(documents.candidate, documents.search).input;
}

function snapshotMutated(mutator: (snapshot: JobSnapshot) => JobSnapshot): JobSnapshot {
  return mutator(mapHimalayasFixture(NOW)[0]!);
}

function ruleOf(evaluation: ReturnType<typeof evaluateJob>, ruleId: string) {
  return evaluation.rules.find(rule => rule.ruleId === ruleId);
}

test("rule GEO-01: country matching follows the published sets, unknown stays unknown", () => {
  const profile = profileWith({});
  const worldwide = snapshotMutated(snapshot => snapshot);
  assert.equal(ruleOf(evaluateJob(worldwide, profile), "GEO-01")?.outcome, "pass");

  const restricted = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{
      ...snapshot.hiring_options[0]!,
      geography: { ...snapshot.hiring_options[0]!.geography,
        scope: "restricted", allowed_countries: ["DE", "FR"] },
    }],
  }));
  assert.equal(ruleOf(evaluateJob(restricted, profile), "GEO-01")?.outcome, "pass");

  const elsewhere = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{
      ...snapshot.hiring_options[0]!,
      geography: { ...snapshot.hiring_options[0]!.geography,
        scope: "restricted", allowed_countries: ["US", "CA"] },
    }],
  }));
  const mismatch = ruleOf(evaluateJob(elsewhere, profile), "GEO-01");
  assert.equal(mismatch?.outcome, "fail");
  assert.deepEqual(mismatch?.reasonCodes, ["LOCATION_MISMATCH"]);

  const unspecified = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{
      ...snapshot.hiring_options[0]!,
      geography: { ...snapshot.hiring_options[0]!.geography, scope: "unspecified" },
    }],
  }));
  assert.equal(ruleOf(evaluateJob(unspecified, profile), "GEO-01")?.outcome, "unknown");

  const noCountry = profileWith({ residenceCountry: null, timezone: null });
  assert.equal(ruleOf(evaluateJob(worldwide, noCountry), "GEO-01")?.outcome, "unknown");
});

test("rule CONTRACT-01: unknown form stays unknown, mismatch fails", () => {
  const profile = profileWith({});
  const unknownForm = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{ ...snapshot.hiring_options[0]!, employment_types: ["unknown"] }],
  }));
  assert.equal(ruleOf(evaluateJob(unknownForm, profile), "CONTRACT-01")?.outcome, "unknown");

  const fullTimeOnly = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{ ...snapshot.hiring_options[0]!, employment_types: ["employment_full_time"] }],
  }));
  const mismatch = ruleOf(evaluateJob(fullTimeOnly, profile), "CONTRACT-01");
  assert.equal(mismatch?.outcome, "fail");
  assert.deepEqual(mismatch?.reasonCodes, ["CONTRACT_MISMATCH"]);
});

test("rule REMOTE-01: zero mandatory attendance fails only on required presence", () => {
  const profile = profileWith({});
  const office = snapshotMutated(snapshot => ({
    ...snapshot,
    workplace: { ...snapshot.workplace, mandatory_onsite: "required" },
  }));
  const failed = ruleOf(evaluateJob(office, profile), "REMOTE-01");
  assert.equal(failed?.outcome, "fail");
  assert.deepEqual(failed?.reasonCodes, ["MANDATORY_ONSITE"]);

  const relaxed = profileWith({ zeroMandatoryAttendance: false });
  assert.equal(ruleOf(evaluateJob(office, relaxed), "REMOTE-01")?.outcome, "not_applicable");
});

test("rule SAL-01: incomparable salary stays unknown, never an invented rate", () => {
  const wanted = { amount: "50", currency: "USD", period: "hourly" as const,
    taxBasis: "unknown" as const, component: "unknown" as const, hard: true };
  const profile = profileWith({ minimumCompensation: wanted });
  const noSalary = snapshotMutated(snapshot => ({ ...snapshot,
    compensation: { ranges: [], original_text: null, evidence_ids: [] } }));
  const incomparable = ruleOf(evaluateJob(noSalary, profile), "SAL-01");
  assert.equal(incomparable?.outcome, "unknown");
  assert.deepEqual(incomparable?.reasonCodes, ["SALARY_INCOMPARABLE"]);

  const eurJob = snapshotMutated(snapshot => ({ ...snapshot,
    compensation: { ranges: [{ ...snapshot.compensation.ranges[0]!, currency: "EUR" }],
      original_text: "60–75 EUR / hourly", evidence_ids: [] } }));
  assert.equal(ruleOf(evaluateJob(eurJob, profile), "SAL-01")?.outcome, "unknown");

  const covered = snapshotMutated(snapshot => ({ ...snapshot,
    compensation: { ranges: [{ ...snapshot.compensation.ranges[0]!, min: "40", max: "80", currency: "USD", period: "hourly" }],
      original_text: "40–80 USD / hourly", evidence_ids: [] } }));
  assert.equal(ruleOf(evaluateJob(covered, profile), "SAL-01")?.outcome, "pass");

  const below = snapshotMutated(snapshot => ({ ...snapshot,
    compensation: { ranges: [{ ...snapshot.compensation.ranges[0]!, min: "20", max: "30", currency: "USD", period: "hourly" }],
      original_text: "20–30 USD / hourly", evidence_ids: [] } }));
  const hard = ruleOf(evaluateJob(below, profile), "SAL-01");
  assert.equal(hard?.outcome, "fail");
  assert.deepEqual(hard?.reasonCodes, ["SALARY_BELOW_MIN"]);

  const soft = profileWith({ minimumCompensation: { ...wanted, hard: false } });
  const softPass = ruleOf(evaluateJob(below, soft), "SAL-01");
  assert.equal(softPass?.outcome, "pass");
  assert.deepEqual(softPass?.reasonCodes, ["SALARY_BELOW_MIN"]);
});

test("aggregation: OR across options, AND inside an option (spec 13.2)", () => {
  // Fixture h-001 is a Full Time listing; the profile accepts Full Time so
  // CONTRACT-01 stays neutral and geography drives the aggregation.
  const profile = profileWith({ employmentTypes: ["employment_full_time"] });
  const twoOptions = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [
      { ...snapshot.hiring_options[0]!,
        id: "opt:us", geography: { ...snapshot.hiring_options[0]!.geography,
          scope: "restricted", allowed_countries: ["US"] } },
      { ...snapshot.hiring_options[0]!, id: "opt:de",
        geography: { ...snapshot.hiring_options[0]!.geography,
          scope: "restricted", allowed_countries: ["DE"] } },
    ],
  }));
  assert.equal(evaluateJob(twoOptions, profile).status, "eligible");

  const unknownPlusFail = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [
      { ...snapshot.hiring_options[0]!, id: "opt:us",
        geography: { ...snapshot.hiring_options[0]!.geography,
          scope: "restricted", allowed_countries: ["US"] } },
      { ...snapshot.hiring_options[0]!, id: "opt:none",
        geography: { ...snapshot.hiring_options[0]!.geography, scope: "unspecified" } },
    ],
  }));
  assert.equal(evaluateJob(unknownPlusFail, profile).status, "needs_review");

  const allFail = snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{ ...snapshot.hiring_options[0]!,
      geography: { ...snapshot.hiring_options[0]!.geography,
        scope: "restricted", allowed_countries: ["US"] } }],
  }));
  assert.equal(evaluateJob(allFail, profile).status, "ineligible");
});

test("rules are deterministic and versioned", () => {
  const profile = profileWith({});
  const snapshot = mapHimalayasFixture(NOW)[0]!;
  assert.deepEqual(evaluateJob(snapshot, profile), evaluateJob(snapshot, profile));
  assert.equal(typeof RULESET_VERSION, "number");
});

test("rule TIME-01: unpublished schedule is not_applicable; accepted zones checked seasonally", () => {
  const profile = profileWith({});
  const base = mapHimalayasFixture(NOW)[0]!;
  assert.equal(ruleOf(evaluateJob(base, profile), "TIME-01")?.outcome, "not_applicable");

  const withZones = (offsets: number[]) => snapshotMutated(snapshot => ({
    ...snapshot,
    hiring_options: [{ ...snapshot.hiring_options[0]!,
      schedule: { ...snapshot.hiring_options[0]!.schedule,
        status: "explicit", zone_semantics: "fixed_utc_offset", mode: "within_offset_set",
        accepted_utc_offsets_minutes: offsets, original_text: JSON.stringify(offsets) } }],
  }));
  // Europe/Berlin is UTC+1 in winter and UTC+2 in summer.
  const bothSeasons = ruleOf(evaluateJob(withZones([60, 120]), profile), "TIME-01");
  assert.equal(bothSeasons?.outcome, "pass");
  const oneSeason = ruleOf(evaluateJob(withZones([120]), profile), "TIME-01");
  assert.equal(oneSeason?.outcome, "unknown");
  assert.deepEqual(oneSeason?.reasonCodes, ["TIMEZONE_AMBIGUOUS"]);
  const farAway = ruleOf(evaluateJob(withZones([780]), profile), "TIME-01");
  assert.equal(farAway?.outcome, "fail");
  assert.deepEqual(farAway?.reasonCodes, ["OVERLAP_INSUFFICIENT"]);
});
