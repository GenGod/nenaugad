// B64-001: required travel is read from the posting, stored with its quote, kept in the
// catalog, and decided by the candidate's zero-mandatory-attendance setting (REMOTE-01).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot, type JobSnapshot } from "../../src/domain/source-contracts.ts";
import { readTravel, withTravel } from "../../src/server/import/travel-text.ts";
import { himalayasContractFixture, mapHimalayasRecord } from "../../src/server/import/himalayas-fixture.ts";
import { jobicyContractFixture, mapJobicyRecord } from "../../src/server/import/jobicy-fixture.ts";
import {
  mapRemoteFirstJobsRecord, remoteFirstJobsContractFixture,
} from "../../src/server/import/remote-first-jobs-fixture.ts";
import { classifySnapshot, projectCard } from "../../src/domain/snapshot-projection.ts";
import { evaluateJob, RULESET_VERSION } from "../../src/domain/matching.ts";
import { parseManualProfileInput } from "../../src/domain/profile.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";

const NOW = "2026-11-02T12:00:00.000Z";

const read = (text: string, title = "Account Executive") => readTravel(title, text);

test("detector: a stated requirement, a possibility, a negation, or nothing", () => {
  const table: readonly (readonly [string, string, string | null])[] = [
    // A share of the time.
    ["This is a remote role with up to 50% travel.", "required", "up to 50% travel"],
    ["15% estimated travel.", "required", "15% estimated travel"],
    ["Travel up to 25% to customer events.", "required", "Travel up to 25%"],
    ["You are comfortable traveling up to 20%.", "required", "traveling up to 20%"],
    ["Expected to travel no more than 25 % of the time.", "required", "travel no more than 25 %"],
    ["Travel: Approximately 25% minimum travel required.", "required", "Approximately 25% minimum travel"],
    // Stated as part of the job.
    ["Some evening availability and travel required.", "required", "travel required"],
    ["This is a remote job with some travel to our Connecticut facility required.", "required",
      "travel to our Connecticut facility required"],
    ["Must be able to travel as needed for sales events.", "required", "Must be able to travel"],
    ["The ability and willingness to travel both domestically and internationally.", "required",
      "ability and willingness to travel"],
    ["Willingness to travel up to 4 times a year for internal events.", "required", "Willingness to travel"],
    ["A remote position requiring travel to our San Jose, CA office once a month.", "required", "requiring travel"],
    ["This role includes occasional travel to Montgomery.", "required", "includes occasional travel"],
    ["Travel to client sites 50% of the time.", "required", "Travel to client sites"],
    ["You'll travel to one of our key markets for a one-week immersion.", "required", "You'll travel"],
    ["National travel expected up to 50%.", "required", "travel expected up to 50%"],
    // A possibility is unknown, never a requirement.
    ["Occasional travel may be required for team meetings.", "unknown", "travel may be required"],
    ["Travel of up to 10% may be required.", "unknown", "Travel of up to 10% may be required"],
    ["Travel to Portland, OR, may be required.", "unknown", "Travel to Portland, OR, may be required"],
    ["The role may require occasional travel.", "unknown", "may require occasional travel"],
    // Stated as not required.
    ["Permanent fully remote role. No mandatory travel or office visits.", "explicitly_not_required", "No mandatory travel"],
    ["No travel required.", "explicitly_not_required", "No travel required"],
    ["Travel is not required for this role.", "explicitly_not_required", "Travel is not required"],
    ["Travel: none.", "explicitly_not_required", "Travel: none"],
    // Not a duty: perks, the trade, other roles, travellers, offsites, nothing at all.
    ["Travel stipend and travel insurance for business trips.", "not_stated", null],
    ["Travel industry experience (required).", "not_stated", null],
    ["For eligible field-based roles that require travel, we cover all business travel expenses.", "not_stated", null],
    ["Many of us are parents, travelers or creatives.", "not_stated", null],
    ["Riders tap their bank card to travel.", "not_stated", null],
    ["We meet twice a year at an optional company retreat.", "not_stated", null],
    ["Fully remote role. Build great software.", "not_stated", null],
    ["Travel: 0%.", "explicitly_not_required", "Travel: 0%"],
  ];
  for (const [text, requirement, quote] of table) {
    assert.deepEqual(read(text), { requirement, quote }, text);
  }
  // A stated requirement beside a possibility is still a requirement.
  assert.equal(read("Travel may be required. Ability to travel up to 30%.").requirement, "required");
});

