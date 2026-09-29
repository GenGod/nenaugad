// Per-request guardrails for ranker rollout (design item A9).
//
// The point of a guardrail is to catch a ranker that is wrong in ways the
// aggregate metrics of the A1 harness cannot see: it empties the feed, it lets a
// closed or duplicated posting into the top of the list, it reaches outside the
// approved sources, or it gets slow. Research (part 2 D7/D10) asks for exactly
// these checks ON REQUEST, not as an average over users, because at zero traffic
// there is no average to look at.
//
// Thresholds are project values, not measurements: the three hard ones are 0
// because the rules behind them are absolute (a closed posting, a duplicate and
// an unapproved source must never be delivered), while the empty share and the
// latency bound are set wide enough not to fire on an honest feed and tight
// enough to catch a broken one. They are constants with tests, so a regression
// fails the suite instead of being noticed by a candidate.
//
// Pure: samples in, verdict out — no database, no clock, no logging here.

export const GUARDRAIL_THRESHOLDS = {
  /** Share of requests whose feed is empty. An honest feed may be empty for one
   *  candidate (strict conditions); a ranker that empties feeds for half of them
   *  is broken. */
  maxEmptyShare: 0.5,
  /** Share of the top-10 that is closed at the source. */
  maxClosedInTop10Share: 0,
  /** Share of the top-10 that is another copy of a posting already shown. */
  maxDuplicateInTop10Share: 0,
  /** Share of the top-10 from a source that is not approved and enabled. */
  maxUnapprovedSourceShare: 0,
  /** p95 of the ranking latency over the sampled requests. */
  maxP95LatencyMs: 250,
} as const;

export type RankedRequestItem = Readonly<{
  id: string;
  /** The posting is no longer active at the source. */
  closed: boolean;
  /** Another record in the same feed is the same posting (A4 would have merged it). */
  duplicate: boolean;
  /** The source is approved, enabled and unexpired right now. */
  approvedSource: boolean;
}>;

export type RankedRequestSample = Readonly<{
  /**
   * Postings the ranker was GIVEN to order. 0 means there was nothing to rank
   * (an empty pool, or a personal filter like the seen-set legitimately emptied
   * the feed) — that is not the ranker's doing and never counts as an emptied
   * feed. The share that matters is "had items, delivered none".
   */
  poolSize: number;
  /** The ranked list, best first. */
  ranked: readonly RankedRequestItem[];
  latencyMs: number;
}>;

export type GuardrailReport = Readonly<{
  requests: number;
  emptyShare: number;
  maxClosedInTop10Share: number;
  maxDuplicateInTop10Share: number;
  maxUnapprovedSourceShare: number;
  p95LatencyMs: number;
  /** The metrics that crossed their threshold, with the observed value. */
  violations: readonly Readonly<{ metric: string; value: number; limit: number }>[];
  pass: boolean;
}>;

const TOP_K = 10;

function shareInTop(items: readonly RankedRequestItem[], predicate: (item: RankedRequestItem) => boolean): number {
  const top = items.slice(0, TOP_K);
  if (top.length === 0) return 0;
  return top.filter(predicate).length / top.length;
}

/** Nearest-rank p95: no interpolation games on small samples. */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function evaluateGuardrails(
  samples: readonly RankedRequestSample[],
  thresholds: typeof GUARDRAIL_THRESHOLDS = GUARDRAIL_THRESHOLDS,
): GuardrailReport {
  const requests = samples.length;
  // Empty share counts only requests where the ranker HAD something to order: a
  // request with an empty pool is an honest "nothing available", not an emptied
  // feed.
  const rankable = samples.filter(sample => sample.poolSize > 0);
  const emptyShare = rankable.length === 0
    ? 0
    : rankable.filter(sample => sample.ranked.length === 0).length / rankable.length;
  const values = {
    emptyShare,
    maxClosedInTop10Share: Math.max(0, ...samples.map(sample => shareInTop(sample.ranked, item => item.closed))),
    maxDuplicateInTop10Share: Math.max(0, ...samples.map(sample => shareInTop(sample.ranked, item => item.duplicate))),
    maxUnapprovedSourceShare: Math.max(0, ...samples.map(sample => shareInTop(sample.ranked, item => !item.approvedSource))),
    p95LatencyMs: percentile(samples.map(sample => sample.latencyMs), 0.95),
  };
  const violations: { metric: string; value: number; limit: number }[] = [];
  for (const [metric, limit] of Object.entries({
    emptyShare: thresholds.maxEmptyShare,
    maxClosedInTop10Share: thresholds.maxClosedInTop10Share,
    maxDuplicateInTop10Share: thresholds.maxDuplicateInTop10Share,
    maxUnapprovedSourceShare: thresholds.maxUnapprovedSourceShare,
    p95LatencyMs: thresholds.maxP95LatencyMs,
  })) {
    const value = values[metric as keyof typeof values];
    if (value > limit) violations.push({ metric, value, limit });
  }
  return {
    requests,
    ...values,
    violations,
    pass: violations.length === 0,
  };
}
