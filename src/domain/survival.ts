// Survival/urgency proxy, phase 1 (design item B6).
//
// The research point (part 2 B3): a job posting has a hazard curve — most
// disappear within the first weeks, and the ones that survive for months tend to
// be evergreen, not "about to close". The curve is what gives both signals the
// research asks for: "act while it is fresh" and "this has been hanging for a
// long time" — and the product may only ever show coarse buckets, never a
// countdown ("осталось N дней" is forbidden copy: nobody knows that number).
//
// Phase 1 is a PROXY, and this is the honest part of it: the local catalog has
// ZERO observed disappearances (700 records, all `active`, closure_checks empty,
// every record first seen ≈ 9.3 days before 2026-10-04), so a curve cannot be
// fitted. What this module delivers is the STRUCTURE — window, buckets, honest
// copy, and the no-double-counting boundary — with PROVISIONAL constants;
// re-fitting them when closures accumulate is a change of numbers, not a
// redesign (the task file carries the data inventory and the re-fit trigger).
//
// How the three time-ish layers divide the facts (no fact counted twice):
//   * A5 freshness (freshness.ts): smooth demotion by observed age — "it is old".
//   * B6 urgency (here): the hazard WINDOW — extra demotion around the weeks in
//     which postings actually disappear; zero outside it. Long-lived postings
//     get no extra demotion (evergreen per the research) and no RELIEF either:
//     a boost for being old is exactly the shape A5 measured to be harmful —
//     it promoted a stale listing above a better match for neighbouring
//     profiles (see the measurement block in freshness.ts).
//   * A10 ghost (ev-multipliers.ts): demotion when an availability check failed
//     — "we could not confirm it". That is evidence about a check, not about
//     age, and it stays there.
//
// The candidate-facing side is buckets and ONE soft note. The note never
// contains a number, never says "closes soon", never predicts: with a
// provisional curve any precision would be invented (the brief's V2 check).
// The verbatim strings are pinned by tests. Deterministic: age and signals in,
// value out — no clock, no database.

import { ghostNote, type ClosureSignal } from "./ev-multipliers.ts";
import { ageInDays } from "./freshness.ts";

export const SURVIVAL_VERSION = "survival-l1";

/**
 * PROVISIONAL constants — nothing to fit yet (see the header). The window shape
 * follows research part 2 B3: closures cluster in the weeks after posting, and
 * long-lived postings are mostly evergreen. The peak demotion sits on the same
 * scale as its neighbours (freshness max -15, ghost -20/-25) and is small
 * enough to move near-ties only.
 */
export const SURVIVAL_CONSTANTS = {
  /** Before this observed age the hazard window has not opened. */
  windowStartDays: 14,
  /** Hazard peak: the extra demotion is at its maximum here. */
  windowPeakDays: 45,
  /** After this age the posting is long-lived: no extra demotion at all. */
  windowEndDays: 90,
  /** Extra demotion at the peak (provisional, same scale as A5). */
  windowMaxDemotion: -6,
  /** Bucket boundary: "long in the catalog" for the candidate-facing caution. */
  longListedDays: 60,
} as const;

export type SurvivalBucket = "recent" | "weeks" | "long" | "unknown";

/**
 * Coarse, fact-only bucket of the OBSERVED age. `unknown` is its own bucket and
 * never folds into a neighbour: a missing timestamp is not "recent".
 */
export function survivalBucket(ageDays: number | null): SurvivalBucket {
  if (ageDays === null) return "unknown";
  if (ageDays < SURVIVAL_CONSTANTS.windowStartDays) return "recent";
  if (ageDays < SURVIVAL_CONSTANTS.longListedDays) return "weeks";
  return "long";
}

/**
 * Extra demotion for the hazard window (<= 0), rounded to whole points like the
 * other layers. Non-monotone on purpose: it rises to the peak and decays back to
 * zero — a posting that has survived for months is not "about to close".
 * `-0` is normalised, the same way freshness.ts normalises it.
 */
export function urgencyDemotion(ageDays: number | null): number {
  if (ageDays === null) return 0;
  const { windowStartDays, windowPeakDays, windowEndDays, windowMaxDemotion } = SURVIVAL_CONSTANTS;
  if (ageDays <= windowStartDays || ageDays >= windowEndDays) return 0;
  const ramp = ageDays <= windowPeakDays
    ? (ageDays - windowStartDays) / (windowPeakDays - windowStartDays)
    : (windowEndDays - ageDays) / (windowEndDays - windowPeakDays);
  return Math.round(windowMaxDemotion * ramp) || 0;
}

/** Verbatim copy; pinned by tests (the brief's V2 check). No digits, no promise. */
export const LONG_LISTED_NOTE = "Объявление давно в каталоге: возможно, уже неактуально";

/**
 * The one candidate-facing line both card surfaces use. The strongest fact
 * wins: a failed availability check (A10) outranks the age caution, and the age
 * caution exists only for the long-lived bucket. Weeks-old postings get no note
 * — A5's observed-date label already says when we found them, and there is
 * nothing more that can be honestly claimed.
 */
export function availabilityNoteFor(
  firstSeenAt: string | undefined,
  now: string,
  closure: ClosureSignal | null | undefined,
): string | null {
  const ghost = ghostNote(closure);
  if (ghost !== null) return ghost;
  if (firstSeenAt === undefined) return null;
  const age = ageInDays(firstSeenAt, now);
  if (age === null) return null;
  return survivalBucket(age) === "long" ? LONG_LISTED_NOTE : null;
}