test("detector: a Travel label in the title; a job name that starts with it is not one", () => {
  assert.deepEqual(readTravel("Electrical Factory Inspector (Remote/Travel)", "Inspect."),
    { requirement: "required", quote: "Electrical Factory Inspector (Remote/Travel)" });
  assert.equal(readTravel("Field Engineer - Travel", "Fix.").requirement, "required");
  assert.equal(readTravel("Travel Nurse Recruiter (Remote)", "Recruit.").requirement, "not_stated");
  assert.equal(readTravel("Travel Industry Analyst", "Analyse.").requirement, "not_stated");
  // Unicode hyphens fold as in the remote rule.
  assert.equal(readTravel("Inspector \u2013 Travel", "Inspect.").requirement, "required");
});

test("withTravel: a stated reading adds its evidence; silence changes nothing", () => {
  const snapshot = mapHimalayasRecord(himalayasContractFixture[0]!, NOW);
  const silent = withTravel(snapshot.workplace, snapshot.evidence, { requirement: "not_stated", quote: null }, snapshot.id);
  assert.equal(silent.workplace, snapshot.workplace);
  assert.equal(silent.evidence, snapshot.evidence);
  const stated = withTravel(snapshot.workplace, snapshot.evidence, { requirement: "required", quote: "travel required" }, snapshot.id);
  assert.equal(stated.workplace.mandatory_travel, "required");
  assert.deepEqual(stated.workplace.evidence_ids, [...snapshot.workplace.evidence_ids, `ev:${snapshot.id}:travel`]);
  assert.deepEqual(stated.evidence.at(-1), {
    id: `ev:${snapshot.id}:travel`, origin_type: "job_source", origin_id: snapshot.id, origin_version: 1,
    field_path: "title+description", quote: "travel required", method: "rule", confidence: 0.8,
  });
});

// One posting text through each of the three mappers.
function mappedThreeWays(sentence: string): readonly JobSnapshot[] {
  const himalayas = himalayasContractFixture[0]!;
  const jobicy = jobicyContractFixture[0]!;
  const rfj = remoteFirstJobsContractFixture[0]!;
  return [
    mapHimalayasRecord({ ...himalayas, description: `<p>${himalayas.description} ${sentence}</p>` }, NOW),
    mapJobicyRecord({ ...jobicy, jobDescription: `<p>${jobicy.jobDescription} ${sentence}</p>` }, NOW),
    mapRemoteFirstJobsRecord({ ...rfj, description: `<p>${rfj.description} ${sentence}</p>` }, NOW),
  ];
}

test("mappers: all three sources store the reading and its quote; the catalog keeps the posting", () => {
  for (const snapshot of mappedThreeWays("Ability to travel up to 25% of the time.")) {
    assert.equal(isJobSnapshot(snapshot), true, snapshot.id);
    assert.equal(snapshot.workplace.mandatory_travel, "required", snapshot.id);
    assert.ok(snapshot.workplace.evidence_ids.includes(`ev:${snapshot.id}:travel`), snapshot.id);
    assert.equal(snapshot.evidence.find(item => item.id === `ev:${snapshot.id}:travel`)?.quote,
      "travel up to 25%", snapshot.id);
    // Spec §10.2: required travel is the candidate's question, not the catalog's.
    assert.equal(classifySnapshot(snapshot), "main_catalog", snapshot.id);
  }
  for (const snapshot of mappedThreeWays("Travel may be required.")) {
    assert.equal(snapshot.workplace.mandatory_travel, "unknown", snapshot.id);
    assert.equal(classifySnapshot(snapshot), "main_catalog", snapshot.id);
  }
  // Silence leaves the snapshot exactly as before B64: no evidence item, not_stated.
  for (const snapshot of mappedThreeWays("We review pull requests.")) {
    assert.equal(snapshot.workplace.mandatory_travel, "not_stated", snapshot.id);
    assert.equal(snapshot.evidence.some(item => item.id.endsWith(":travel")), false, snapshot.id);
  }
});

