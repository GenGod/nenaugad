// OpenAI Batch API client for bulk relevance analysis (50% cost discount
// vs synchronous calls). Workflow: upload JSONL → create batch → poll →
// download results → parse by custom_id → store relevance scores.
// The SDK's built-in retry is off (maxRetries: 0 everywhere).
import OpenAI from "openai";
import type { Pool } from "pg";
import { GPT6_LUNA } from "./provider.ts";
import { storeScore, type RelevanceScore } from "../relevance-service.ts";

let batchClient: OpenAI | null = null;
function client(): OpenAI {
  if (batchClient === null) {
    batchClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      maxRetries: 0,
      timeout: 60_000,
    });
  }
  return batchClient;
}

export function isBatchConfigured(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" &&
    process.env.OPENAI_API_KEY.length > 0;
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

// Upload the JSONL and create a batch. Returns immediately with batch_id.
export async function submitBatch(jobs: readonly BatchJob[]): Promise<BatchSubmission> {
  const jsonl = buildJsonl(jobs);
  const blob = new Blob([jsonl], { type: "application/jsonl" });
  const file = await client().files.create({
    file: blob,
    purpose: "batch",
  });
  const batch = await client().batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
    metadata: { purpose: "relevance", jobs: String(jobs.length) },
  });
  return {
    batchId: batch.id,
    inputFileId: file.id,
    jobCount: jobs.length,
  };
}

export async function checkBatch(batchId: string): Promise<BatchStatus> {
  const batch = await client().batches.retrieve(batchId);
  return {
    id: batch.id,
    status: batch.status,
    requestCounts: {
      total: batch.request_counts?.total ?? 0,
      completed: batch.request_counts?.completed ?? 0,
      failed: batch.request_counts?.failed ?? 0,
    },
    outputFileId: batch.output_file_id ?? null,
    errorFileId: batch.error_file_id ?? null,
  };
}

export type BatchResultEntry = Readonly<{
  customId: string;
  snapshotId: string;
  score: RelevanceScore | null;
}>;

// Download the output file and parse results, mapping custom_id → score.
export async function retrieveBatchResults(
  outputFileId: string,
  customIdToSnapshotId: ReadonlyMap<string, string>,
): Promise<readonly BatchResultEntry[]> {
  const response = await client().files.content(outputFileId);
  const text = await response.text();
  const entries: BatchResultEntry[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const record = JSON.parse(line) as {
        custom_id?: string;
        response?: { body?: { choices?: { message?: { content?: string } }[] } };
      };
      const customId = record.custom_id ?? "";
      const snapshotId = customIdToSnapshotId.get(customId);
      if (!snapshotId) continue;
      const content = record.response?.body?.choices?.[0]?.message?.content ?? "";
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
        entries.push({ customId, snapshotId, score: null });
      }
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

// Store all valid results in the DB.
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
