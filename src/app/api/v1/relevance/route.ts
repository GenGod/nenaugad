import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { currentUser } from "../../../../server/auth.ts";
import {
  getAllCachedScores, getCachedScore, storeScore,
  buildSinglePrompt, buildBatchPrompt,
  parseRelevanceResponse, parseBatchResponse,
  RELEVANCE_BATCH_SIZE, RelevanceError,
} from "../../../../server/relevance-service.ts";
import {
  BATCH_DISABLED_REASON,
} from "../../../../server/ai/openai-batch.ts";
import { BudgetError } from "../../../../server/ai/spending.ts";
import { isDuplicateChunk, isStopError } from "../../../../server/ai/ledger-refusals.ts";
import { assertNoCandidateFacts } from "../../../../server/ai/personal-data-boundary.ts";
import { matchedForUser } from "../../../../server/matching-service.ts";
import { latestProfile } from "../../../../server/profile-service.ts";
import { readSnapshotCardsData, snapshotPool } from "../../../../server/storage/snapshots.ts";
import { isJobSnapshot } from "../../../../domain/source-contracts.ts";
import { executeGuardedOperation } from "../../../../server/ai/gateway.ts";
import { openAiTransport } from "../../../../server/ai/openai-transport.ts";
import { reservationFor, worstCaseCostMicroUsd } from "../../../../server/ai/provider.ts";
import { maySendTextToProvider, partitionSourcesByProviderRights } from "../../../../server/source-policies.ts";
import type { RelevanceScore } from "../../../../server/relevance-service.ts";

/**
 * The sources behind a list of snapshot ids. A snapshot id is `source:record`
 * (the storage CHECK ties the id to `source_id`), so the prefix is the source.
 */
function sourcesOf(snapshotIds: readonly string[]): readonly string[] {
  return [...new Set(snapshotIds.map(id => id.split(":")[0] ?? ""))].filter(id => id.length > 0);
}

/** Why a source's postings were left out of an AI run — a rights answer, not an error. */
const RIGHTS_NOTE = "postings from these sources were not sent to the provider:"
  + " the source policy does not allow send_to_ai_provider (see docs/OPEN_GAPS.md A2)";

/**
 * The idempotency key of one chunk: content-addressed, never clock-addressed.
 *
 * `Date.now()` in the key (which this replaces) made every retry a brand-new
 * paid operation, so the persistent attempt counter never accumulated and a
 * double-click could pay twice. The key must be a function of *what is being
 * asked*: the profile version and the exact set of postings in the chunk. A
 * replay of the same request then finds the same operation, and the money layer
 * decides what happens next (a settled operation is not charged again).
 */
