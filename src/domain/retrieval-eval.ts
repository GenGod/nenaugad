// Retrieval-leg measurement on the golden set (design item B2).
//
// The A1 harness measures a RANKER: one order per profile, scored end to end. A
// retrieval leg is a different object — it produces positions over the gate-passed
// pool and knows nothing about tiers, freshness or ghosts — so measuring it needs
// the gate to be applied first and the metrics to be read per leg. This module
// does exactly that and nothing else, using the same metric functions as A1 so the
// numbers are comparable with the ranker's.
//
// What it deliberately does NOT do: change the ratchet. The floors in
// tests/unit/matching-eval.test.ts guard the shipped ranker; a leg being better or
// worse than a floor is information for the switch decision (§6.4), not a new
// guarantee.
//
// Pure: the caller supplies the order, this file scores it. No model, no database,
// no clock.
import { ndcgAtK, meanOfApplicable, recallAtK, reciprocalRank, RELEVANT_GRADE, type MetricValue } from "./eval-metrics.ts";
import { evaluateJob } from "./matching.ts";
import type { GoldenSet } from "./matching-eval.ts";
import type { ManualProfileInput } from "./profile.ts";

export type RetrievalOrder = Readonly<{
  /** The leg's positions, best first. */
  ids: readonly string[];
  /** Ids the leg could not cover at all (no vector, no matched term). */
  uncovered: readonly string[];
}>;

export type RetrievalProfileMetrics = Readonly<{
  profileId: string;
  segment: string;
  shown: number;
  relevant: number;
  uncovered: number;
  recallAt5: MetricValue;
  recallAt10: MetricValue;
  ndcgAt5: MetricValue;
  ndcgAt10: MetricValue;
  mrr: MetricValue;
}>;

export type RetrievalReport = Readonly<{
  legId: string;
  setId: string;
  setVersion: number;
  evaluatedAt: string;
  profiles: readonly RetrievalProfileMetrics[];
  aggregate: Readonly<{
    recallAt5: number;
    recallAt10: number;
    ndcgAt5: number;
    ndcgAt10: number;
    mrr: number;
    applicableProfiles: number;
  }>;
}>;

/** The postings one profile may see, exactly as the A1 harness builds them. */
export function gatedPostingsFor(set: GoldenSet, profileIndex: number): readonly string[] {
  const golden = set.profiles[profileIndex];
  if (!golden) return [];
  return set.jobs
    .filter(job => {
      const evaluation = evaluateJob(job.snapshot, golden.profile);
      return evaluation.status === "eligible" || evaluation.status === "needs_review";
    })
    .map(job => job.snapshot.id);
}

export function measureRetrievalLeg(
  set: GoldenSet,
  legId: string,
  orderFor: (profile: ManualProfileInput, gatedIds: readonly string[], profileIndex: number) => RetrievalOrder,
): RetrievalReport {
  const gradesByProfile = new Map(set.judgments.map(judgment => [judgment.profileId, judgment.grades]));
  const profiles: RetrievalProfileMetrics[] = [];

  for (const [index, golden] of set.profiles.entries()) {
    const gatedIds = gatedPostingsFor(set, index);
    const grades = gradesByProfile.get(golden.id) ?? {};
    const relevant = new Set(gatedIds.filter(id => (grades[id] ?? 0) >= RELEVANT_GRADE));
    const order = orderFor(golden.profile, gatedIds, index);
    const rankedIds = order.ids;
    const rankedGrades = rankedIds.map(id => grades[id] ?? 0);
    const judgedGrades = gatedIds.map(id => grades[id] ?? 0);

    profiles.push({
      profileId: golden.id,
      segment: golden.segment,
      shown: gatedIds.length,
      relevant: relevant.size,
      uncovered: order.uncovered.length,
      recallAt5: recallAtK(rankedIds, relevant, 5),
      recallAt10: recallAtK(rankedIds, relevant, 10),
      ndcgAt5: ndcgAtK(rankedGrades, judgedGrades, 5),
      ndcgAt10: ndcgAtK(rankedGrades, judgedGrades, 10),
      mrr: reciprocalRank(rankedIds, relevant),
    });
  }

  const aggregate = {
    recallAt5: meanOfApplicable(profiles.map(profile => profile.recallAt5)),
    recallAt10: meanOfApplicable(profiles.map(profile => profile.recallAt10)),
    ndcgAt5: meanOfApplicable(profiles.map(profile => profile.ndcgAt5)),
    ndcgAt10: meanOfApplicable(profiles.map(profile => profile.ndcgAt10)),
    mrr: meanOfApplicable(profiles.map(profile => profile.mrr)),
  };

  return {
    legId,
    setId: set.id,
    setVersion: set.version,
    evaluatedAt: set.evaluatedAt,
    profiles,
    aggregate: {
      recallAt5: aggregate.recallAt5.mean,
      recallAt10: aggregate.recallAt10.mean,
      ndcgAt5: aggregate.ndcgAt5.mean,
      ndcgAt10: aggregate.ndcgAt10.mean,
      mrr: aggregate.mrr.mean,
      applicableProfiles: aggregate.recallAt5.count,
    },
  };
}

/**
 * How much the legs actually complement each other — the whole reason to fuse.
 * Counted over relevant postings only, per profile, then summed: a fusion cannot
 * be better than its legs unless each leg finds something the other misses.
 */
export type RetrievalComplementarity = Readonly<{
  relevantTotal: number;
  foundByAll: number;
  foundByFirstOnly: number;
  foundBySecondOnly: number;
  foundByNeither: number;
}>;

export function complementarity(
  set: GoldenSet,
  first: ReadonlyMap<string, ReadonlySet<string>>,
  second: ReadonlyMap<string, ReadonlySet<string>>,
): RetrievalComplementarity {
  let relevantTotal = 0;
  let foundByAll = 0;
  let foundByFirstOnly = 0;
  let foundBySecondOnly = 0;
  let foundByNeither = 0;
  for (const [index, golden] of set.profiles.entries()) {
    const grades = set.judgments.find(judgment => judgment.profileId === golden.id)?.grades ?? {};
    const relevant = gatedPostingsFor(set, index).filter(id => (grades[id] ?? 0) >= RELEVANT_GRADE);
    const firstTop = first.get(golden.id) ?? new Set<string>();
    const secondTop = second.get(golden.id) ?? new Set<string>();
    for (const id of relevant) {
      relevantTotal += 1;
      const inFirst = firstTop.has(id);
      const inSecond = secondTop.has(id);
      if (inFirst && inSecond) foundByAll += 1;
      else if (inFirst) foundByFirstOnly += 1;
      else if (inSecond) foundBySecondOnly += 1;
      else foundByNeither += 1;
    }
  }
  return { relevantTotal, foundByAll, foundByFirstOnly, foundBySecondOnly, foundByNeither };
}

/** The top-k of each leg, per profile — the input to the complementarity count. */
export function collectTopK(
  set: GoldenSet,
  orderFor: (profile: ManualProfileInput, gatedIds: readonly string[], profileIndex: number) => RetrievalOrder,
  k: number,
): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const [index, golden] of set.profiles.entries()) {
    const order = orderFor(golden.profile, gatedPostingsFor(set, index), index);
    result.set(golden.id, new Set(order.ids.slice(0, k)));
  }
  return result;
}
