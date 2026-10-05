// Freshness signal tests (design item A5).
//
// The signal exists to break ties and demote stale listings, so these tests pin
// exactly that: monotone decay, no boost without evidence, no rejection of a
// future timestamp, and an honest candidate-facing label that says when WE saw
// the posting rather than when a source claims it was published.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FRESHNESS_HALF_LIFE_DAYS, FRESHNESS_MAX_DEMOTION, ageInDays, firstSeenLabel, freshnessDemotion,
} from "../../src/domain/freshness.ts";
import { GOLDEN_PROFILES, GOLDEN_SET } from "../../src/data/matching-golden.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import {
  rankJobs, rankJobsBaselineV0, rankJobsWithoutFreshness, rankJobsWithoutUrgency, type RankableJob,
} from "../../src/domain/match-ranker.ts";

const NOW = "2026-09-29T12:00:00.000Z";
const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

test("freshness demotes continuously: zero while fresh, never overshooting the cap", () => {
  assert.equal(freshnessDemotion(daysAgo(0), NOW), 0);
  assert.equal(freshnessDemotion(daysAgo(FRESHNESS_HALF_LIFE_DAYS), NOW), -Math.round(FRESHNESS_MAX_DEMOTION / 2));
  assert.equal(freshnessDemotion(daysAgo(FRESHNESS_HALF_LIFE_DAYS * 2), NOW), -Math.round(FRESHNESS_MAX_DEMOTION * 0.75));
  // Monotone downwards and bounded: an older listing is never ranked as if it
  // were fresher, and the demotion never exceeds its cap.
  const series = [0, 1, 2, 5, 10, 20, 45, 200].map(days => freshnessDemotion(daysAgo(days), NOW));
  for (let i = 1; i < series.length; i += 1) {
    assert.ok((series[i] ?? 0) <= (series[i - 1] ?? 0), `demotion must not shrink with age: ${series.join(", ")}`);
  }
  assert.ok((series[series.length - 1] ?? 0) >= -FRESHNESS_MAX_DEMOTION);
  // Nothing is ever positive: freshness cannot lift a listing above a better match.
  for (const value of series) assert.ok(value <= 0);
});

test("freshness is silent without evidence: unknown and broken timestamps change nothing", () => {
  assert.equal(freshnessDemotion(undefined, NOW), 0);
  assert.equal(freshnessDemotion("not-a-date", NOW), 0);
  assert.equal(ageInDays("not-a-date", NOW), null);
  assert.equal(freshnessDemotion("2026-09-29T08:00:00.000Z", "not-a-date"), 0);
  // A future timestamp is clock skew, not a reason to punish the posting.
  assert.equal(freshnessDemotion("2026-12-01T00:00:00.000Z", NOW), 0);
});

test("age label is honest about the observation and declines Russian plurals", () => {
  assert.equal(firstSeenLabel(daysAgo(0), NOW), "найдена сегодня");
  assert.equal(firstSeenLabel(daysAgo(1), NOW), "найдена 1 день назад");
  assert.equal(firstSeenLabel(daysAgo(3), NOW), "найдена 3 дня назад");
  assert.equal(firstSeenLabel(daysAgo(5), NOW), "найдена 5 дней назад");
  assert.equal(firstSeenLabel(daysAgo(11), NOW), "найдена 11 дней назад");
  assert.equal(firstSeenLabel(daysAgo(21), NOW), "найдена 21 день назад");
  assert.equal(firstSeenLabel(daysAgo(45), NOW), "найдена более месяца назад");
  assert.equal(firstSeenLabel(undefined, NOW), null);
});

test("ranked order: each time layer independently fixes the stale/fresh twin", () => {
  // Measured 2026-10-04 (B6): the fixture pair is 45 days apart, which puts the
  // stale twin in B6's hazard window as well — so the pair now demonstrates
  // EITHER layer, and both are asserted here. The layers' aggregate effects are
  // measured separately in tests/unit/matching-eval.test.ts (freshness still
  // shows a strict aggregate gain on its own; the hazard window's marginal
  // aggregate effect on this frozen set is zero and is recorded there).
  const backend = GOLDEN_PROFILES.find(profile => profile.id === "p-backend-eu");
  assert.ok(backend);
  const stale = GOLDEN_SET.jobs.find(job => job.snapshot.id === "golden-j33");
  const fresh = GOLDEN_SET.jobs.find(job => job.snapshot.id === "golden-j34");
  assert.ok(stale && fresh);
  const shown: RankableJob[] = [stale, fresh].map(job => {
    const evaluation = evaluateJob(job.snapshot, backend.profile);
    assert.ok(evaluation.status === "eligible" || evaluation.status === "needs_review");
    return { snapshot: job.snapshot, status: evaluation.status, firstSeenAt: job.firstSeenAt };
  });
  const now = GOLDEN_SET.evaluatedAt;
  // Neither time term: the twins tie and id order decides (stale j33 first).
  const neither = rankJobsBaselineV0(shown, backend.profile, now);
  assert.equal(neither[0]?.snapshot.id, "golden-j33");
  // Freshness alone fixes the pair…
  assert.equal(rankJobsWithoutUrgency(shown, backend.profile, now)[0]?.snapshot.id, "golden-j34");
  // …the hazard window alone fixes it too…
  assert.equal(rankJobsWithoutFreshness(shown, backend.profile, now)[0]?.snapshot.id, "golden-j34");
  // …and the product ranker (both) keeps the fresh twin first, stale present.
  const product = rankJobs(shown, backend.profile, now);
  assert.equal(product[0]?.snapshot.id, "golden-j34");
  assert.equal(product.length, 2);
  // The fresh listing's own score is untouched: both terms act on the stale one
  // only, so a time term can never lift a posting above a better match.
  const freshInBaseline = neither.find(entry => entry.snapshot.id === "golden-j34");
  const freshInProduct = product.find(entry => entry.snapshot.id === "golden-j34");
  assert.ok(freshInBaseline && freshInProduct);
  assert.equal(freshInProduct.score, freshInBaseline.score);
  assert.equal(freshInProduct.freshness, 0);
  assert.equal(freshInProduct.urgency, 0);
  const staleInProduct = product.find(entry => entry.snapshot.id === "golden-j33");
  assert.ok(staleInProduct);
  assert.ok(staleInProduct.freshness < 0);
  assert.ok(staleInProduct.urgency < 0);
  assert.ok(staleInProduct.score < freshInProduct.score);
});
