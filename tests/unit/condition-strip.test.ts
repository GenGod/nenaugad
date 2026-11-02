import assert from "node:assert/strict";
import { test } from "node:test";
import type { JobEvaluation, RuleOutcome, RuleResult } from "../../src/domain/matching.ts";
import {
  bestHiringOptionId, conditionStrip, zoneStrip, STRIP_GROUPS,
} from "../../src/domain/condition-strip.ts";

// DS-002b: the five-cell strip projects the rules engine's own outcomes; it
// never recomputes or upgrades them.

function rule(ruleId: string, outcome: RuleOutcome, hiringOptionId: string | null = null): RuleResult {
  return { ruleId, outcome, hiringOptionId, reasonCodes: [], explanation: `${ruleId} ${outcome}` };
}

function evaluation(rules: RuleResult[], status: JobEvaluation["status"] = "needs_review"): JobEvaluation {
  return { snapshotId: "s1", status, rules };
}

const JOB_LEVEL = [rule("REMOTE-01", "pass"), rule("SAL-01", "not_applicable"), rule("ROLE-01", "pass"), rule("SKILL-01", "pass")];

test("five cells in the fixed order: country, hours, contract, pay, skills", () => {
  const strip = conditionStrip(evaluation([
    ...JOB_LEVEL,
    rule("GEO-01", "pass", "a"), rule("CONTRACT-01", "unknown", "a"), rule("TIME-01", "fail", "a"),
  ]));
  assert.deepEqual(strip.map(cell => cell.group), ["country", "hours", "contract", "pay", "skills"]);
  assert.deepEqual(STRIP_GROUPS, ["country", "hours", "contract", "pay", "skills"]);
  assert.deepEqual(strip.map(cell => cell.outcome), ["pass", "fail", "unknown", "not_applicable", "pass"]);
  assert.equal(strip[1]!.explanation, "TIME-01 fail");
  assert.deepEqual(strip.map(cell => cell.label), ["страна", "часы", "договор", "оплата", "навыки"]);
});

test("relevance and gate rules stay out of the strip", () => {
  const strip = conditionStrip(evaluation([
    rule("REMOTE-01", "fail"), rule("ROLE-01", "fail"), rule("SAL-01", "pass"), rule("SKILL-01", "pass"),
    rule("GEO-01", "pass", "a"), rule("CONTRACT-01", "pass", "a"), rule("TIME-01", "pass", "a"),
  ]));
  assert.ok(strip.every(cell => cell.outcome === "pass"));
});

test("per-option cells come from the best hiring option, never mixed across options", () => {
  // Option a fails on country, option b fails on hours: neither is "all pass",
  // and the strip must not combine a's hours with b's country.
  const rules = [
    ...JOB_LEVEL,
    rule("GEO-01", "fail", "a"), rule("CONTRACT-01", "pass", "a"), rule("TIME-01", "pass", "a"),
    rule("GEO-01", "pass", "b"), rule("CONTRACT-01", "pass", "b"), rule("TIME-01", "unknown", "b"),
  ];
  assert.equal(bestHiringOptionId(evaluation(rules)), "b");
  const strip = conditionStrip(evaluation(rules));
  assert.equal(strip[0]!.outcome, "pass");
  assert.equal(strip[1]!.outcome, "unknown");
});

test("best option: pass beats unknown beats fail; not applicable counts as pass; ties keep order", () => {
  const passing = [
    rule("GEO-01", "unknown", "a"), rule("CONTRACT-01", "pass", "a"), rule("TIME-01", "pass", "a"),
    rule("GEO-01", "pass", "b"), rule("CONTRACT-01", "pass", "b"), rule("TIME-01", "not_applicable", "b"),
    rule("GEO-01", "pass", "c"), rule("CONTRACT-01", "pass", "c"), rule("TIME-01", "pass", "c"),
  ];
  assert.equal(bestHiringOptionId(evaluation(passing)), "b");
  const failing = [
    rule("GEO-01", "fail", "a"), rule("CONTRACT-01", "pass", "a"), rule("TIME-01", "pass", "a"),
    rule("GEO-01", "fail", "b"), rule("CONTRACT-01", "fail", "b"), rule("TIME-01", "pass", "b"),
  ];
  assert.equal(bestHiringOptionId(evaluation(failing)), "a");
});

test("an eligible job never shows a failed or unknown option cell", () => {
  const strip = conditionStrip(evaluation([
    ...JOB_LEVEL,
    rule("GEO-01", "unknown", "a"), rule("CONTRACT-01", "pass", "a"), rule("TIME-01", "pass", "a"),
    rule("GEO-01", "pass", "b"), rule("CONTRACT-01", "pass", "b"), rule("TIME-01", "pass", "b"),
  ], "eligible"));
  assert.deepEqual(strip.slice(0, 3).map(cell => cell.outcome), ["pass", "pass", "pass"]);
});

