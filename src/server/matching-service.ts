import "server-only";
import { readConfig } from "./config.ts";
import { latestProfile } from "./profile-service.ts";
import { readSnapshotCardsData, snapshotPool } from "./storage/snapshots.ts";
import { himalayasCandidatePolicy } from "./source-policies.ts";
import { classifySnapshot, projectCard } from "../domain/snapshot-projection.ts";
import { evaluateJob, RULESET_VERSION, type JobEvaluation } from "../domain/matching.ts";

export type MatchedJob = Readonly<{
  card: ReturnType<typeof projectCard> & Readonly<{ excerpt: string }>;
  evaluation: JobEvaluation;
}>;

export type MatchedResult = Readonly<{
  status: "ok" | "no_profile" | "fixture_backend";
  rulesetVersion: number;
  eligible: readonly MatchedJob[];
  needsReview: readonly MatchedJob[];
  notEvaluatedCount: number;
}>;

export async function matchedForUser(userId: string): Promise<MatchedResult> {
  const empty: MatchedResult = {
    status: "ok", rulesetVersion: RULESET_VERSION, eligible: [], needsReview: [], notEvaluatedCount: 0,
  };
  const config = readConfig(process.env);
  if (config.backend !== "postgres") {
    return { ...empty, status: "fixture_backend" };
  }
  const pool = snapshotPool();
  const profile = await latestProfile(pool, userId);
  if (!profile) return { ...empty, status: "no_profile" };
  const rows = await readSnapshotCardsData(pool, himalayasCandidatePolicy.source_id);
  const eligible: MatchedJob[] = [];
  const needsReview: MatchedJob[] = [];
  let notEvaluated = 0;
  for (const row of rows) {
    // Gates first (spec 13.2): anything outside the main catalog is not a result.
    if (classifySnapshot(row.stored.snapshot) !== "main_catalog") {
      notEvaluated += 1;
      continue;
    }
    const evaluation = evaluateJob(row.stored.snapshot, profile.input);
    const card = { ...projectCard(row.stored, himalayasCandidatePolicy), excerpt: row.excerpt };
    if (evaluation.status === "eligible") eligible.push({ card, evaluation });
    else if (evaluation.status === "needs_review") needsReview.push({ card, evaluation });
    // ineligible stays hidden by default (spec 13.3)
  }
  return {
    status: "ok", rulesetVersion: RULESET_VERSION,
    eligible, needsReview, notEvaluatedCount: notEvaluated,
  };
}
