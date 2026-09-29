// Baseline ranker for the matching golden-set harness (design items A1, A2, A5).
//
// Layer stack, each one measurable on its own (see the ratchet tests):
//   base      — gate status, matched dictionary skills, target role in the title
//   + A2      — penalty for a must-have requirement the profile cannot evidence
//   + A5      — freshness of the listing (src/domain/freshness.ts)
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
//
// Freshness (A5) is a DEMOTION for stale listings, never a boost: measured on
// 2026-09-29, both a positive boost and a pure tie-break promoted fresh but
// irrelevant listings above relevant ones for neighbouring profiles (devops
// NDCG@10 0.995 -> 0.992, ml 0.853 -> 0.846 / 0.849). Demotion can only push a
// stale listing down, so relevance stays dominant and the layer's worst case is
// bounded by the stale listing's own position.
//
// EV multipliers (A10) and reranking (B3) extend this behind the same interface.
//
// Determinism: `now` is always passed in, never read from the clock, so the same
// inputs and the same reference time produce the same order.
import { assessSnapshotRequirements, REQUIREMENT_LAYER_VERSION } from "./requirements.ts";
import { FRESHNESS_MAX_DEMOTION, freshnessDemotion } from "./freshness.ts";
import { extractSkills, skillOverlap } from "./skills.ts";
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export const RANKER_VERSION = "v2-status-skills-role-must-stale-demotion";

export const RANKER_WEIGHTS = {
  eligibleStatus: 30,
  perMatchedSkill: 10,
  targetRoleInTitle: 15,
  mustRequirementUncovered: -15,
  freshnessMaxDemotion: FRESHNESS_MAX_DEMOTION,
} as const;

export type RankableJob = Readonly<{
  snapshot: JobSnapshot;
  status: "eligible" | "needs_review";
  /** When our pipeline first saw the posting. Undefined = unknown age, no boost. */
  firstSeenAt?: string;
}>;

export type RankedJob = RankableJob & Readonly<{
  score: number;
  /** Freshness points (0 or negative); reported for transparency. */
  freshness: number;
}>;

export type Ranker = (
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
) => readonly RankedJob[];

type LayerOptions = Readonly<{ requirements: boolean; freshness: boolean }>;

function scoreJob(
  job: RankableJob,
  profile: ManualProfileInput,
  layers: LayerOptions,
  now: string,
): number {
  const jobSkills = extractSkills(`${job.snapshot.title} ${job.snapshot.description_text}`);
  const { matched } = skillOverlap(profile.skills, jobSkills);
  const title = job.snapshot.title.toLowerCase();
  const roleInTitle = profile.targetRoles.some(role => title.includes(role.toLowerCase()));
  let score = (job.status === "eligible" ? RANKER_WEIGHTS.eligibleStatus : 0)
    + matched.length * RANKER_WEIGHTS.perMatchedSkill
    + (roleInTitle ? RANKER_WEIGHTS.targetRoleInTitle : 0);
  if (layers.requirements) {
    // Only the uncovered must-have term moves the score (see the header note):
    // presence is already counted by the overlap term above.
    const assessment = assessSnapshotRequirements(job.snapshot, profile);
    score += assessment.mustUncovered * RANKER_WEIGHTS.mustRequirementUncovered;
  }
  if (layers.freshness) {
    // Demotion only (see the header note): stale listings move down, nothing is
    // ever lifted above a better match by being new.
    score += freshnessDemotion(job.firstSeenAt, now);
  }
  return score;
}

function orderByScore(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  layers: LayerOptions,
  now: string,
): readonly RankedJob[] {
  return jobs
    .map(job => ({
      ...job,
      score: scoreJob(job, profile, layers, now),
      freshness: layers.freshness ? freshnessDemotion(job.firstSeenAt, now) : 0,
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.snapshot.id === b.snapshot.id) return 0;
      return a.snapshot.id < b.snapshot.id ? -1 : 1;
    });
}

/** Product/eval ranking: every layer on. */
export function rankJobs(
  jobs: readonly RankableJob[], profile: ManualProfileInput, now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: true, freshness: true }, now);
}

/** Same ranker with the requirement terms off — the A2 ratchet's control. */
export function rankJobsWithoutRequirements(
  jobs: readonly RankableJob[], profile: ManualProfileInput, now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: false, freshness: true }, now);
}

/** Same ranker with the freshness term off — the A5 ratchet's control. */
export function rankJobsWithoutFreshness(
  jobs: readonly RankableJob[], profile: ManualProfileInput, now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: true, freshness: false }, now);
}

/** The A1 baseline: none of the later layers. Exists only for measurement. */
export function rankJobsBaselineV0(
  jobs: readonly RankableJob[], profile: ManualProfileInput, _now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: false, freshness: false }, _now);
}

export const RANKER_VERSIONS = {
  current: RANKER_VERSION,
  baselineWithoutRequirements: "v1-equivalent-status-skills-role-uncovered-must",
  baselineWithoutFreshness: "v1-requirements-on",
  requirementLayer: REQUIREMENT_LAYER_VERSION,
} as const;
