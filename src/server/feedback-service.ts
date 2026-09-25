// Ownership-scoped hide/applied feedback storage (migration 0008). Every
// operation takes the session userId; SQL is inline fixed literals with $n
// parameters.
import type { Pool } from "pg";

export class FeedbackError extends Error {
  constructor(code: "INVALID_REASON" | "SNAPSHOT_NOT_FOUND") { super(code); }
}

export type HiddenJobRecord = Readonly<{
  snapshotId: string;
  reasonCode: string;
  createdAt: string;
  excerpt: string;
  snapshot: unknown;
}>;

export async function hideJobForUser(params: Readonly<{
  pool: Pool; userId: string; snapshotId: string; reasonCode: string;
}>): Promise<void> {
  if (!/^(himalayas|jobicy):[a-z0-9-]{1,150}$/u.test(params.snapshotId)) {
    throw new FeedbackError("SNAPSHOT_NOT_FOUND");
  }
  try {
    await params.pool.query(
      "INSERT INTO hidden_jobs (user_id, snapshot_id, reason_code) VALUES ($1, $2, $3) ON CONFLICT (user_id, snapshot_id) DO UPDATE SET reason_code = EXCLUDED.reason_code",
      [params.userId, params.snapshotId, params.reasonCode],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
      throw new FeedbackError("SNAPSHOT_NOT_FOUND");
    }
    throw error;
  }
}

export async function unhideJobForUser(pool: Pool, userId: string, snapshotId: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM hidden_jobs WHERE user_id = $1 AND snapshot_id = $2",
    [userId, snapshotId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listHiddenJobs(pool: Pool, userId: string): Promise<readonly HiddenJobRecord[]> {
  const result = await pool.query(
    "SELECT h.snapshot_id, h.reason_code, h.created_at, j.excerpt, j.snapshot FROM hidden_jobs h LEFT JOIN job_snapshots j ON j.id = h.snapshot_id WHERE h.user_id = $1 ORDER BY h.created_at DESC",
    [userId],
  );
  return result.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      snapshotId: String(record.snapshot_id),
      reasonCode: String(record.reason_code),
      createdAt: new Date(record.created_at as Date).toISOString(),
      excerpt: record.excerpt === null || record.excerpt === undefined ? "" : String(record.excerpt),
      snapshot: record.snapshot ?? null,
    };
  });
}

export async function hiddenSnapshotIds(pool: Pool, userId: string): Promise<ReadonlySet<string>> {
  const result = await pool.query(
    "SELECT snapshot_id FROM hidden_jobs WHERE user_id = $1",
    [userId],
  );
  return new Set(result.rows.map(row => String((row as Record<string, unknown>).snapshot_id)));
}

export type AppliedMark = Readonly<{ markedAppliedAt: string | null }>;

export async function setAppliedMark(params: Readonly<{
  pool: Pool; userId: string; snapshotId: string; applied: boolean; now: string;
}>): Promise<boolean> {
  const result = await params.pool.query(
    "UPDATE saved_jobs SET marked_applied_at = $3 WHERE user_id = $1 AND snapshot_id = $2",
    [params.userId, params.snapshotId, params.applied ? params.now : null],
  );
  return (result.rowCount ?? 0) > 0;
}

// Extends the saved list with the manual apply mark.
export async function listSavedJobsWithApplied(pool: Pool, userId: string): Promise<
  readonly { snapshotId: string; savedAt: string; excerpt: string; snapshot: unknown; markedAppliedAt: string | null }[]
> {
  const result = await pool.query(
    "SELECT s.snapshot_id, s.created_at, s.marked_applied_at, j.excerpt, j.snapshot FROM saved_jobs s JOIN job_snapshots j ON j.id = s.snapshot_id WHERE s.user_id = $1 ORDER BY s.created_at DESC",
    [userId],
  );
  return result.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      snapshotId: String(record.snapshot_id),
      savedAt: new Date(record.created_at as Date).toISOString(),
      markedAppliedAt: record.marked_applied_at
        ? new Date(record.marked_applied_at as Date).toISOString() : null,
      excerpt: String(record.excerpt ?? ""),
      snapshot: record.snapshot,
    };
  });
}
