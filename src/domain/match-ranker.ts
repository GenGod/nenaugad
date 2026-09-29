// Baseline ranker for the matching golden-set harness (design items A1, A2).
//
// v1 = v0 (gate status, matched dictionary skills, target role in the title)
//      + one term from the requirement decomposition in src/domain/requirements.ts.
//
// Why the requirement term is deliberately asymmetric (measured, not assumed):
//   * an uncovered must-have (-15) is NEW information — pure skill-overlap
//     counting cannot see a stated demand that the profile cannot evidence;
//   * a covered must-have gets no bonus: the skill is in the posting, so
//     perMatchedSkill already counted it, and rewarding it again was measured
//     on 2026-09-29 to amplify keyword-stuffed postings (the recruiter trap
//     climbed to the top of the data profile);
//   * the penalty stays smaller than eligibleStatus (+30) so it reorders within
//     a tier and never flips the gate ordering.
// Freshness (A5), EV multipliers (A10) and reranking (B3) extend this behind the
// same interface; the ratchets in tests/unit/matching-eval.test.ts keep the
// replacement honest.
//
// No clock, no randomness: the same inputs always produce the same order.
// Requirements are re-derived per call today (fine at catalog scale); a cache
// belongs to the item that wires ranking into the product read path (A10).
import { assessSnapshotRequirements, REQUIREMENT_LAYER_VERSION } from "./requirements.ts";
import { extractSkills, skillOverlap } from "./skills.ts";
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export const RANKER_VERSION = "v1-status-skills-role-uncovered-must";

export const RANKER_WEIGHTS = {
  eligibleStatus: 30,
  perMatchedSkill: 10,
  targetRoleInTitle: 15,
  mustRequirementUncovered: -15,
} as const;

export type RankableJob = Readonly<{
  snapshot: JobSnapshot;
  status: "eligible" | "needs_review";
}>;

export type RankedJob = RankableJob & Readonly<{ score: number }>;

function scoreJob(job: RankableJob, profile: ManualProfileInput, useRequirements: boolean): number {
  const jobSkills = extractSkills(`${job.snapshot.title} ${job.snapshot.description_text}`);
  const { matched } = skillOverlap(profile.skills, jobSkills);
  const title = job.snapshot.title.toLowerCase();
  const roleInTitle = profile.targetRoles.some(role => title.includes(role.toLowerCase()));
  let score = (job.status === "eligible" ? RANKER_WEIGHTS.eligibleStatus : 0)
    + matched.length * RANKER_WEIGHTS.perMatchedSkill
    + (roleInTitle ? RANKER_WEIGHTS.targetRoleInTitle : 0);
  if (useRequirements) {
    // Only the uncovered must-have term moves the score (see the header note):
    // presence is already counted by the overlap term above.
    const assessment = assessSnapshotRequirements(job.snapshot, profile);
    score += assessment.mustUncovered * RANKER_WEIGHTS.mustRequirementUncovered;
  }
  return score;
}

function orderByScore(jobs: readonly RankableJob[], profile: ManualProfileInput, useRequirements: boolean): readonly RankedJob[] {
  return jobs
    .map(job => ({ ...job, score: scoreJob(job, profile, useRequirements) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.snapshot.id === b.snapshot.id) return 0;
      return a.snapshot.id < b.snapshot.id ? -1 : 1;
    });
}

/** Product/eval ranking: requirements included. */
export function rankJobs(jobs: readonly RankableJob[], profile: ManualProfileInput): readonly RankedJob[] {
  return orderByScore(jobs, profile, true);
}

/**
 * The A1 baseline made callable: identical ordering logic with the requirement
 * terms switched off. It exists so the harness can prove, on the same fixtures,
 * that the requirement layer earns its place (see the relative ratchet test) —
 * not as a product path.
 */
export function rankJobsBaselineV0(jobs: readonly RankableJob[], profile: ManualProfileInput): readonly RankedJob[] {
  return orderByScore(jobs, profile, false);
}

export const RANKER_VERSIONS = {
  current: RANKER_VERSION,
  baselineWithoutRequirements: "v0-equivalent-status-skills-role",
  requirementLayer: REQUIREMENT_LAYER_VERSION,
} as const;
