// Dense retrieval leg (design item B1).
//
// This is a RETRIEVAL leg, not a ranker: it turns a query vector and the
// already-gated candidates into a position list, the same currency the BM25 leg
// uses. Fusion into one order (RRF) is item B2, and the reranker on top of the
// fused list is B3 — keeping the leg free of fusion means B2 can be measured
// against exactly what B1 delivered.
//
// Fail-closed (decision §6.5, V4): if any candidate carries a vector from
// another artifact, another instruction revision or the wrong role, the leg
// returns NO order at all and reports the refusal. Ranking with a partially
// re-indexed catalog would compare two incompatible spaces and would look like a
// quality problem instead of a version problem.
//
// Absent is not wrong: a posting with no vector yet is reported as uncovered and
// keeps its place in the input order. That is the normal state while an index is
// being built, and the caller can see exactly which ids are not covered.
import {
  assertComparable, cosineSimilarity, EmbeddingVersionMismatchError,
  type EmbeddingVector,
} from "./embeddings.ts";

export type DenseCandidate = Readonly<{
  id: string;
  /** The stored document vector; null/undefined = not indexed yet. */
  embedding?: EmbeddingVector | null;
}>;

export type DenseRefusal = Readonly<{
  code: string;
  /** How many candidates carried the offending vector — a count, never content. */
  candidates: number;
}>;

export type DenseScored = Readonly<{ id: string; similarity: number }>;

export type DenseRanking = Readonly<{
  /** Positions, best first, over the covered candidates only. */
  ranked: readonly DenseScored[];
  /** Candidate ids the leg could not cover (no vector stored yet). */
  uncovered: readonly string[];
  /** Non-empty means the leg refused and `ranked` is empty. */
  refusals: readonly DenseRefusal[];
}>;

function refusalFrom(error: unknown, candidates: number): DenseRefusal {
  if (error instanceof EmbeddingVersionMismatchError) return { code: error.message, candidates };
  return { code: "EMBEDDING_LEG_FAILED", candidates };
}

/**
 * Order `candidates` by cosine similarity to `query`.
 *
 * Deterministic: ties break on id ascending, so two runs over the same inputs
 * produce byte-identical output (the A1 harness compares two runs).
 */
export function denseRetrieve(
  query: EmbeddingVector,
  candidates: readonly DenseCandidate[],
  limit?: number,
): DenseRanking {
  const covered = candidates.filter(
    (candidate): candidate is DenseCandidate & { embedding: EmbeddingVector } =>
      candidate.embedding !== null && candidate.embedding !== undefined,
  );
  const uncovered = candidates
    .filter(candidate => candidate.embedding === null || candidate.embedding === undefined)
    .map(candidate => candidate.id);

  try {
    assertComparable(query, covered.map(candidate => candidate.embedding));
  } catch (error) {
    // One refusal disables the whole leg: see the header note.
    return { ranked: [], uncovered, refusals: [refusalFrom(error, covered.length)] };
  }

  const scored = covered
    .map(candidate => ({ id: candidate.id, similarity: cosineSimilarity(query, candidate.embedding) }))
    .sort((left, right) => {
      if (left.similarity !== right.similarity) return right.similarity - left.similarity;
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    });
  return {
    ranked: limit === undefined ? scored : scored.slice(0, Math.max(0, limit)),
    uncovered,
    refusals: [],
  };
}

/**
 * The compact line an operator reads: counts only. Ids and similarities of a
 * profile's own query are user data; a refusal code is not.
 */
export function describeDenseRanking(ranking: DenseRanking): string {
  const refused = ranking.refusals.map(refusal => refusal.code).join(",");
  return `dense: ranked=${ranking.ranked.length} uncovered=${ranking.uncovered.length}`
    + (refused.length > 0 ? ` refused=${refused}` : "");
}
