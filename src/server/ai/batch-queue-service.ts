// Batch queue management: submit, poll, retrieve, persist.
// Event-driven: profile changes and new-job imports trigger batch submissions;
// the worker polls pending batches and stores results automatically.
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import {
  submitBatch, checkBatch, retrieveBatchResults, isBatchConfigured,
} from "./openai-batch.ts";
import { buildSinglePrompt } from "../relevance-service.ts";
import { latestProfile } from "../profile-service.ts";
import { readSnapshotCardsData } from "../storage/snapshots.ts";
import { isJobSnapshot } from "../../domain/source-contracts.ts";
import { matchedForUser } from "../matching-service.ts";

export type BatchQueueEntry = Readonly<{
  id: string;
  userId: string;
  openaiBatchId: string;
  profileVersion: number;
  status: string;
  jobCount: number;
  storedCount: number;
}>;

// Submit a batch for all eligible jobs that lack cached scores for the
// current profile version. Returns the queue entry, or null if nothing to do.
export async function submitRelevanceBatch(params: Readonly<{
  pool: Pool; userId: string;
}>): Promise<BatchQueueEntry | null> {
  if (!isBatchConfigured()) return null;
  const profile = await latestProfile(params.pool, params.userId);
  if (!profile) return null;
  const matched = await matchedForUser(params.userId);
  if (matched.status !== "ok" || matched.eligible.length === 0) return null;

  // Find eligible jobs without cached scores for this profile version.
  const cached = await params.pool.query(
    "SELECT snapshot_id FROM job_relevance_scores WHERE user_id = $1 AND profile_version = $2",
    [params.userId, profile.version],
  );
  const cachedIds = new Set(cached.rows.map((row: Record<string, unknown>) => String(row.snapshot_id)));
  const toAnalyze = matched.eligible.filter(job => !cachedIds.has(job.card.id));
  if (toAnalyze.length === 0) return null;

  // Load job data for prompts.
  const batchJobs: { customId: string; snapshotId: string; prompt: string }[] = [];
  const mapping: Record<string, string> = {};
  for (const job of toAnalyze) {
    const sourceId = job.card.id.split(":")[0] ?? "";
    const rows = await readSnapshotCardsData(params.pool, sourceId);
    const row = rows.find(r => r.stored.snapshot.id === job.card.id);
    if (!row || !isJobSnapshot(row.stored.snapshot)) continue;
    const customId = `rel-${job.card.id.replace(/[^a-z0-9-]/gu, "_")}`.slice(0, 180);
    mapping[customId] = job.card.id;
    batchJobs.push({
      customId,
      snapshotId: job.card.id,
      prompt: buildSinglePrompt(
        { title: row.stored.snapshot.title, company: row.stored.snapshot.company_name,
          description: row.excerpt || row.stored.snapshot.description_text },
        { targetRoles: profile.input.targetRoles,
          country: profile.input.residenceCountry ?? "не указана" },
      ),
    });
  }
  if (batchJobs.length === 0) return null;

  try {
    const submission = await submitBatch(batchJobs);
    const id = `bq_${randomBytes(10).toString("hex")}`;
    await params.pool.query(
      "INSERT INTO ai_batch_queue (id, user_id, openai_batch_id, profile_version, custom_id_mapping, job_count) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [id, params.userId, submission.batchId, profile.version,
        JSON.stringify(mapping), batchJobs.length],
    );
    return {
      id, userId: params.userId, openaiBatchId: submission.batchId,
      profileVersion: profile.version, status: "submitted",
      jobCount: batchJobs.length, storedCount: 0,
    };
  } catch {
    return null; // Batch submission failed; user can retry manually
  }
}

// Poll all pending batches; retrieve and persist results for completed ones.
export async function processPendingBatches(pool: Pool): Promise<Readonly<{
  checked: number; completed: number; stored: number;
}>> {
  const pending = await pool.query(
    "SELECT id, user_id, openai_batch_id, profile_version, custom_id_mapping FROM ai_batch_queue WHERE status = 'submitted' ORDER BY submitted_at LIMIT 10",
  );
  let completed = 0;
  let stored = 0;
  for (const row of pending.rows) {
    const record = row as Record<string, unknown>;
    const entryId = String(record.id);
    const userId = String(record.user_id);
    const batchId = String(record.openai_batch_id);
    const profileVersion = Number(record.profile_version);
    const mapping = record.custom_id_mapping as Record<string, string>;
    try {
      const status = await checkBatch(batchId);
      if (status.status === "completed" && status.outputFileId) {
        const customIdMap = new Map(Object.entries(mapping));
        const results = await retrieveBatchResults(status.outputFileId, customIdMap);
        const { persistBatchResults } = await import("./openai-batch.ts");
        const count = await persistBatchResults({
          pool, userId, profileVersion, results,
        });
        await pool.query(
          "UPDATE ai_batch_queue SET status = 'completed', stored_count = $1, completed_at = now() WHERE id = $2",
          [count, entryId],
        );
        completed += 1;
        stored += count;
      } else if (status.status === "failed" || status.status === "expired") {
        await pool.query(
          "UPDATE ai_batch_queue SET status = $1, completed_at = now() WHERE id = $2",
          [status.status, entryId],
        );
        completed += 1;
      }
    } catch {
      // Network error polling this batch; try again on the next cycle.
    }
  }
  return { checked: pending.rows.length, completed, stored };
}

// Check if any user has new eligible jobs without relevance scores
// (called by the worker after each import cycle).
export async function checkForStaleAnalyses(pool: Pool): Promise<readonly string[]> {
  // Find users with profiles that have eligible jobs lacking cached scores.
  const users = await pool.query(
    "SELECT DISTINCT user_id FROM candidate_profiles",
  );
  const staleUserIds: string[] = [];
  for (const row of users.rows) {
    const userId = String((row as Record<string, unknown>).user_id);
    const profile = await latestProfile(pool, userId);
    if (!profile) continue;
    const cached = await pool.query(
      "SELECT COUNT(*) AS count FROM job_relevance_scores WHERE user_id = $1 AND profile_version = $2",
      [userId, profile.version],
    );
    const cachedCount = Number((cached.rows[0] as Record<string, unknown>).count);
    const matched = await matchedForUser(userId);
    if (matched.status === "ok" && matched.eligible.length > cachedCount) {
      staleUserIds.push(userId);
    }
  }
  return staleUserIds;
}
