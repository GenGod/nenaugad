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
import { rankJobs, rankJobsWithoutFreshness, type RankableJob } from "../../src/domain/match-ranker.ts";

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

test("ranked order: the fresh twin wins, and the stale one is not dropped", () => {
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
  const withFreshness = rankJobs(shown, backend.profile, GOLDEN_SET.evaluatedAt);
  const withoutFreshness = rankJobsWithoutFreshness(shown, backend.profile, GOLDEN_SET.evaluatedAt);
  // Without the term they tie and id order decides (stale j33 first) — the
  // fixture pair is what makes the layer measurable.
  assert.equal(withoutFreshness[0]?.snapshot.id, "golden-j33");
  // With it, the fresh posting leads and the stale one still appears (demoted,
  // not dropped).
  assert.equal(withFreshness[0]?.snapshot.id, "golden-j34");
  assert.equal(withFreshness.length, 2);
  // The fresh listing's own score is untouched; only the stale one moves down,
  // so freshness can never lift anything above a better match.
  assert.equal(withFreshness[0]?.score, withoutFreshness[1]?.score);
  assert.ok((withFreshness[1]?.score ?? 0) < (withoutFreshness[0]?.score ?? 0));
  assert.equal(withFreshness[0]?.freshness, 0);
  assert.ok((withFreshness[1]?.freshness ?? 0) < 0);
});
