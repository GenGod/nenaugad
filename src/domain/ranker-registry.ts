// Ranker registry (design item A9).
//
// Every ranker the pipeline knows about is addressable by a stable id, so a
// shadow run can name its champion and its candidate, and so a switch (B23) was
// a change of one id rather than a rewrite of the read path.
//
// Since the owner's decision No 4 (B23, 2026-10-02) the champion in production
// IS a registered ranker — RANKER_VERSION, applied by the matching service.
// FEED_DEFAULT_ORDER_ID stays as the catalog baseline the measurements compare
// against, not as something candidates receive.
import {
  RANKER_VERSION, rankJobs, rankJobsBaselineV0, rankJobsWithoutFreshness, rankJobsWithoutRequirements,
  type RankableJob, type RankedJob, type RankerPreferences,
} from "./match-ranker.ts";
import type { ManualProfileInput } from "./profile.ts";

/**
 * A ranker as the registry knows it: every version takes the same inputs and
 * returns the same shape, and the preference signal (item A6) is optional so an
 * older version keeps working unchanged.
 */
export type RegistryRanker = (
  jobs: readonly RankableJob[],
  profile: ManualProfileInput,
  now: string,
  preferences?: RankerPreferences,
) => readonly RankedJob[];

export type RegisteredRanker = Readonly<{
  id: string;
  description: string;
  rank: RegistryRanker;
}>;

/** The plain catalog order: the measurement baseline since B23, no longer what candidates get. */
export const FEED_DEFAULT_ORDER_ID = "feed-default-order";

export const REGISTERED_RANKERS: readonly RegisteredRanker[] = [
  {
    id: FEED_DEFAULT_ORDER_ID,
    description: "Not a ranker: the catalog order as delivered (measurement baseline since B23).",
    rank: (jobs) => jobs.map(job => ({ ...job, score: 0, freshness: 0, preference: 0, ghost: 0 })),
  },
  {
    id: "v0-status-skills-role",
    description: "The A1 baseline: gate status, dictionary skills, role in title.",
    rank: rankJobsBaselineV0,
  },
  {
    id: "v1-plus-requirements",
    description: "A2's layer: requirements on, freshness not yet.",
    rank: rankJobsWithoutFreshness,
  },
  {
    id: "v0-plus-freshness",
    description: "A5's control: freshness on, requirements off (kept for measurement).",
    rank: rankJobsWithoutRequirements,
  },
  {
    id: RANKER_VERSION,
    description: "Current: A2 requirements, A5 freshness, A6 preference demotion.",
    rank: rankJobs,
  },
];

export function rankerById(id: string): RegisteredRanker | null {
  return REGISTERED_RANKERS.find(ranker => ranker.id === id) ?? null;
}
