// Ownership-scoped cover letter service (S4-001). All operations take the
// session userId. SQL is inline fixed literals with $n parameters.
import { randomBytes, createHash } from "node:crypto";
import type { Pool } from "pg";

export class LetterError extends Error {
  constructor(code: "LETTER_EXISTS" | "LETTER_NOT_FOUND" | "VERSION_CONFLICT" |
    "SNAPSHOT_NOT_FOUND" | "GENERATION_FAILED") { super(code); }
}

export type LetterSummary = Readonly<{
  id: string;
  jobSnapshotId: string;
  currentVersion: number;
  updatedAt: string;
}>;

export type Revision = Readonly<{
  id: string;
  version: number;
  body: string;
  origin: "generated" | "user_edited";
  modelId: string | null;
  createdAt: string;
}>;

export type LetterDetail = Readonly<{
  summary: LetterSummary;
  current: Revision | null;
  revisions: readonly Revision[];
}>;

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

export async function createLetter(params: Readonly<{
  pool: Pool; userId: string; jobSnapshotId: string;
}>): Promise<LetterSummary> {
  if (!/^(himalayas|jobicy):[a-z0-9-]{1,150}$/u.test(params.jobSnapshotId)) {
    throw new LetterError("SNAPSHOT_NOT_FOUND");
  }
  const id = `cl_${randomBytes(12).toString("hex")}`;
  try {
    const result = await params.pool.query(
      "INSERT INTO cover_letters (id, user_id, job_snapshot_id) VALUES ($1, $2, $3) RETURNING id, job_snapshot_id, current_version, updated_at",
      [id, params.userId, params.jobSnapshotId],
    );
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: String(row.id),
      jobSnapshotId: String(row.job_snapshot_id),
      currentVersion: Number(row.current_version),
      updatedAt: new Date(row.updated_at as Date).toISOString(),
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
      throw new LetterError("LETTER_EXISTS");
    }
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
      throw new LetterError("SNAPSHOT_NOT_FOUND");
    }
    throw error;
  }
}

export async function getOrCreateLetter(params: Readonly<{
  pool: Pool; userId: string; jobSnapshotId: string;
}>): Promise<LetterSummary> {
  try {
    return await createLetter(params);
  } catch (error) {
    if (error instanceof LetterError && error.message === "LETTER_EXISTS") {
      const result = await params.pool.query(
        "SELECT id, job_snapshot_id, current_version, updated_at FROM cover_letters WHERE user_id = $1 AND job_snapshot_id = $2",
        [params.userId, params.jobSnapshotId],
      );
      const row = result.rows[0] as Record<string, unknown>;
      if (!row) throw new LetterError("LETTER_NOT_FOUND");
      return {
        id: String(row.id),
        jobSnapshotId: String(row.job_snapshot_id),
        currentVersion: Number(row.current_version),
        updatedAt: new Date(row.updated_at as Date).toISOString(),
      };
    }
    throw error;
  }
}

