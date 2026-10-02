// server-only guard removed: this module is imported by the standalone
// worker (scripts/worker.ts) which runs outside Next.js React context.
import type { Pool } from "pg";
import { readConfig } from "./config.ts";
import { latestProfile } from "./profile-service.ts";
import { hiddenSnapshotIds } from "./feedback-service.ts";
import { suppressedSnapshotIds } from "./seen-service.ts";
import { readSnapshotCardsData, snapshotPool } from "./storage/snapshots.ts";
import { getSourcePolicy } from "./source-policies.ts";
import { choosePrimary, groupDuplicates } from "../domain/dedup.ts";
import { classifySnapshot, policyPublishes, projectCard, type PolicyBoundRecord } from "../domain/snapshot-projection.ts";
import { evaluateJob, RULESET_VERSION, type JobEvaluation } from "../domain/matching.ts";
import { assessSnapshotRequirements, type RequirementAssessment } from "../domain/requirements.ts";
import { rankJobs, type RankableJob } from "../domain/match-ranker.ts";
import { dislikedPosting, type DislikedPosting } from "../domain/negative-preference.ts";
import type { ClosureSignal } from "../domain/ev-multipliers.ts";
import type { RankedRequestItem } from "../domain/rank-guardrails.ts";
import { computeRankerShadow, logRankerShadow, type ShadowRequest } from "./ranker-shadow-service.ts";

export type MatchedJob = Readonly<{
  card: ReturnType<typeof projectCard> & Readonly<{ excerpt: string }>;
  evaluation: JobEvaluation;
  /** Availability signal (item A10): shown as a candidate-facing note, and used by
   *  the ranker's ghost demotion. Null when no check has run. */
  closure: ClosureSignal | null;
  /** Structured requirements with per-requirement verdicts (item A2). B5 gives
   *  the computed data its consumer: the card's evidence block renders it. */
  requirements: RequirementAssessment;
}>;

export type MatchedResult = Readonly<{
  status: "ok" | "no_profile" | "fixture_backend";
  rulesetVersion: number;
  eligible: readonly MatchedJob[];
  needsReview: readonly MatchedJob[];
  notEvaluatedCount: number;
  /** Postings kept out of the feed as already seen and not acted on (item A6), per tab. */
  seenSuppressed: Readonly<{ eligible: number; needsReview: number }>;
}>;

/**
 * The candidate's feed. Both seams are injectable so a caller that owns a
 * different connection (tests, the worker) or wants to observe the shadow run
 * shares exactly this code path.
 */
