// Baseline ranker for the matching golden-set harness (design items A1, A2, A5, A6, A10).
//
// Layer stack, each one measurable on its own (see the ratchet tests):
//   base      — gate status, matched dictionary skills, target role in the title
//   + A2      — penalty for a must-have requirement the profile cannot evidence
//   + A5      — freshness of the listing (src/domain/freshness.ts)
//   + A6      — demotion around postings the candidate hid (negative-preference.ts)
//   + A10     — ghost demotion from closure signals (ev-multipliers.ts)
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
import { assessSnapshotRequirements } from "./requirements.ts";
import { FRESHNESS_MAX_DEMOTION, freshnessDemotion } from "./freshness.ts";
import { preferenceDemotion, type DislikedPosting } from "./negative-preference.ts";
import { ghostDemotion, type ClosureSignal } from "./ev-multipliers.ts";
import { extractSkills, skillOverlap } from "./skills.ts";
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export const RANKER_VERSION = "v4-status-skills-role-must-stale-preference-ghost";

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
  /**
   * Availability signal from the closure checks (item A10). Undefined = no check
   * has run, which is not suspicion.
   */
  closure?: ClosureSignal | null;
}>;

export type RankedJob = RankableJob & Readonly<{
  score: number;
  /** Freshness points (0 or negative); reported for transparency. */
  freshness: number;
  /** Demotion around hidden postings (0 or negative); reported for transparency. */
  preference: number;
  /** Ghost demotion from closure signals (0 or negative); reported for transparency. */
  ghost: number;
}>;

/** What the caller knows about this candidate's stated dislikes (item A6). */
export type RankerPreferences = Readonly<{
  /** Postings the candidate hid: their neighbourhood is demoted, never hidden. */
  disliked?: readonly DislikedPosting[];
}>;

export type Ranker = (
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
) => readonly RankedJob[];

type LayerOptions = Readonly<{ requirements: boolean; freshness: boolean; ghost: boolean }>;

/**
 * Whole-word role matching (docs/OPEN_GAPS.md B6). Substring matching both
 * missed real roles and fired inside longer words: "frontend developer" never
 * matched "Senior Frontend Engineer (React)", while "data engineer" matched
 * "Data Engineering Manager". Role words are compared whole; one synonymy is
 * documented: developer/engineer/programmer name the same job head. A title
 * carrying a different framework (Angular vs React) still matches the role —
 * that distinction is the skills layer's job, not a word rule's.
 */
const ROLE_WORD_CANONICAL: Readonly<Record<string, string>> = {
  developer: "engineer", developers: "engineer",
  programmer: "engineer", programmers: "engineer",
};

function canonicalWords(text: string): readonly string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}+#]+/u).filter(Boolean)
    .map(word => ROLE_WORD_CANONICAL[word] ?? word);
}

function containsRole(title: string, role: string): boolean {
  const titleWords = new Set(canonicalWords(title));
  return canonicalWords(role).every(word => titleWords.has(word));
}

function scoreJob(
  job: RankableJob,
  profile: ManualProfileInput,
  layers: LayerOptions,
  now: string,
  preference: number,
  ghost: number,
): number {
  const jobSkills = extractSkills(`${job.snapshot.title} ${job.snapshot.description_text}`);
  const { matched } = skillOverlap(profile.skills, jobSkills);
  const roleInTitle = profile.targetRoles.some(role => containsRole(job.snapshot.title, role));
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
  // Also demotion only: hiding a posting lowers its neighbours, never the rest —
  // the layer's worst case is the neighbour's own position.
  // The ghost layer (A10) works the same way: a posting we could not confirm
  // sinks, it is never removed and never lifted.
  return score + preference + ghost;
}

function orderByScore(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  layers: LayerOptions,
  now: string,
  preferences: RankerPreferences,
): readonly RankedJob[] {
  const disliked = preferences.disliked ?? [];
  return jobs
    .map(job => {
      const freshness = layers.freshness ? freshnessDemotion(job.firstSeenAt, now) : 0;
      const preference = preferenceDemotion(job.snapshot, disliked);
      const ghost = layers.ghost ? ghostDemotion(job.closure) : 0;
      return {
        ...job,
        score: scoreJob(job, profile, layers, now, preference, ghost),
        freshness,
        preference,
        ghost,
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.snapshot.id === b.snapshot.id) return 0;
      return a.snapshot.id < b.snapshot.id ? -1 : 1;
    });
}

/** Product/eval ranking: every layer on. Preferences default to none. */
export function rankJobs(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
  preferences: RankerPreferences = {},
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: true, freshness: true, ghost: true }, now, preferences);
}

/** Same ranker with the requirement terms off — the A2 ratchet's control. */
export function rankJobsWithoutRequirements(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: false, freshness: true, ghost: true }, now, {});
}

/** Same ranker with the freshness term off — the A5 ratchet's control. */
export function rankJobsWithoutFreshness(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: true, freshness: false, ghost: true }, now, {});
}

/** The A1 baseline: none of the later layers. Exists only for measurement. */
export function rankJobsBaselineV0(
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  _now: string,
): readonly RankedJob[] {
  return orderByScore(jobs, profile, { requirements: false, freshness: false, ghost: false }, _now, {});
}
