// OpenAI Batch API client — CLOSED until it is brought behind the money guard
// (C0 part 1, 2026-10-01, brief §C0 "или отключить до завода").
//
// Why closed rather than "just guarded": this path never went through
// `executeGuardedOperation`, so its spending had no worst-case reservation, no
// ai_operations row, no attempt counter, no deadline and no uncertain handling
// (docs/OPEN_GAPS.md A3). Bringing it behind the guard is not a rename — an
// asynchronous job needs a reservation that outlives the 120 s operation
// deadline, a settle step in a *different* request, the operation id stored with
// the queue row, and a ceiling decision, because a whole-catalog batch
// (~1.05M input tokens ≈ 1.05 cents) exceeds the owner's 1-cent per-operation
// ceiling. That is its own reviewed task; the brief explicitly allows closing
// the path until then ("или отключить до завода").
//
// The SDK client is gone on purpose: this module no longer imports `openai` at
// all, so the approved transport (src/server/ai/openai-transport.ts) is the only
// file in the repository that can reach a provider. A guard that can be bypassed
// by a stale import is not a guard.
//
// Kept, because it is the shape of the future work and is testable without a
// network: `buildJsonl` (request building) and `parseBatchOutput` (result
// parsing), plus `persistBatchResults` (the write step). Everything that would
// touch the provider throws `BatchDisabledError` before any client exists.
import type { Pool } from "pg";
import { GPT6_LUNA } from "./provider.ts";
import { storeScore, type RelevanceScore } from "../relevance-service.ts";

export class BatchDisabledError extends Error {
  readonly code = "BATCH_DISABLED";
  constructor() { super("BATCH_DISABLED"); }
}

/**
 * Why the path is off, in one place, so every caller can say something true
 * instead of "nothing to do".
 */
export const BATCH_DISABLED_REASON =
  "the batch path spends without the budget guard (no reservation, attempts, deadline or"
  + " uncertain handling) and stays closed until it is brought behind executeGuardedOperation;"
  + " see docs/OPEN_GAPS.md A3";

/** False by construction: see the module header for what must exist first. */
export function isBatchEnabled(): boolean {
  return false;
}

export type BatchJob = Readonly<{
  customId: string;
  snapshotId: string;
  prompt: string;
}>;

export type BatchSubmission = Readonly<{
  batchId: string;
  inputFileId: string;
  jobCount: number;
}>;

export type BatchStatus = Readonly<{
  id: string;
  status: string;
  requestCounts: Readonly<{
    total: number; completed: number; failed: number;
  }>;
  outputFileId: string | null;
  errorFileId: string | null;
}>;

// Build a JSONL file body: one chat completion request per job.
export function buildJsonl(jobs: readonly BatchJob[]): string {
  return jobs.map(job =>
    JSON.stringify({
      custom_id: job.customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: GPT6_LUNA.modelId,
        messages: [
          { role: "system", content: "You are a job relevance analyzer. Output valid JSON only." },
          { role: "user", content: job.prompt },
        ],
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
      },
    }),
  ).join("\n");
}

/** Upload the JSONL and create a batch. Closed: see the module header. */
export async function submitBatch(_jobs: readonly BatchJob[]): Promise<BatchSubmission> {
  throw new BatchDisabledError();
}

/** Poll a batch. Closed with the rest of the path. */
export async function checkBatch(_batchId: string): Promise<BatchStatus> {
  throw new BatchDisabledError();
}

export type BatchResultEntry = Readonly<{
  customId: string;
  snapshotId: string;
  score: RelevanceScore | null;
}>;

/**
 * Parse a batch output file (JSONL). Pure: no network, no client — which is why
 * it survives the closure and can be tested today. Malformed lines and results
 * for unknown custom ids are counted, not silently dropped: `skipped` is what an
 * operator needs to tell "the model returned nothing" from "we lost the answer".
 */
export function parseBatchOutput(
  text: string,
  customIdToSnapshotId: ReadonlyMap<string, string>,
): Readonly<{ entries: readonly BatchResultEntry[]; malformedLines: number; unknownCustomIds: number }> {
  const entries: BatchResultEntry[] = [];
  let malformedLines = 0;
  let unknownCustomIds = 0;
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    let customId = "";
    let snapshotId: string | undefined;
    let content = "";
    try {
      const record = JSON.parse(line) as {
        custom_id?: string;
        response?: { body?: { choices?: { message?: { content?: string } }[] } };
      };
      customId = record.custom_id ?? "";
      snapshotId = customIdToSnapshotId.get(customId);
      if (!snapshotId) {
        unknownCustomIds += 1;
        continue;
      }
      content = record.response?.body?.choices?.[0]?.message?.content ?? "";
    } catch {
      malformedLines += 1;
      continue;
    }
    if (content.length === 0) {
      entries.push({ customId, snapshotId, score: null });
      continue;
    }
    try {
      const parsed = JSON.parse(content) as {
        score?: number; matched_skills?: string[];
        missing_skills?: string[]; explanation?: string;
      };
      if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
        entries.push({ customId, snapshotId, score: null });
        continue;
      }
      entries.push({
        customId, snapshotId,
        score: {
          snapshotId,
          score: Math.round(parsed.score),
          matchedSkills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills : [],
          missingSkills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [],
          explanation: typeof parsed.explanation === "string" ? parsed.explanation.slice(0, 500) : "",
        },
      });
    } catch {
      // An unparseable score is a missing score, and it is reported as one.
      entries.push({ customId, snapshotId, score: null });
    }
  }
  return { entries, malformedLines, unknownCustomIds };
}

/** Download and parse a batch output file. Closed: see the module header. */
export async function retrieveBatchResults(
  _outputFileId: string,
  _customIdToSnapshotId: ReadonlyMap<string, string>,
): Promise<readonly BatchResultEntry[]> {
  throw new BatchDisabledError();
}

// Store all valid results in the DB. Kept because it is the write step of the
// reviewed plan above and touches no provider.
export async function persistBatchResults(params: Readonly<{
  pool: Pool; userId: string; profileVersion: number;
  results: readonly BatchResultEntry[];
}>): Promise<number> {
  let stored = 0;
  for (const entry of params.results) {
    if (entry.score === null) continue;
    await storeScore({
      pool: params.pool, userId: params.userId,
      profileVersion: params.profileVersion,
      score: entry.score, modelId: GPT6_LUNA.modelId,
    });
    stored += 1;
  }
  return stored;
}
