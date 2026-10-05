// EV multipliers, phase 1 (design item A10).
//
// The research point (part 2 B1/B3, arXiv:2106.01941): rank by EXPECTED value —
// relevance × p(the employer responds) × urgency — instead of by relevance alone,
// because a ranking that ignores those factors crowds every candidate into the
// same few postings. Phase 1 asks for fixed multipliers before any model exists.
//
// What phase 1 is here, and what it honestly is not:
//   * m_ghost — real and new. The closure checks (jobicy: two inactive HEAD
//     checks close a record) and the pipeline's own staleness mark are signals
//     about whether the posting is still alive. They were collected but never
//     reached ranking. A post whose existence we could not confirm is still
//     SHOWN (a single failed check is not proof, and the pipeline deliberately
//     refuses to close on one) but it sinks, and the candidate is told why.
//   * m_urgency — NOT re-implemented here. Age is already a measured demotion
//     (item A5, numbers in its task file), and B6 landed the hazard-window
//     structure in src/domain/survival.ts (survival-l1) instead of a second
//     copy of the same fact here. This module carries only the ghost evidence;
//     the "urgency" slot is A5 + B6, each with its own fixture.
//
// Bounded, like every other layer: the demotion is a fixed, documented constant
// small enough that a suspected posting sinks below an equally relevant live one
// and never leaves the feed or flips a gate.
//
// Deterministic: the signal is data, the weights are constants, no clock.

export const EV_LAYER_VERSION = "ev1-ghost-demotion-urgency-is-A5-and-B6";

export const GHOST_WEIGHTS = {
  /**
   * One unconfirmed availability check: the record is still active in our store
   * (two failures are needed to close it), but we could not verify it. Chosen
   * below the eligible/unclear tier gap (30) so a suspected post sinks within its
   * tier rather than crossing it, and large enough to lose to an equally
   * relevant confirmed posting.
   */
  suspectedInactive: -20,
  /** The pipeline itself marked the record stale after missed full passes. */
  pipelineStale: -25,
} as const;

export type ClosureSignal = Readonly<{
  consecutiveInactive: number;
  lastResult: "active" | "inactive" | "unknown";
}>;

/**
 * Ghost demotion for one posting (<= 0). No signal, an active result or an
 * unknown outcome contribute nothing: unknown is not suspicion, and the guard
 * against false closures (unknown never closes) must not become a false
 * demotion either.
 */
export function ghostDemotion(signal: ClosureSignal | null | undefined): number {
  if (!signal) return 0;
  if (signal.lastResult !== "inactive") return 0;
  if (signal.consecutiveInactive >= 2) return GHOST_WEIGHTS.pipelineStale;
  if (signal.consecutiveInactive >= 1) return GHOST_WEIGHTS.suspectedInactive;
  return 0;
}

/**
 * Candidate-facing note, or null when there is nothing honest to say. Deliberately
 * vague about the cause ("possible"): one failed check is a suspicion, not a
 * verdict, and inventing a reason ("the employer removed it") would be a claim we
 * cannot support.
 */
export function ghostNote(signal: ClosureSignal | null | undefined): string | null {
  if (!signal || signal.lastResult !== "inactive" || signal.consecutiveInactive < 1) return null;
  return "Возможно неактивна: источник не подтвердил объявление";
}