test("no hiring option: the three option cells are unknown with a reason, not a pass", () => {
  assert.equal(bestHiringOptionId(evaluation([...JOB_LEVEL])), null);
  const strip = conditionStrip(evaluation([...JOB_LEVEL]));
  for (const cell of strip.slice(0, 3)) {
    assert.equal(cell.outcome, "unknown");
    assert.match(cell.explanation, /не опубликованы/u);
  }
});

test("zone strip: accepted whole-hour offsets on a −12…+14 axis with the candidate marked", () => {
  const zones = zoneStrip({ offsetsMinutes: [-300, -360, 60], semantics: "standard_utc_offset" }, [240]);
  assert.equal(zones.cells.length, 27);
  assert.equal(zones.cells[0]!.offsetHours, -12);
  assert.equal(zones.cells[26]!.offsetHours, 14);
  const accepted = zones.cells.filter(cell => cell.accepted).map(cell => cell.offsetHours);
  assert.deepEqual(accepted, [-6, -5, 1]);
  assert.deepEqual(zones.cells.filter(cell => cell.candidate).map(cell => cell.offsetHours), [4]);
  assert.equal(zones.acceptedText, "UTC−6, UTC−5, UTC+1");
  assert.equal(zones.candidateText, "UTC+4");
  assert.equal(zones.summerIncluded, true);
});

test("zone strip: half-hour offsets are kept in the text and mark their hour cell", () => {
  const zones = zoneStrip({ offsetsMinutes: [330], semantics: "fixed_utc_offset" }, [60, 120]);
  assert.deepEqual(zones.cells.filter(cell => cell.accepted).map(cell => cell.offsetHours), [5]);
  assert.equal(zones.acceptedText, "UTC+5:30");
  assert.equal(zones.candidateText, "UTC+1 / UTC+2");
  assert.equal(zones.summerIncluded, false);
});

test("zone strip: an unknown candidate zone marks nothing and says so", () => {
  const zones = zoneStrip({ offsetsMinutes: [0], semantics: "fixed_utc_offset" }, []);
  assert.equal(zones.cells.filter(cell => cell.candidate).length, 0);
  assert.equal(zones.candidateText, null);
  assert.equal(zones.acceptedText, "UTC±0");
});

test("candidate offsets sample the year like TIME-01", async () => {
  const { candidateOffsets } = await import("../../src/domain/condition-strip.ts");
  assert.deepEqual(candidateOffsets("Europe/Berlin"), [60, 120]);
  assert.deepEqual(candidateOffsets("Asia/Tbilisi"), [240]);
  assert.deepEqual(candidateOffsets("Europe/London"), [0, 60]);
  assert.deepEqual(candidateOffsets("Not/AZone"), []);
});

test("zone fact: the best option's explicit offsets, or null when none are published", async () => {
  const { zoneFactOf } = await import("../../src/domain/condition-strip.ts");
  const { mapHimalayasFixture } = await import("../../src/server/import/himalayas-fixture.ts");
  const base = mapHimalayasFixture("2026-09-24T12:00:00.000Z")[0]!;
  const option = base.hiring_options[0]!;
  const withOffsets = { ...base, hiring_options: [{ ...option, schedule: { ...option.schedule,
    status: "explicit" as const, zone_semantics: "standard_utc_offset" as const, accepted_utc_offsets_minutes: [60, 120] } }] };
  const ev = evaluation([rule("GEO-01", "pass", option.id), rule("CONTRACT-01", "pass", option.id), rule("TIME-01", "pass", option.id)]);
  assert.deepEqual(zoneFactOf(withOffsets, ev), { offsetsMinutes: [60, 120], semantics: "standard_utc_offset" });
  const notStated = { ...base, hiring_options: [{ ...option, schedule: { ...option.schedule,
    status: "not_stated" as const, accepted_utc_offsets_minutes: [] } }] };
  assert.equal(zoneFactOf(notStated, ev), null);
  assert.equal(zoneFactOf(withOffsets, evaluation([...JOB_LEVEL])), null);
});

test("zone text: runs of three or more whole hours collapse into a range", () => {
  const us = zoneStrip({ offsetsMinutes: [-600, -540, -480, -420, -360, -300, 840], semantics: "standard_utc_offset" }, [-300, -240]);
  assert.equal(us.acceptedText, "UTC−10…UTC−5, UTC+14");
  assert.equal(us.candidateText, "UTC−5 / UTC−4");
  const halves = zoneStrip({ offsetsMinutes: [270, 330, 390], semantics: "fixed_utc_offset" }, []);
  assert.equal(halves.acceptedText, "UTC+4:30, UTC+5:30, UTC+6:30");
});
