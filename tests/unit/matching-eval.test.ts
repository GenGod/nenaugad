// Ratcheted quality gates for the matching pipeline (design item A1).
//
// The thresholds below are FLOORS measured on the v0 baseline ranker with the
// golden set at version 1. They may only be raised. Lowering one requires a
// recorded reason in the task file — the same discipline as the repair-cycle
// counter: a number that can quietly move down measures nothing.
//
// What is at ceiling today (be honest about it):
//   * R@10 and MRR are 1.000 for every profile — the shown pools are small
//     (19-24 jobs) and every relevant job still fits into the top ten.
//   * NDCG@5/@10 and R@5 carry the real signal. They are pulled down by the
//     two keyword-trap postings (golden-j28/j29) and by the naive role-substring
//     boost in the v0 ranker, which is exactly the headroom A2/A3 exist for.
// When the golden set grows or a better ranker lands, re-baseline these floors
// upward and note the change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLDEN_SET } from "../../src/data/matching-golden.ts";
import {
  dcgAtK, meanOfApplicable, ndcgAtK, recallAtK, reciprocalRank,
} from "../../src/domain/eval-metrics.ts";
import { runMatchingEval, type Ranker } from "../../src/domain/matching-eval.ts";
import {
  rankJobs, rankJobsBaselineV0, rankJobsWithoutFreshness,
} from "../../src/domain/match-ranker.ts";
import { parseManualProfileInput } from "../../src/domain/profile.ts";
import { isJobSnapshot } from "../../src/domain/source-contracts.ts";

// Floors measured on the current ranker and golden set, rounded DOWN to 6
// decimals so platform-level floating-point noise cannot flip them.
//
// Re-baselining history (upward moves are routine; downward moves need a reason
// recorded here and in the task file):
//   * A2: re-baselined DOWNWARD once — the set grew from 29 to 32 jobs (new
//     fixtures change the shown pools) — see tasks/A2-001.
//   * A3: raised after the skills dictionary v2 removed false-positive matches
//     (NDCG@5 0.903879 -> 0.909773, NDCG@10 0.924056 -> 0.942889).
//   * A5: re-baselined DOWNWARD once — the set grew from 32 to 34 jobs (the
//     freshness pair) — see tasks/A5-001; the freshness layer itself was
//     measured to raise the aggregate on that same set (0.912941 -> 0.914340
//     NDCG@5, 0.915359 -> 0.916478 NDCG@10) and is guarded by its own ratchet.
// The guarantees that may NOT move are the relative ones below: neither the
// requirement layer nor the freshness layer may score worse than the same
// ranker without it, per profile and in aggregate.
const THRESHOLDS = {
  recallAt5: 0.742261,
  recallAt10: 0.877380,
  ndcgAt5: 0.914340,
  ndcgAt10: 0.916478,
  mrr: 1.0,
} as const;

test("metrics: DCG follows the exponential-gain formula with a log2(i+1) discount", () => {
  assert.equal(dcgAtK([3], 1), 7); // (2^3 - 1) / log2(2)
  assert.equal(dcgAtK([3, 0], 2), 7); // a grade-0 item adds nothing
  // Grade 3 moved from position 1 to position 2: 7 / log2(3).
  assert.ok(Math.abs(dcgAtK([0, 3], 2) - 7 / Math.log2(3)) < 1e-12);
  assert.throws(() => dcgAtK([1], 0), /INVALID_CUTOFF/);
});

test("metrics: NDCG normalises by the ideal ordering and stays null without judged gain", () => {
  assert.equal(ndcgAtK([3, 2], [3, 2], 2), 1);
  const swapped = ndcgAtK([2, 3], [3, 2], 2);
  assert.ok(swapped !== null && Math.abs(swapped - (7 / Math.log2(3) + 3) / (7 + 3 / Math.log2(3))) < 1e-12);
  assert.equal(ndcgAtK([0, 0], [0, 0], 2), null); // no judged relevance at all
});

test("metrics: recall counts the relevant items inside the top-k cut", () => {
  assert.equal(recallAtK(["a", "b", "c"], new Set(["a", "c"]), 2), 0.5);
  assert.equal(recallAtK(["a", "b", "c"], new Set(["a", "c"]), 10), 1);
  assert.equal(recallAtK(["a"], new Set(), 5), null); // no relevant item — excluded, not 0
});