function chunkOperationKey(profileVersion: number, snapshotIds: readonly string[]): string {
  const fingerprint = createHash("sha256")
    .update([...snapshotIds].sort().join("\n"))
    .digest("hex").slice(0, 24);
  return `relevance-chunk-p${profileVersion}-${fingerprint}`;
}

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function relevanceFailure(error: unknown): NextResponse {
  if (error instanceof RelevanceError) {
    const status = error.message === "PROFILE_REQUIRED" ? 409
      : error.message === "BUDGET_EXCEEDED" ? 402 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  // The ledger's own refusals carry a code that says what happened: report it
  // instead of collapsing everything into 500 ANALYSIS_FAILED. Exhausted money is
  // 402; the rest are state refusals the caller can act on (409).
  if (error instanceof BudgetError) {
    const status = error.message === "BUDGET_EXCEEDED" || error.message === "BUDGET_UNAVAILABLE"
      ? 402 : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  // A revoked purpose is a policy refusal, not a broken server: say so instead of
  // dressing it as 500 ANALYSIS_FAILED.
  if (error instanceof Error && error.message === "AI_PURPOSE_NOT_APPROVED") {
    return NextResponse.json({ error: "AI_PURPOSE_NOT_APPROVED" }, { status: 403 });
  }
  if (error instanceof Error && error.message === "AI_PROVIDER_NOT_CONFIGURED") {
    return NextResponse.json({ error: "AI_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (error instanceof Error && error.message === "AI_LIVE_DISABLED") {
    return NextResponse.json({ error: "AI_LIVE_DISABLED" }, { status: 503 });
  }
  // Personal data stays inside the contour (owner decision 2026-10-01): the
  // operation needs candidate facts, so it is refused rather than anonymised.
  if (error instanceof Error && error.message === "PERSONAL_DATA_BOUNDARY") {
    return NextResponse.json({ error: "PERSONAL_DATA_BOUNDARY" }, { status: 503 });
  }
  if (error instanceof Error && error.message.includes("BUDGET")) {
    return NextResponse.json({ error: "BUDGET_EXCEEDED" }, { status: 402 });
  }
  return NextResponse.json({ error: "ANALYSIS_FAILED" }, { status: 500 });
}

async function dispatchWithPrompt(
  prompt: string, userId: string, idemKey: string,
): Promise<Readonly<{ output: string; settledMinor: bigint }>> {
  // Personal-data boundary (owner decision 2026-10-01): scoring a candidate's fit
  // cannot be expressed with the job text alone, so it does not leave the contour.
  assertNoCandidateFacts("job_matching");
  // The reservation must bound the *request*, not the expected answer: input
  // tokens are bounded by the prompt's character count (no tokenizer emits more
  // tokens than characters) and the output by the transport's hard maximum. The
  // previous fixed 1200/400 envelope under-reserved against a request that may
  // ask for 8192 output tokens (docs/OPEN_GAPS.md A4).
  const envelope = reservationFor(prompt);
  const worstCase = worstCaseCostMicroUsd(envelope);
  return executeGuardedOperation({
    pool: snapshotPool(), ownerId: userId, purpose: "job_matching",
    idempotencyKey: idemKey, worstCaseMinor: worstCase,
    transport: openAiTransport,
    prompt,
    now: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const raw = body as { snapshotId?: unknown; batch?: unknown;
    mode?: unknown; checkBatchId?: unknown };
  const pool = snapshotPool();
  const profile = await latestProfile(pool, user.id);
  if (!profile) return NextResponse.json({ error: "PROFILE_REQUIRED" }, { status: 409 });

  try {
    // --- OpenAI Batch API mode: CLOSED (C0 part 1, 2026-10-01) ---
    // It spent without the budget guard and trusted a client-supplied
    // custom_id→snapshot_id mapping, which let a caller choose which posting got
    // which score. Both reasons are one path, so closing it closes both; the
    // reviewed re-enable is described in src/server/ai/openai-batch.ts.
    if (raw.mode === "openai-batch" && raw.batch === true) {
      return NextResponse.json({
        error: "BATCH_DISABLED", reason: BATCH_DISABLED_REASON,
        alternative: "POST without mode=openai-batch for the guarded synchronous path",
      }, { status: 503 });
    }
    // --- Check a batch and retrieve results: closed with the same path. ---
    if (typeof raw.checkBatchId === "string") {
      return NextResponse.json({
        error: "BATCH_DISABLED", reason: BATCH_DISABLED_REASON,
      }, { status: 503 });
    }
    // --- Synchronous batch (existing, immediate) ---
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
          scores: [...cachedMap.values()], totalCostMicroUsd: "0" });
      }
      // Load job data.
      const jobs: { id: string; title: string; company: string; description: string }[] = [];
      const rights = partitionSourcesByProviderRights(sourcesOf(toAnalyze), new Date().toISOString());
      for (const sourceId of rights.allowed) {
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
      let totalCostMinor = 0n;
      let duplicateChunks = 0;
      const failedChunks: number[] = [];
      for (let i = 0; i < jobs.length; i += RELEVANCE_BATCH_SIZE) {
        const chunk = jobs.slice(i, i + RELEVANCE_BATCH_SIZE);
        const prompt = buildBatchPrompt(chunk,
          { targetRoles: profile.input.targetRoles, country: profile.input.residenceCountry ?? "не указана", skills: profile.input.skills });
        const key = chunkOperationKey(profile.version, chunk.map(job => job.id));
        try {
          const result = await dispatchWithPrompt(prompt, user.id, key);
          totalCostMinor += result.settledMinor;
          const batchScores = parseBatchResponse(result.output);
          if (batchScores === null) {
            // The model answered, but not in a shape we can store. That is a real
            // failure and it is counted — the previous silent catch made it look
            // like a successful run with fewer scores.
            failedChunks.push(i);
            continue;
          }
          for (const score of batchScores) {
            scores.push(score);
            await storeScore({ pool, userId: user.id, profileVersion: profile.version,
              score, modelId: "gpt-6-luna" });
          }
        } catch (error) {
          if (isDuplicateChunk(error)) { duplicateChunks += 1; continue; }
          if (isStopError(error)) throw error;
          failedChunks.push(i);
        }
      }
      return NextResponse.json({ analyzed: scores.length - cachedMap.size,
        cached: cachedMap.size, scores,
        // Honest cost: the sum of what the ledger actually settled, in micro-dollars (μ$).
        totalCostMicroUsd: totalCostMinor.toString(),
        duplicateChunks, failedChunks, rightsSkipped: rights.denied,
        ...(rights.denied.length > 0 ? { rightsMessage: RIGHTS_NOTE } : {}) });
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
    // Rights before text: the posting leaves the machine only if its source
    // policy allows provider transfer right now.
    if (!maySendTextToProvider(job.id.split(":")[0] ?? "", new Date().toISOString())) {
      return NextResponse.json({ error: "SOURCE_RIGHTS_DENIED" }, { status: 403 });
    }
    const prompt = buildSinglePrompt(
      { title: job.title, company: job.company_name,
        description: row.excerpt || job.description_text },
      { targetRoles: profile.input.targetRoles, country: profile.input.residenceCountry ?? "не указана" },
    );
    // The single-job idempotency key is content-addressed too: the same posting
    // and profile version asked twice is the same operation, not a new one.
    const result = await dispatchWithPrompt(prompt, user.id,
      chunkOperationKey(profile.version, [snapshotId]));
    const parsed = parseRelevanceResponse(result.output);
    if (!parsed) return NextResponse.json({ error: "ANALYSIS_FAILED" }, { status: 502 });
    const score: RelevanceScore = { ...parsed, snapshotId };
    await storeScore({ pool, userId: user.id, profileVersion: profile.version,
      score, modelId: "gpt-6-luna" });
    return NextResponse.json({ ...score, costMicroUsd: result.settledMinor.toString() });
  } catch (error) {
    return relevanceFailure(error);
  }
}
