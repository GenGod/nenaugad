// Reciprocal Rank Fusion (design item B2).
//
// Fuses position lists from independent retrieval legs into one order. Positions
// are the currency on purpose: the legs' scores are not comparable (a cosine in
// [-1, 1] and an unbounded BM25 score), and normalising them into a common scale
// would invent a conversion nobody measured. RRF only uses rank:
//
//   score(d) = Σ over legs of 1 / (k + rank_leg(d)), ranks 1-based
//
// Source: Cormack, Clarke, Buettcher, "Reciprocal Rank Fusion outperforms
// Condorcet and individual Rank Learning Methods" (SIGIR 2009), which uses
// k = 60. The brief records the same value; k is a project constant here and
// calibrating it on the A1 harness is part of B2's work, not a preference to be
// guessed at.
//
// A document that appears in no leg cannot appear in the fused list — there is no
// score to give it. A document that wins one leg is lifted above a document that
// is mediocre in all of them, which is the property the verification matrix in
// B2 checks.
//
// Deterministic: ties break on id ascending, so two runs over the same inputs
// produce byte-identical output (the A1 harness compares two runs).

export const RRF_VERSION = "rrf-l1";

/** The paper's value. Constant, and asserted by a test so a change is deliberate. */
export const RRF_K = 60;

export type RrfScored = Readonly<{
  id: string;
  score: number;
  /**
   * 1-based position in each leg, null when the leg did not return the document.
   * Kept because "which leg found it" is the whole explanation RRF has to offer.
   */
  positions: readonly (number | null)[];
}>;

export function reciprocalRankFusion(
  legs: readonly (readonly string[])[],
  options: Readonly<{ k?: number; weights?: readonly number[]; limit?: number }> = {},
): readonly RrfScored[] {
  const k = options.k ?? RRF_K;
  const weights = options.weights ?? legs.map(() => 1);
  if (weights.length !== legs.length) throw new Error("RRF_WEIGHTS_MISMATCH");
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) throw new Error("RRF_WEIGHT_INVALID");
  }
  const scores = new Map<string, { score: number; positions: (number | null)[] }>();
  legs.forEach((leg, legIndex) => {
    const weight = weights[legIndex] ?? 1;
    leg.forEach((id, index) => {
      const entry = scores.get(id) ?? { score: 0, positions: new Array<number | null>(legs.length).fill(null) };
      entry.score += weight / (k + index + 1);
      entry.positions[legIndex] = index + 1;
      scores.set(id, entry);
    });
  });

  const fused = [...scores.entries()]
    // A document whose total evidence is zero is not in the fused list: with a
    // zero weight it never earned a position, and returning it would put a posting
    // nobody retrieved into the retrieved set.
    .filter(([, entry]) => entry.score > 0)
    .map(([id, entry]) => ({ id, score: entry.score, positions: entry.positions }))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    });
  return options.limit === undefined ? fused : fused.slice(0, Math.max(0, options.limit));
}

/**
 * One line for an operator: how many documents each leg contributed and how many
 * the fusion kept. Counts only — no ids, no query text.
 */
export function describeFusion(legs: readonly (readonly string[])[], fused: readonly RrfScored[]): string {
  return `fusion: legs=${legs.map(leg => leg.length).join("/")} fused=${fused.length}`;
}
