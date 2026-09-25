import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { currentUser } from "../../../../server/auth.ts";
import {
  getAllCachedScores, getCachedScore, storeScore,
  buildSinglePrompt, buildBatchPrompt,
  parseRelevanceResponse, parseBatchResponse,
  RELEVANCE_BATCH_SIZE, RelevanceError,
} from "../../../../server/relevance-service.ts";
import { matchedForUser } from "../../../../server/matching-service.ts";
import { latestProfile } from "../../../../server/profile-service.ts";
import { readSnapshotCardsData, snapshotPool } from "../../../../server/storage/snapshots.ts";
import { isJobSnapshot } from "../../../../domain/source-contracts.ts";
import { executeGuardedOperation } from "../../../../server/ai/gateway.ts";
import { openAiTransport } from "../../../../server/ai/openai-transport.ts";
import { worstCaseCostMicroCents } from "../../../../server/ai/provider.ts";
import type { RelevanceScore } from "../../../../server/relevance-service.ts";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function relevanceFailure(error: unknown): NextResponse {
  if (error instanceof RelevanceError) {
    const status = error.message === "PROFILE_REQUIRED" ? 409
      : error.message === "BUDGET_EXCEEDED" ? 402 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (error instanceof Error && error.message.includes("BUDGET")) {
    return NextResponse.json({ error: "BUDGET_EXCEEDED" }, { status: 402 });
  }
  return NextResponse.json({ error: "ANALYSIS_FAILED" }, { status: 500 });
}

async function dispatchWithPrompt(prompt: string, userId: string, idemKey: string): Promise<string> {
  const worstCase = worstCaseCostMicroCents({ inputTokens: 1200, outputTokens: 400 });
  const result = await executeGuardedOperation({
    pool: snapshotPool(), ownerId: userId, taskType: "job_matching",
    idempotencyKey: idemKey, worstCaseMinor: worstCase,
    transport: {
      dispatchOnce: async (operation: Parameters<typeof openAiTransport.dispatchOnce>[0], attempt: number) =>
        openAiTransport.dispatchOnce(
          { ...operation, inputHash: createHash("sha256").update(prompt).digest("hex").slice(0, 32) },
          attempt,
        ),
    },
    now: new Date().toISOString(),
  });
  return result.output;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const raw = body as { snapshotId?: unknown; batch?: unknown };
  const pool = snapshotPool();
  const profile = await latestProfile(pool, user.id);
  if (!profile) return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 409 });

  try {
    if (raw.batch === true) {
      const matched = await matchedForUser(user.id);
      if (matched.status !== "ok") {
        return NextResponse.json({ error: matched.status }, { status: 409 });
      }
      const eligibleIds = matched.eligible.map(job => job.card.id);
      if (eligibleIds.length === 0) {
        return NextResponse.json({ error: "NO_ELIGIBLE_JOBS" }, { status: 404 });
      }
      const cachedMap = await getAllCachedScores({
        pool, userId: user.id, profileVersion: profile.version,
      });
      const toAnalyze = eligibleIds.filter(id => !cachedMap.has(id));
      if (toAnalyze.length === 0) {
        return NextResponse.json({ analyzed: 0, cached: cachedMap.size,
          scores: [...cachedMap.values()], totalCostMicroCents: "0" });
      }
      // Load job data.
      const jobs: { id: string; title: string; company: string; description: string }[] = [];
      for (const sourceId of new Set(toAnalyze.map(id => id.split(":")[0] ?? ""))) {
        const rows = await readSnapshotCardsData(pool, sourceId);
        for (const row of rows) {
          if (!isJobSnapshot(row.stored.snapshot)) continue;
          if (!toAnalyze.includes(row.stored.snapshot.id)) continue;
          jobs.push({
            id: row.stored.snapshot.id, title: row.stored.snapshot.title,
            company: row.stored.snapshot.company_name,
            description: row.excerpt || row.stored.snapshot.description_text,
          });
        }
      }
      // Batch in chunks.
      const scores: RelevanceScore[] = [...cachedMap.values()];
      let totalCost = 0n;
      for (let i = 0; i < jobs.length; i += RELEVANCE_BATCH_SIZE) {
        const chunk = jobs.slice(i, i + RELEVANCE_BATCH_SIZE);
        const prompt = buildBatchPrompt(chunk,
          { targetRoles: profile.input.targetRoles, country: profile.input.residenceCountry ?? "не указана" });
        try {
          const output = await dispatchWithPrompt(prompt, user.id,
            `batch-${i}-${profile.version}-${Date.now()}`);
          const batchScores = parseBatchResponse(output);
          if (batchScores) {
            for (const score of batchScores) {
              scores.push(score);
              await storeScore({ pool, userId: user.id, profileVersion: profile.version,
                score, modelId: "gpt-6-luna" });
            }
          }
        } catch { /* chunk failure doesn't stop the rest */ }
      }
      return NextResponse.json({ analyzed: scores.length - cachedMap.size,
        cached: cachedMap.size, scores, totalCostMicroCents: totalCost.toString() });
    }

    // Single job analysis.
    const snapshotId = raw.snapshotId;
    if (typeof snapshotId !== "string") {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }
    const cached = await getCachedScore({
      pool, userId: user.id, snapshotId, profileVersion: profile.version,
    });
    if (cached) return NextResponse.json(cached);

    const rows = await readSnapshotCardsData(pool, snapshotId.split(":")[0] ?? "");
    const row = rows.find(r => r.stored.snapshot.id === snapshotId);
    if (!row || !isJobSnapshot(row.stored.snapshot)) {
      return NextResponse.json({ error: "ANALYSIS_FAILED" }, { status: 404 });
    }
    const job = row.stored.snapshot;
    const prompt = buildSinglePrompt(
      { title: job.title, company: job.company_name,
        description: row.excerpt || job.description_text },
      { targetRoles: profile.input.targetRoles, country: profile.input.residenceCountry ?? "не указана" },
    );
    const output = await dispatchWithPrompt(prompt, user.id,
      `rel-${snapshotId}-${profile.version}`);
    const parsed = parseRelevanceResponse(output);
    if (!parsed) return NextResponse.json({ error: "ANALYSIS_FAILED" }, { status: 502 });
    const score: RelevanceScore = { ...parsed, snapshotId };
    await storeScore({ pool, userId: user.id, profileVersion: profile.version,
      score, modelId: "gpt-6-luna" });
    return NextResponse.json(score);
  } catch (error) {
    return relevanceFailure(error);
  }
}
