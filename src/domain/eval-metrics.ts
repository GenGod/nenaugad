// Ranking-quality metrics for the matching golden-set harness (design item A1).
//
// Formulas were checked 2026-09-27 against primary sources before this file
// was written (design brief docs/design/2026-09-27-matching-implementation-brief.md,
// protocol step V1):
//   * DCG / NDCG — exponential gain, positions are 1-based, the discount is
//     log2(i + 1), NDCG = DCG / IDCG:
//     https://en.wikipedia.org/wiki/Discounted_cumulative_gain
//   * MRR — reciprocal of the 1-based rank of the first relevant item, 0 when
//     nothing relevant was retrieved, averaged over queries:
//     https://en.wikipedia.org/wiki/Mean_reciprocal_rank
//   * Recall over the top-k retrieved set as a set measure:
//     https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-of-ranked-retrieval-results-1.html
//
// Every function is pure and deterministic. "Not applicable" is returned as
// null — a query with no judged relevance is excluded from the mean instead of
// being silently counted as 0. Missing data never becomes a number here.

export const RELEVANT_GRADE = 2;

export type MetricValue = number | null;

function assertCutoff(k: number): void {
  if (!Number.isInteger(k) || k < 1) throw new Error("INVALID_CUTOFF");
}

// DCG@k = sum over i = 1..k of (2^rel_i - 1) / log2(i + 1).
export function dcgAtK(rankedGrades: readonly number[], k: number): number {
  assertCutoff(k);
  let dcg = 0;
  const limit = Math.min(k, rankedGrades.length);
  for (let i = 0; i < limit; i += 1) {
    dcg += (2 ** (rankedGrades[i] ?? 0) - 1) / Math.log2(i + 2);
  }
  return dcg;
}

// NDCG@k = DCG@k / IDCG@k, where IDCG@k is the DCG@k of all judged grades in
// descending order. null when the ideal list carries no gain at all.
export function ndcgAtK(
  rankedGrades: readonly number[],
  judgedGrades: readonly number[],
  k: number,
): MetricValue {
  assertCutoff(k);
  const ideal = dcgAtK([...judgedGrades].sort((a, b) => b - a), k);
  if (ideal === 0) return null;
  return dcgAtK(rankedGrades, k) / ideal;
}

// Recall@k = |relevant ∩ top-k| / |relevant| over the judged, shown set.
export function recallAtK(
  rankedIds: readonly string[],
  relevantIds: ReadonlySet<string>,
  k: number,
): MetricValue {
  assertCutoff(k);
  if (relevantIds.size === 0) return null;
  let found = 0;
  const limit = Math.min(k, rankedIds.length);
  for (let i = 0; i < limit; i += 1) {
    const id = rankedIds[i];
    if (id !== undefined && relevantIds.has(id)) found += 1;
  }
  return found / relevantIds.size;
}

// Reciprocal rank of the first relevant item; 0 when none of the ranked items
// is relevant; null when the query has no relevant item at all (excluded).
export function reciprocalRank(
  rankedIds: readonly string[],
  relevantIds: ReadonlySet<string>,
): MetricValue {
  if (relevantIds.size === 0) return null;
  for (let i = 0; i < rankedIds.length; i += 1) {
    const id = rankedIds[i];
    if (id !== undefined && relevantIds.has(id)) return 1 / (i + 1);
  }
  return 0;
}

// Mean over applicable (non-null) values plus the number of applicable
// profiles, so callers report coverage instead of hiding it.
export function meanOfApplicable(
  values: readonly MetricValue[],
): Readonly<{ mean: number; count: number }> {
  const applicable = values.filter((value): value is number => value !== null);
  if (applicable.length === 0) return { mean: 0, count: 0 };
  return {
    mean: applicable.reduce((sum, value) => sum + value, 0) / applicable.length,
    count: applicable.length,
  };
}
