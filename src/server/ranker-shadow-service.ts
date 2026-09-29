// Shadow ranking service (design item A9).
//
// Runs the ranker over the SAME inputs the live feed just produced and reports
// what would change, without touching the feed itself. Two properties matter and
// both are testable:
//   * the champion order is returned, not the candidate's — the product cannot be
//     reordered by a shadow run (and if the candidate throws, the caller catches
//     it: a shadow must never break a candidate's feed);
//   * the logged line carries counts only — no posting ids, no profile fields.
//
// Cost is bounded: the ranking runs over the postings of one feed (tens of items),
// which is the same order of work the gate evaluation already did.
import {
  GUARDRAIL_THRESHOLDS, evaluateGuardrails, type GuardrailReport, type RankedRequestItem,
  type RankedRequestSample,
} from "../domain/rank-guardrails.ts";
import { shadowDiff, type RankerShadowDiff } from "../domain/ranker-shadow.ts";
import { FEED_DEFAULT_ORDER_ID, rankerById } from "../domain/ranker-registry.ts";
import { RANKER_VERSION, type RankableJob, type RankerPreferences } from "../domain/match-ranker.ts";
import type { ManualProfileInput } from "../domain/profile.ts";

export type RankerShadowReport = Readonly<{
  diff: RankerShadowDiff;
  guardrails: GuardrailReport;
  championId: string;
  candidateId: string;
  /** The candidate's order (ids only) — returned so tests can assert the feed was
   *  produced by the champion, not by this. */
  candidateIds: readonly string[];
}>;

export type ShadowRequest = Readonly<{
  jobs: readonly RankableJob[];
  /** Flags per posting for the guardrails (closed, duplicate, approved source). */
  items: readonly RankedRequestItem[];
  profile: ManualProfileInput;
  now: string;
  /** How many postings the request had to choose from. */
  poolSize: number;
  preferences?: RankerPreferences;
  championId?: string;
  candidateId?: string;
  /** Ranking latency observed by the caller, if it measured one. */
  latencyMs?: number;
}>;

export function computeRankerShadow(request: ShadowRequest): RankerShadowReport {
  const championId = request.championId ?? FEED_DEFAULT_ORDER_ID;
  const candidateId = request.candidateId ?? RANKER_VERSION;
  const champion = rankerById(championId);
  const candidate = rankerById(candidateId);
  if (!champion) throw new Error(`UNKNOWN_RANKER: ${championId}`);
  if (!candidate) throw new Error(`UNKNOWN_RANKER: ${candidateId}`);
  const started = Date.now();
  const candidateOrder = candidate.rank(request.jobs, request.profile, request.now, request.preferences ?? {});
  const championOrder = champion.rank(request.jobs, request.profile, request.now, request.preferences ?? {});
  const latencyMs = request.latencyMs ?? Date.now() - started;
  const candidateIds = candidateOrder.map(entry => entry.snapshot.id);
  const sample: RankedRequestSample = { poolSize: request.poolSize, ranked: request.items, latencyMs };
  return {
    diff: shadowDiff(championId, championOrder.map(entry => entry.snapshot.id), candidateId, candidateIds),
    guardrails: evaluateGuardrails([sample], GUARDRAIL_THRESHOLDS),
    championId,
    candidateId,
    candidateIds,
  };
}

/**
 * Counts only: an operator reads this to see how far the candidate ranker is from
 * what candidates get, and whether it broke a hard rule. Logging ids or profile
 * fields here would put private data into logs for no operational gain.
 */
export function logRankerShadow(report: RankerShadowReport): void {
  console.log(JSON.stringify({
    code: "RANKER_SHADOW",
    champion: report.diff.championId,
    candidate: report.diff.candidateId,
    compared: report.diff.compared,
    moved: report.diff.moved,
    top10Changed: report.diff.top10Changed,
    maxShift: report.diff.maxShift,
    guardrailsPass: report.guardrails.pass,
    violations: report.guardrails.violations.map(violation => violation.metric),
  }));
}