test("metrics: reciprocal rank uses the first relevant position, 0 when nothing matches", () => {
  assert.equal(reciprocalRank(["a", "b"], new Set(["a"])), 1);
  assert.equal(reciprocalRank(["b", "a", "c"], new Set(["a"])), 0.5);
  assert.equal(reciprocalRank(["b", "c"], new Set(["a"])), 0);
  assert.equal(reciprocalRank(["b"], new Set()), null);
});

test("metrics: means exclude non-applicable queries and report their count", () => {
  assert.deepEqual(meanOfApplicable([1, null, 0.5]), { mean: 0.75, count: 2 });
  assert.deepEqual(meanOfApplicable([]), { mean: 0, count: 0 });
  assert.deepEqual(meanOfApplicable([null, null]), { mean: 0, count: 0 });
});

test("golden set: every fixture is a valid contract object and a valid profile", () => {
  for (const job of GOLDEN_SET.jobs) {
    assert.ok(isJobSnapshot(job.snapshot), `${job.snapshot.id} must satisfy the JobSnapshot contract`);
  }
  for (const golden of GOLDEN_SET.profiles) {
    // Round-trip through the real profile validator: the harness must not run
    // on profile shapes the product would reject.
    const parsed = parseManualProfileInput({ ...golden.profile });
    assert.deepEqual(parsed, golden.profile, `${golden.id} must survive profile validation unchanged`);
  }
});

test("golden set: every job is judged for every profile with a grade in 0..3", () => {
  for (const golden of GOLDEN_SET.profiles) {
    const judgment = GOLDEN_SET.judgments.find(item => item.profileId === golden.id);
    assert.ok(judgment, `${golden.id} must have judgments`);
    for (const job of GOLDEN_SET.jobs) {
      const grade = judgment.grades[job.snapshot.id] ?? -1;
      assert.ok(Number.isInteger(grade) && grade >= 0 && grade <= 3,
        `${golden.id}/${job.snapshot.id} must be judged 0..3, got ${grade}`);
    }
  }
});

test("evaluation: gates and fixtures agree (nothing judged relevant is hidden, nothing shown is unjudged)", () => {
  const report = runMatchingEval(GOLDEN_SET);
  assert.equal(report.guards.unjudgedShown, 0,
    "every shown job must be judged — add a grade for it before extending the golden set");
  assert.equal(report.guards.relevantHidden, 0,
    "a grade >= 2 job must never be hidden by the gates: grades of 2-3 describe jobs the candidate should see");
  for (const profile of report.profiles) {
    assert.ok(profile.shownIds.length > 0, `${profile.profileId} must have at least one shown job`);
    assert.ok(profile.relevantShown.length > 0, `${profile.profileId} must have at least one relevant shown job`);
  }
});

test("evaluation: the run is deterministic — same inputs, byte-identical report", () => {
  const first = JSON.stringify(runMatchingEval(GOLDEN_SET));
  const second = JSON.stringify(runMatchingEval(GOLDEN_SET));
  assert.equal(first, second);
});

test("evaluation: the harness detects degradation (control ranker scores strictly worse)", () => {
  const baseline = runMatchingEval(GOLDEN_SET);
  // A deliberately bad but deterministic ranker: input order reversed, no scores.
  // Annotated as Ranker so the (jobs, profile, now) contract stays explicit.
  const control: Ranker = (jobs) =>
    jobs.map(job => ({ ...job, score: 0, freshness: 0 })).reverse();
  const degraded = runMatchingEval(GOLDEN_SET, control);
  assert.ok(degraded.aggregate.ndcgAt10 !== null && baseline.aggregate.ndcgAt10 !== null);
  assert.ok(degraded.aggregate.ndcgAt10 < baseline.aggregate.ndcgAt10,
    "a ranker that ignores relevance must score worse than the baseline, otherwise the metrics measure nothing");
});