export async function matchedForUser(
  userId: string,
  options: Readonly<{ pool?: Pool; shadow?: (request: ShadowRequest) => void }> = {},
): Promise<MatchedResult> {
  const empty: MatchedResult = {
    status: "ok", rulesetVersion: RULESET_VERSION, eligible: [], needsReview: [],
    notEvaluatedCount: 0, seenSuppressed: { eligible: 0, needsReview: 0 },
  };
  const config = readConfig(process.env);
  if (config.backend !== "postgres") {
    return { ...empty, status: "fixture_backend" };
  }
  const pool = options.pool ?? snapshotPool();
  const profile = await latestProfile(pool, userId);
  if (!profile) return { ...empty, status: "no_profile" };
  // One reference time for the whole read: policy windows and the seen-set
  // window must not disagree within a single render.
  const now = new Date().toISOString();
  // Personal hides (spec 4.3): hidden jobs leave matching for this user only.
  const hidden = await hiddenSnapshotIds(pool, userId);
  const eligible: MatchedJob[] = [];
  const needsReview: MatchedJob[] = [];
  let notEvaluated = 0;
  let seenSuppressedEligible = 0;
  let seenSuppressedNeedsReview = 0;
  // Shadow inputs (item A9): the same postings this feed delivers, plus the flags
  // the guardrails check. See the shadow run after the loop.
  const shownForRanker: RankableJob[] = [];
  const guardrailItems: RankedRequestItem[] = [];
  const deliveredGroupKeys = new Set<string>();
  // Hidden postings: they leave the feed, but their neighbourhood is demoted by
  // the ranker (A6-002) — that signal needs their company and stack, not just ids.
  const disliked: DislikedPosting[] = [];
  const collected: (PolicyBoundRecord & { excerpt: string; closure: ClosureSignal | null })[] = [];
  for (const sourceId of ["himalayas", "jobicy"]) {
    const policy = getSourcePolicy(sourceId);
    if (!policy || !policyPublishes(policy, now)) continue;
    const rows = await readSnapshotCardsData(pool, sourceId);
    for (const row of rows) {
      // Gates first (spec 13.2): anything outside the main catalog is not a result.
      if (classifySnapshot(row.stored.snapshot) !== "main_catalog") {
        notEvaluated += 1;
        continue;
      }
      collected.push({ stored: row.stored, policy, excerpt: row.excerpt, closure: row.closure });
    }
  }
  // Seen-set (item A6): a posting the candidate already looked at and did not act
  // on stays out of the feed until its content changes or the window expires.
  // Like hiding, the rule spans the whole duplicate group: the candidate saw the
  // posting, not one board's copy of it.
  const seenNow = await suppressedSnapshotIds({
    pool, userId, now,
    candidates: collected.map(record => ({
      snapshotId: record.stored.snapshot.id,
      contentHash: record.stored.contentHash,
    })),
  });
  // One posting = one result (item A4): the same job syndicated to two boards
  // is evaluated through one representative record and its card lists the other
  // sources. The representative is chosen among the records whose gates pass,
  // so a fresher unreviewed copy cannot hide a publishable one. A hide applies
  // to the whole group — the candidate said "not this posting", not "not this
  // copy of it".
  for (const group of groupDuplicates(collected, record => record.stored.snapshot)) {
    const primary = choosePrimary(group.members, record => record.stored.snapshot);
    // A hidden posting stays hidden — but it is no longer invisible to the
    // ranking: it feeds the preference demotion below (B23).
    if (group.members.some(record => hidden.has(record.stored.snapshot.id))) {
      disliked.push(dislikedPosting(primary.stored.snapshot));
      continue;
    }
    const others = group.members.filter(record => record !== primary);
    const evaluation = evaluateJob(primary.stored.snapshot, profile.input);
    // A posting the candidate already saw and did not act on is not a result
    // again until it changes or the window expires (item A6). The evaluation has
    // already run, so the suppression is counted per tab — an empty tab can then
    // say honestly WHY it is empty instead of claiming "nothing matched".
    if (group.members.some(record => seenNow.has(record.stored.snapshot.id))) {
      if (evaluation.status === "eligible") seenSuppressedEligible += 1;
      else if (evaluation.status === "needs_review") seenSuppressedNeedsReview += 1;
      continue;
    }
    const card = {
      ...projectCard(primary.stored, primary.policy, others.map(record => ({
        sourceId: record.policy.source_id,
        displayName: record.policy.attribution.display_name,
        url: record.stored.snapshot.source_url,
      }))),
      excerpt: primary.excerpt,
    };
    const matched: MatchedJob = {
      card, evaluation, closure: primary.closure,
      requirements: assessSnapshotRequirements(primary.stored.snapshot, profile.input),
    };
    if (evaluation.status === "eligible") eligible.push(matched);
    else if (evaluation.status === "needs_review") needsReview.push(matched);
    // ineligible stays hidden by default (spec 13.3) — and out of the shadow too:
    // the shadow compares the postings a candidate can actually see.
    else continue;
    // Shadow inputs: only what this feed actually delivers.
    shownForRanker.push({
      snapshot: primary.stored.snapshot,
      status: evaluation.status === "eligible" ? "eligible" : "needs_review",
      firstSeenAt: primary.stored.firstSeenAt,
      closure: primary.closure,
    });
    guardrailItems.push({
      id: primary.stored.snapshot.id,
      // Computed from the data rather than assumed: today the gates make all three
      // flags false by construction, and that is exactly what a guardrail is for —
      // a future change that breaks one of them shows up in the numbers.
      closed: primary.stored.snapshot.lifecycle !== "active",
      duplicate: deliveredGroupKeys.has(group.key),
      approvedSource: policyPublishes(primary.policy, now),
    });
    deliveredGroupKeys.add(group.key);
  }
  // B23 (owner decision No 4, 2026-10-02): the feed is ordered by the shipped
  // deterministic ranker, not by the cached AI scores. One ranking over exactly
  // the delivered postings; the two tabs keep their split and inherit its order.
  const ranked = rankJobs(shownForRanker, profile.input, now, { disliked });
  const rankPosition = new Map(ranked.map((entry, index) => [entry.snapshot.id, index]));
  const byRanker = (a: MatchedJob, b: MatchedJob): number =>
    (rankPosition.get(a.card.id) ?? 0) - (rankPosition.get(b.card.id) ?? 0);
  eligible.sort(byRanker);
  needsReview.sort(byRanker);
  // Item A9: the per-request run over exactly these inputs. Since B23 the feed
  // itself is the ranker, so there is no candidate to diff against — the call
  // keeps the guardrails and logs counts only; a future candidate ranker plugs
  // in through candidateId. A shadow failure is swallowed on purpose: a
  // candidate's feed must never depend on it.
  const shadow = options.shadow
    ?? ((request: ShadowRequest) => logRankerShadow(computeRankerShadow(request)));
  try {
    shadow({
      jobs: shownForRanker, items: guardrailItems, profile: profile.input,
      now, poolSize: shownForRanker.length,
    });
  } catch {
    console.error(JSON.stringify({ code: "RANKER_SHADOW_FAILED" }));
  }
  return {
    status: "ok", rulesetVersion: RULESET_VERSION,
    eligible, needsReview, notEvaluatedCount: notEvaluated,
    seenSuppressed: { eligible: seenSuppressedEligible, needsReview: seenSuppressedNeedsReview },
  };
}
