// Shadow ranking service (design item A9).
//
// Runs rankers over the SAME inputs the live feed just produced and reports what
// would change, without touching the feed itself. Since the owner's decision
// No 4 (B23, 2026-10-02) the feed IS the shipped ranker, so the champion is the
// shipped version and there is no candidate to diff against until the next
// ranker version is registered — the run then keeps the per-request guardrails
// and logs counts only. Two properties matter and both are testable:
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
import { rankerById } from "../domain/ranker-registry.ts";
import { RANKER_VERSION, type RankableJob, type RankerPreferences } from "../domain/match-ranker.ts";
import type { ManualProfileInput } from "../domain/profile.ts";

export type RankerShadowReport = Readonly<{
  /** Null while no candidate ranker is registered: since B23 the feed itself is
   *  the ranker, so there is nothing to diff against — the guardrails still run. */
  diff: RankerShadowDiff | null;
  guardrails: GuardrailReport;
  championId: string;
  candidateId: string | null;
  /** The candidate's order (ids only) — returned so tests can assert the feed was
   *  produced by the champion, not by this. Empty when there is no candidate. */
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
  // The shipped order is the champion since B23; a candidate is optional and
  // absent until the next ranker version is registered.
  const championId = request.championId ?? RANKER_VERSION;
  const champion = rankerById(championId);
  if (!champion) throw new Error(`UNKNOWN_RANKER: ${championId}`);
  const started = Date.now();
  const championOrder = champion.rank(request.jobs, request.profile, request.now, request.preferences ?? {});
  const candidateId = request.candidateId ?? null;
  if (candidateId === null) {
    const latencyMs = request.latencyMs ?? Date.now() - started;
    const sample: RankedRequestSample = { poolSize: request.poolSize, ranked: request.items, latencyMs };
    return {
      diff: null,
      guardrails: evaluateGuardrails([sample], GUARDRAIL_THRESHOLDS),
      championId, candidateId: null, candidateIds: [],
    };
  }
  const candidate = rankerById(candidateId);
  if (!candidate) throw new Error(`UNKNOWN_RANKER: ${candidateId}`);
  const candidateOrder = candidate.rank(request.jobs, request.profile, request.now, request.preferences ?? {});
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
 * Counts only: an operator reads this to see how far a candidate ranker is from
 * what candidates get, and whether it broke a hard rule. Logging ids or profile
 * fields here would put private data into logs for no operational gain. With the
 * feed itself being the ranker (B23) and no candidate registered, the line says
 * so plainly (`candidate: null`, nothing compared).
 */
export function logRankerShadow(report: RankerShadowReport): void {
  console.log(JSON.stringify({
    code: "RANKER_SHADOW",
    champion: report.diff?.championId ?? report.championId,
    candidate: report.diff?.candidateId ?? null,
    compared: report.diff?.compared ?? 0,
    moved: report.diff?.moved ?? 0,
    top10Changed: report.diff?.top10Changed ?? 0,
    maxShift: report.diff?.maxShift ?? 0,
    guardrailsPass: report.guardrails.pass,
    violations: report.guardrails.violations.map(violation => violation.metric),
  }));
}