test("evaluation: the requirement layer never scores worse than the same ranker without it", () => {
  // The relative ratchet (item A2). Absolute floors may be re-baselined when the
  // golden set grows; this comparison may not: on identical fixtures and ranks,
  // turning the requirement decomposition on must help, never hurt.
  const withRequirements = runMatchingEval(GOLDEN_SET, rankJobs);
  const withoutRequirements = runMatchingEval(GOLDEN_SET, rankJobsBaselineV0);
  assert.ok(withRequirements.aggregate.ndcgAt5 > withoutRequirements.aggregate.ndcgAt5,
    "requirement terms must improve aggregate NDCG@5");
  assert.ok(withRequirements.aggregate.ndcgAt10 > withoutRequirements.aggregate.ndcgAt10,
    "requirement terms must improve aggregate NDCG@10");
  for (let i = 0; i < withRequirements.profiles.length; i += 1) {
    const withTerms = withRequirements.profiles[i];
    const withoutTerms = withoutRequirements.profiles[i];
    assert.ok(withTerms !== undefined && withoutTerms !== undefined);
    assert.equal(withTerms.profileId, withoutTerms.profileId);
    assert.ok(withTerms.ndcgAt10 !== null && withoutTerms.ndcgAt10 !== null);
    assert.ok(withTerms.ndcgAt10 >= withoutTerms.ndcgAt10,
      `${withTerms.profileId}: requirements degraded NDCG@10 (${withTerms.ndcgAt10} < ${withoutTerms.ndcgAt10})`);
  }
});

test("evaluation: the freshness layer never scores worse than the same ranker without it", () => {
  // The A5 ratchet, sibling of the requirement one below: on identical fixtures
  // and the same reference time, turning the freshness term on must help.
  const withFreshness = runMatchingEval(GOLDEN_SET, rankJobs);
  const withoutFreshness = runMatchingEval(GOLDEN_SET, rankJobsWithoutFreshness);
  assert.ok(withFreshness.aggregate.ndcgAt5 > withoutFreshness.aggregate.ndcgAt5,
    "freshness must improve aggregate NDCG@5");
  assert.ok(withFreshness.aggregate.ndcgAt10 > withoutFreshness.aggregate.ndcgAt10,
    "freshness must improve aggregate NDCG@10");
  for (let i = 0; i < withFreshness.profiles.length; i += 1) {
    const fresh = withFreshness.profiles[i];
    const stale = withoutFreshness.profiles[i];
    assert.ok(fresh !== undefined && stale !== undefined);
    assert.ok(fresh.ndcgAt10 !== null && stale.ndcgAt10 !== null);
    assert.ok(fresh.ndcgAt10 >= stale.ndcgAt10,
      `${fresh.profileId}: freshness degraded NDCG@10 (${fresh.ndcgAt10} < ${stale.ndcgAt10})`);
  }
});

test("evaluation: baseline metrics stay above the ratcheted floors", () => {
  const report = runMatchingEval(GOLDEN_SET);
  assert.ok(report.aggregate.recallAt5 >= THRESHOLDS.recallAt5,
    `Recall@5 regressed: ${report.aggregate.recallAt5.toFixed(3)} < ${THRESHOLDS.recallAt5}`);
  assert.ok(report.aggregate.recallAt10 >= THRESHOLDS.recallAt10,
    `Recall@10 regressed: ${report.aggregate.recallAt10.toFixed(3)} < ${THRESHOLDS.recallAt10}`);
  assert.ok(report.aggregate.ndcgAt5 >= THRESHOLDS.ndcgAt5,
    `NDCG@5 regressed: ${report.aggregate.ndcgAt5.toFixed(3)} < ${THRESHOLDS.ndcgAt5}`);
  assert.ok(report.aggregate.ndcgAt10 >= THRESHOLDS.ndcgAt10,
    `NDCG@10 regressed: ${report.aggregate.ndcgAt10.toFixed(3)} < ${THRESHOLDS.ndcgAt10}`);
  assert.ok(report.aggregate.mrr >= THRESHOLDS.mrr,
    `MRR regressed: ${report.aggregate.mrr.toFixed(3)} < ${THRESHOLDS.mrr}`);
  assert.equal(report.aggregate.applicableProfiles, GOLDEN_SET.profiles.length,
    "every profile must contribute applicable metrics");
});
