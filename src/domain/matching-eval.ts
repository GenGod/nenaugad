// Golden-set evaluation runner for the matching pipeline (design item A1).
//
// It answers one question with numbers: how well does the current pipeline
// order the jobs it is willing to show, judged against hand-written relevance
// grades? The gates (src/domain/matching.ts) decide WHAT is shown; the ranker
// (src/domain/match-ranker.ts) decides the ORDER. The two are measured
// separately on purpose:
//   * ranking quality — Recall@5/@10, NDCG@5/@10 and MRR over shown jobs;
//   * gate quality — "relevant but hidden" jobs (grade >= 2 that never reached
//     the candidate) must stay empty: by construction grades of 2-3 describe a
//     job the candidate should be able to see.
//
// Pure and deterministic: no database, no network, no clock. The golden set is
// passed in by the caller (src/data/matching-golden.ts), so domain code stays
// free of fixture imports.

import {
  RELEVANT_GRADE, meanOfApplicable, ndcgAtK, recallAtK, reciprocalRank,
  type MetricValue,
} from "./eval-metrics.ts";
import { RANKER_VERSION, rankJobs, type RankableJob, type RankedJob } from "./match-ranker.ts";
import { RULESET_VERSION, evaluateJob } from "./matching.ts";
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export type GoldenProfile = Readonly<{
  id: string;
  segment: string;
  profile: ManualProfileInput;
}>;

export type GoldenJob = Readonly<{
  snapshot: JobSnapshot;
  note: string;
  /**
   * When our pipeline first saw the posting (item A5). Optional on purpose:
   * fixtures without it exercise the "unknown age" path, and the freshness term
   * then contributes nothing.
   */
  firstSeenAt?: string;
}>;

export type GoldenJudgment = Readonly<{
  profileId: string;
  grades: Readonly<Record<string, number>>;
}>;

export type GoldenSet = Readonly<{
  id: string;
  version: number;
  gradesLegend: string;
  /** Fixed reference time: freshness and age labels are relative to it. */
  evaluatedAt: string;
  profiles: readonly GoldenProfile[];
  jobs: readonly GoldenJob[];
  judgments: readonly GoldenJudgment[];
}>;

export type ProfileEval = Readonly<{
  profileId: string;
  segment: string;
  shownIds: readonly string[];
  relevantShown: readonly string[];
  unjudgedShown: readonly string[];
  relevantHidden: readonly string[];
  recallAt5: MetricValue;
  recallAt10: MetricValue;
  ndcgAt5: MetricValue;
  ndcgAt10: MetricValue;
  mrr: MetricValue;
}>;

export type MatchingEvalReport = Readonly<{
  setId: string;
  setVersion: number;
  rulesetVersion: number;
  rankerVersion: string;
  evaluatedAt: string;
  gradesLegend: string;
  profiles: readonly ProfileEval[];
  aggregate: Readonly<{
    recallAt5: number;
    recallAt10: number;
    ndcgAt5: number;
    ndcgAt10: number;
    mrr: number;
    applicableProfiles: number;
  }>;
  guards: Readonly<{
    unjudgedShown: number;
    relevantHidden: number;
  }>;
}>;

export type Ranker = (
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
) => readonly RankedJob[];

function evaluateProfile(
  golden: GoldenProfile,
  jobs: readonly GoldenJob[],
  grades: Readonly<Record<string, number>>,
  ranker: Ranker,
  now: string,
): ProfileEval {
  const shown: RankableJob[] = [];
  const hiddenIds: string[] = [];
  for (const job of jobs) {
    // Same gate as the product (src/server/matching-service.ts): eligible jobs
    // and jobs that need review are the ones a candidate can see.
    const evaluation = evaluateJob(job.snapshot, golden.profile);
    if (evaluation.status === "eligible" || evaluation.status === "needs_review") {
      shown.push({ snapshot: job.snapshot, status: evaluation.status, firstSeenAt: job.firstSeenAt });
    } else {
      hiddenIds.push(job.snapshot.id);
    }
  }
  const ranked = ranker(shown, golden.profile, now);
  const shownIds = ranked.map(entry => entry.snapshot.id);
  const gradeOf = (id: string): number | undefined => grades[id];
  const judgedShown = shownIds.filter(id => gradeOf(id) !== undefined);
  const relevantShown = judgedShown.filter(id => (gradeOf(id) ?? 0) >= RELEVANT_GRADE);
  const relevantShownSet = new Set(relevantShown);
  const relevantHidden = hiddenIds.filter(id => (gradeOf(id) ?? 0) >= RELEVANT_GRADE);
  // Unjudged shown jobs count as grade 0 here so a fixture gap both fails the
  // guard and visibly costs NDCG instead of silently disappearing from the
  // numbers. IDCG is computed over judged shown jobs only: gate quality is the
  // relevantHidden guard's job, not NDCG's.
  const rankedGrades = shownIds.map(id => gradeOf(id) ?? 0);
  const judgedGrades = judgedShown.map(id => gradeOf(id) ?? 0);
  return {
    profileId: golden.id,
    segment: golden.segment,
    shownIds,
    relevantShown,
    unjudgedShown: shownIds.filter(id => grades[id] === undefined),
    relevantHidden,
    recallAt5: recallAtK(shownIds, relevantShownSet, 5),
    recallAt10: recallAtK(shownIds, relevantShownSet, 10),
    ndcgAt5: ndcgAtK(rankedGrades, judgedGrades, 5),
    ndcgAt10: ndcgAtK(rankedGrades, judgedGrades, 10),
    mrr: reciprocalRank(shownIds, relevantShownSet),
  };
}

export function runMatchingEval(set: GoldenSet, ranker: Ranker = rankJobs): MatchingEvalReport {
  const profiles = set.profiles.map(golden => {
    const grades = set.judgments.find(judgment => judgment.profileId === golden.id)?.grades ?? {};
    return evaluateProfile(golden, set.jobs, grades, ranker, set.evaluatedAt);
  });
  const ndcgAt10 = meanOfApplicable(profiles.map(profile => profile.ndcgAt10));
  return {
    setId: set.id,
    setVersion: set.version,
    rulesetVersion: RULESET_VERSION,
    rankerVersion: RANKER_VERSION,
    evaluatedAt: set.evaluatedAt,
    gradesLegend: set.gradesLegend,
    profiles,
    aggregate: {
      recallAt5: meanOfApplicable(profiles.map(profile => profile.recallAt5)).mean,
      recallAt10: meanOfApplicable(profiles.map(profile => profile.recallAt10)).mean,
      ndcgAt5: meanOfApplicable(profiles.map(profile => profile.ndcgAt5)).mean,
      ndcgAt10: ndcgAt10.mean,
      mrr: meanOfApplicable(profiles.map(profile => profile.mrr)).mean,
      applicableProfiles: ndcgAt10.count,
    },
    guards: {
      unjudgedShown: profiles.reduce((sum, profile) => sum + profile.unjudgedShown.length, 0),
      relevantHidden: profiles.reduce((sum, profile) => sum + profile.relevantHidden.length, 0),
    },
  };
}
