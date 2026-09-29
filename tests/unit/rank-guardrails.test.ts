// Unit tests for the per-request guardrails and the shadow diff (design item A9).
//
// A guardrail is only worth having if it FIRES on the failure it exists for, so
// each test here feeds it a deliberately degraded ranker and asserts the verdict.
// The shadow diff is pinned on positions, since that is what it reports.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUARDRAIL_THRESHOLDS, evaluateGuardrails,
  type RankedRequestItem, type RankedRequestSample,
} from "../../src/domain/rank-guardrails.ts";
import { shadowDiff } from "../../src/domain/ranker-shadow.ts";

function item(id: string, overrides: Partial<RankedRequestItem> = {}): RankedRequestItem {
  return { id, closed: false, duplicate: false, approvedSource: true, ...overrides };
}

function request(ranked: readonly RankedRequestItem[], overrides: Partial<RankedRequestSample> = {}): RankedRequestSample {
  return { poolSize: 40, ranked, latencyMs: 20, ...overrides };
}

const HEALTHY = [
  request([item("a"), item("b"), item("c")]),
  request([item("d"), item("e")]),
];

test("guardrails: an honest feed passes and reports the metrics it computed", () => {
  const report = evaluateGuardrails(HEALTHY);
  assert.equal(report.pass, true);
  assert.deepEqual(report.violations, []);
  assert.equal(report.requests, 2);
  assert.equal(report.emptyShare, 0);
  assert.equal(report.maxClosedInTop10Share, 0);
  assert.equal(report.p95LatencyMs, 20);
});

test("guardrails: a ranker that empties the feed is caught", () => {
  const report = evaluateGuardrails([request([]), request([]), request([item("a")])]);
  assert.equal(report.pass, false);
  assert.equal(report.emptyShare, 2 / 3);
  assert.ok(report.violations.some(violation => violation.metric === "emptyShare"));
});

test("guardrails: an empty pool is not an emptied feed", () => {
  // Nothing was available to rank: honest, and not the ranker's doing.
  const report = evaluateGuardrails([request([], { poolSize: 0 }), request([item("a")])]);
  assert.equal(report.emptyShare, 0);
  assert.equal(report.pass, true);
});

test("guardrails: closed, duplicate and unapproved postings in the top-10 are caught", () => {
  const closed = evaluateGuardrails([request([item("a", { closed: true }), item("b")])]);
  assert.ok(closed.violations.some(violation => violation.metric === "maxClosedInTop10Share"));

  const duplicate = evaluateGuardrails([request([item("a"), item("b", { duplicate: true })])]);
  assert.ok(duplicate.violations.some(violation => violation.metric === "maxDuplicateInTop10Share"));

  const unapproved = evaluateGuardrails([request([item("a", { approvedSource: false })])]);
  assert.ok(unapproved.violations.some(violation => violation.metric === "maxUnapprovedSourceShare"));
});

test("guardrails: the hard limits are zero — one bad posting in the top-10 is a violation", () => {
  assert.equal(GUARDRAIL_THRESHOLDS.maxClosedInTop10Share, 0);
  assert.equal(GUARDRAIL_THRESHOLDS.maxDuplicateInTop10Share, 0);
  assert.equal(GUARDRAIL_THRESHOLDS.maxUnapprovedSourceShare, 0);
  // Position 10 is still the top-10; position 11 is not part of the check.
  const atTheEdge = evaluateGuardrails([request([...Array.from({ length: 9 }, (_, index) => item(`ok-${index}`)), item("bad", { closed: true })])]);
  assert.equal(atTheEdge.pass, false);
  const outside = evaluateGuardrails([request([...Array.from({ length: 10 }, (_, index) => item(`ok-${index}`)), item("bad", { closed: true })])]);
  assert.equal(outside.pass, true);
});

test("guardrails: a slow ranker is caught by the latency bound", () => {
  const report = evaluateGuardrails([
    request([item("a")], { latencyMs: 10 }),
    request([item("b")], { latencyMs: 400 }),
  ]);
  assert.equal(report.p95LatencyMs, 400);
  assert.ok(report.violations.some(violation => violation.metric === "p95LatencyMs"));
});

test("shadow diff: identical orders show no movement", () => {
  const diff = shadowDiff("champion", ["a", "b", "c"], "candidate", ["a", "b", "c"]);
  assert.deepEqual(diff, {
    championId: "champion", candidateId: "candidate",
    compared: 3, moved: 0, top10Changed: 0, maxShift: 0, firstDifferenceAt: null,
  });
});

test("shadow diff: positions, shift and the first disagreement are reported", () => {
  const diff = shadowDiff("champion", ["a", "b", "c", "d"], "candidate", ["b", "a", "c", "d"]);
  assert.equal(diff.compared, 4);
  assert.equal(diff.moved, 2);
  assert.equal(diff.maxShift, 1);
  assert.equal(diff.firstDifferenceAt, 1);
  assert.equal(diff.top10Changed, 0, "a swap inside the top-10 keeps the same set");

  // Something entering the top ten from below is a top-10 change.
  const deep = shadowDiff("champion", ["a", "b", "c"], "candidate", ["a", "c", "b"]);
  assert.equal(deep.moved, 2);
  assert.equal(deep.top10Changed, 0);
  const withEleventh = shadowDiff("champion",
    ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"],
    "candidate", ["k", "b", "c", "d", "e", "f", "g", "h", "i", "j", "a"]);
  assert.equal(withEleventh.top10Changed, 2);
});

test("shadow diff: postings missing from one side are not counted as moved", () => {
  // A ranker that drops a posting is a different failure (a guardrail on the pool
  // and the gates catches it); the diff must not invent shifts for it.
  const diff = shadowDiff("champion", ["a", "b", "c"], "candidate", ["a", "c"]);
  assert.equal(diff.compared, 2);
  assert.equal(diff.moved, 1);
  assert.equal(diff.maxShift, 1);
});