function remote01(snapshot: JobSnapshot, zeroMandatoryAttendance: boolean) {
  const profile = parseManualProfileInput({
    residenceCountry: "US", timezone: null, targetRoles: ["engineer"], skills: [],
    employmentTypes: ["employment_full_time"],
    availabilityWindows: [{ weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }],
    zeroMandatoryAttendance, minimumCompensation: null, showNeedsReview: true,
  });
  const evaluation = evaluateJob(snapshot, profile);
  return { status: evaluation.status, rule: evaluation.rules.find(rule => rule.ruleId === "REMOTE-01")! };
}

test("REMOTE-01 (ruleset 6): the zero-attendance setting decides required travel", () => {
  assert.equal(RULESET_VERSION, 6);
  const [required] = mappedThreeWays("Ability to travel up to 25% of the time.");
  const strict = remote01(required!, true);
  assert.equal(strict.rule.outcome, "fail");
  assert.deepEqual(strict.rule.reasonCodes, ["MANDATORY_TRAVEL"]);
  assert.equal(strict.rule.explanation, "У вакансии есть обязательные поездки: «travel up to 25%».");
  assert.notEqual(strict.status, "eligible"); // a job-level fail caps the status
  // A candidate who accepts travel: the rule does not apply.
  assert.equal(remote01(required!, false).rule.outcome, "not_applicable");

  const [possible] = mappedThreeWays("Travel may be required.");
  const unclear = remote01(possible!, true).rule;
  assert.equal(unclear.outcome, "unknown");
  assert.deepEqual(unclear.reasonCodes, ["MANDATORY_TRAVEL_UNCLEAR"]);
  assert.equal(unclear.explanation, "Поездки возможны, обязательность не ясна: «Travel may be required».");

  const [silent] = mappedThreeWays("We review pull requests.");
  assert.equal(remote01(silent!, true).rule.outcome, "pass");
  const [negated] = mappedThreeWays("No travel required.");
  assert.equal(remote01(negated!, true).rule.outcome, "pass");
});

test("REMOTE-01: mandatory on-site still fails first and is still excluded from the catalog", () => {
  const onsite = mapJobicyRecord(jobicyContractFixture[2]!, NOW); // "two days per week in our Boston office"
  assert.equal(classifySnapshot(onsite), "excluded");
  assert.deepEqual(remote01(onsite, true).rule.reasonCodes, ["MANDATORY_ONSITE"]);
});

test("card: the travel note carries the reading and the quote; silence shows none", () => {
  const [required, possible, silent] = [
    "Ability to travel up to 25% of the time.", "Travel may be required.", "We review pull requests.",
  ].map(sentence => mappedThreeWays(sentence)[0]!);
  const card = (snapshot: JobSnapshot) => projectCard({
    sourceId: "himalayas", snapshot, contentHash: "", firstSeenAt: NOW, fullPassMisses: 0,
  }, himalayasCandidatePolicy);
  assert.deepEqual(card(required!).travel, { requirement: "required", quote: "travel up to 25%" });
  assert.deepEqual(card(possible!).travel, { requirement: "unknown", quote: "Travel may be required" });
  assert.equal(card(silent!).travel, null);
});
