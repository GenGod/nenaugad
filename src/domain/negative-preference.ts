// Negative-preference weights v1 (design item A6, second part).
//
// The candidate hid a posting. That is one statement about ONE posting — not a
// licence to hide a company, a stack or an industry. Structural filters ("never
// show company X") need the owner's decision on hide-reason codes and stay out
// of this module; what a hide buys here is a bounded, explainable DEMOTION for
// postings that look like the one that was rejected: the same company, or the
// same stack.
//
// Why bounded, and why smaller than a tier: eligibility must not move (the A2
// lesson) and relevance stays dominant. The full demotion (-12) is below the
// eligible/unclear tier gap (30) and below an uncovered must-have (-15) on
// purpose, so a demoted posting sinks inside its tier and never leaves the feed.
// It is a weight, not a filter — "понижение — не скрытие".
//
// Why skills instead of categories: the skill dictionary resolves aliases to
// canonical names, while a category like "backend" would demote half the
// catalogue for one hidden posting. The threshold is high (4 shared canonical
// skills) and that is a MEASURED decision, not a taste one — see below.
//
// Measured on the golden set, 2026-09-29 (aggregate NDCG@10 0.916478 baseline,
// hide set = the two keyword-trap postings; the same numbers hold for the set of
// postings no profile judges relevant):
//   company only                    0.926224
//   company + stack (>= 2 shared)   0.919056   <- low threshold demotes RELEVANT postings
//   company + stack (>= 3 shared)   0.919417   <- still a loss on p-ru-ml
//   company + stack (>= 4 shared)   0.930164   <- best, no profile worsens
//   stack only (>= 3 shared)        0.916062   <- worse than no layer at all
//   stack only (>= 4 shared)        0.922670
// A single shared skill is noise ("JavaScript" is everywhere) and even two or
// three are not enough: a neighbour is only believable when nearly the whole
// stack matches. Hiding a highly relevant posting still costs NDCG against the
// relevance grades by construction — that is the candidate's own statement, not
// a ranking defect, and it is recorded as a control in the tests.
//
// Why no embeddings: the research asks for the neighbourhood and asks for the
// cheap version first. Company + dictionary skills need no model, no vector
// column and no new dependency; the embedding version (B1/B5) can replace this
// behind the same interface once it exists.
//
// Deterministic: same posting, same hidden set, same number — no clock, no
// database, no iteration-order dependence.
import { normalizeCompany } from "./dedup.ts";
import { extractSkills } from "./skills.ts";
import type { JobSnapshot } from "./source-contracts.ts";

export const NEGATIVE_PREFERENCE_VERSION = "v1-company-and-stack";

export const PREFERENCE_WEIGHTS = {
  /** Same employer (normalised, A4's legal-form stripping). */
  sameCompany: -12,
  /** Same stack (>= PREFERENCE_MIN_SHARED_SKILLS canonical skills in common). */
  sharedStack: -6,
  /** The floor: one hidden posting can never cost more than this. */
  maxDemotion: -12,
} as const;

export const PREFERENCE_MIN_SHARED_SKILLS = 4;

/** What a hidden posting contributes to the neighbourhood: company and stack. */
export type DislikedPosting = Readonly<{
  companyName: string;
  skills: readonly string[];
}>;

export function dislikedPosting(snapshot: JobSnapshot): DislikedPosting {
  return {
    companyName: snapshot.company_name,
    skills: extractSkills(`${snapshot.title} ${snapshot.description_text}`),
  };
}

/**
 * Demotion points for one posting (<= 0), given the postings this candidate hid.
 * The strongest single signal wins; signals do not accumulate, so hiding many
 * postings can never bury an unrelated one.
 */
export function preferenceDemotion(
  snapshot: JobSnapshot,
  disliked: readonly DislikedPosting[],
): number {
  if (disliked.length === 0) return 0;
  const company = normalizeCompany(snapshot.company_name);
  const skills = new Set(extractSkills(`${snapshot.title} ${snapshot.description_text}`));
  let strongest = 0;
  for (const posting of disliked) {
    const hiddenCompany = normalizeCompany(posting.companyName);
    // An empty normalised name matches nothing: a posting whose company we could
    // not read must not become "the same company" as every other such posting.
    const sameCompany = company.length > 0 && company === hiddenCompany;
    const shared = posting.skills.reduce((count, skill) => count + (skills.has(skill) ? 1 : 0), 0);
    const demotion = sameCompany
      ? PREFERENCE_WEIGHTS.sameCompany
      : shared >= PREFERENCE_MIN_SHARED_SKILLS ? PREFERENCE_WEIGHTS.sharedStack : 0;
    if (demotion < strongest) strongest = demotion;
  }
  return Math.max(strongest, PREFERENCE_WEIGHTS.maxDemotion);
}