async function insertRevision(params: Readonly<{
  pool: Pool; letterId: string; userId: string; body: string;
  origin: "generated" | "user_edited"; modelId: string | null; expectedVersion: number;
}>): Promise<Revision> {
  const client = await params.pool.connect();
  try {
    await client.query("BEGIN");
    const letter = await client.query(
      "SELECT id, current_version FROM cover_letters WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [params.letterId, params.userId],
    );
    const row = letter.rows[0] as { current_version: number } | undefined;
    if (!row) throw new LetterError("LETTER_NOT_FOUND");
    if (row.current_version !== params.expectedVersion) {
      throw new LetterError("VERSION_CONFLICT");
    }
    const version = row.current_version + 1;
    const revisionId = `rev_${randomBytes(10).toString("hex")}`;
    await client.query(
      "INSERT INTO cover_letter_revisions (id, letter_id, version, body, origin, model_id, content_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [revisionId, params.letterId, version, params.body, params.origin,
        params.modelId, hashBody(params.body)],
    );
    await client.query(
      "UPDATE cover_letters SET current_version = $1, updated_at = now() WHERE id = $2",
      [version, params.letterId],
    );
    await client.query("COMMIT");
    return {
      id: revisionId, version, body: params.body, origin: params.origin,
      modelId: params.modelId, createdAt: new Date().toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveGeneratedRevision(params: Readonly<{
  pool: Pool; letterId: string; userId: string; body: string;
  modelId: string;
}>): Promise<Revision> {
  const letter = await params.pool.query(
    "SELECT current_version FROM cover_letters WHERE id = $1 AND user_id = $2",
    [params.letterId, params.userId],
  );
  const row = letter.rows[0] as { current_version: number } | undefined;
  if (!row) throw new LetterError("LETTER_NOT_FOUND");
  return insertRevision({
    pool: params.pool, letterId: params.letterId, userId: params.userId,
    body: params.body, origin: "generated", modelId: params.modelId,
    expectedVersion: row.current_version,
  });
}

export async function saveUserEdit(params: Readonly<{
  pool: Pool; letterId: string; userId: string; body: string; expectedVersion: number;
}>): Promise<Revision> {
  if (params.body.length > 50_000) throw new LetterError("VERSION_CONFLICT");
  return insertRevision({
    pool: params.pool, letterId: params.letterId, userId: params.userId,
    body: params.body, origin: "user_edited", modelId: null,
    expectedVersion: params.expectedVersion,
  });
}

export async function getLetterDetail(params: Readonly<{
  pool: Pool; userId: string; letterId: string;
}>): Promise<LetterDetail | null> {
  if (!/^cl_[a-f0-9]{24}$/u.test(params.letterId)) return null;
  const letter = await params.pool.query(
    "SELECT id, job_snapshot_id, current_version, updated_at FROM cover_letters WHERE id = $1 AND user_id = $2 AND status = 'draft'",
    [params.letterId, params.userId],
  );
  const letterRow = letter.rows[0] as Record<string, unknown> | undefined;
  if (!letterRow) return null;
  const revisions = await params.pool.query(
    "SELECT id, version, body, origin, model_id, created_at FROM cover_letter_revisions WHERE letter_id = $1 ORDER BY version DESC",
    [params.letterId],
  );
  const revs: Revision[] = revisions.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id), version: Number(record.version),
      body: String(record.body), origin: String(record.origin) as "generated" | "user_edited",
      modelId: record.model_id ? String(record.model_id) : null,
      createdAt: new Date(record.created_at as Date).toISOString(),
    };
  });
  return {
    summary: {
      id: String(letterRow.id), jobSnapshotId: String(letterRow.job_snapshot_id),
      currentVersion: Number(letterRow.current_version),
      updatedAt: new Date(letterRow.updated_at as Date).toISOString(),
    },
    current: revs.find(rev => rev.version === Number(letterRow.current_version)) ?? null,
    revisions: revs,
  };
}

export async function deleteLetter(params: Readonly<{
  pool: Pool; userId: string; letterId: string;
}>): Promise<boolean> {
  if (!/^cl_[a-f0-9]{24}$/u.test(params.letterId)) return false;
  const result = await params.pool.query(
    "DELETE FROM cover_letters WHERE id = $1 AND user_id = $2",
    [params.letterId, params.userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listLetters(params: Readonly<{
  pool: Pool; userId: string;
}>): Promise<readonly LetterSummary[]> {
  const result = await params.pool.query(
    "SELECT id, job_snapshot_id, current_version, updated_at FROM cover_letters WHERE user_id = $1 AND status = 'draft' ORDER BY updated_at DESC",
    [params.userId],
  );
  return result.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id), jobSnapshotId: String(record.job_snapshot_id),
      currentVersion: Number(record.current_version),
      updatedAt: new Date(record.updated_at as Date).toISOString(),
    };
  });
}
