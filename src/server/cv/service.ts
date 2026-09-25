// Ownership-scoped CV intake storage (migration 0007). Every operation
// takes the session userId; there is no client-supplied owner. Only the
// extracted text and metadata are kept — the original binary is discarded
// at parse time (data minimization, spec 9.3). All SQL is inline fixed
// literals with $n parameters.
import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { CvKind, CvParseResult } from "./parse.ts";

export type CvUploadRecord = Readonly<{
  id: string;
  originalFilename: string;
  kind: CvKind;
  sizeBytes: number;
  characterCount: number;
  warnings: readonly string[];
  createdAt: string;
}>;

export async function saveCvUpload(params: Readonly<{
  pool: Pool; userId: string; filename: string; sizeBytes: number; result: CvParseResult;
}>): Promise<string> {
  const id = `cv_${randomBytes(12).toString("hex")}`;
  await params.pool.query(
    "INSERT INTO cv_uploads (id, user_id, original_filename, detected_kind, size_bytes, character_count, extracted_text, warnings) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)",
    [id, params.userId, params.filename, params.result.kind, params.sizeBytes,
      params.result.text.length, params.result.text, JSON.stringify(params.result.warnings)],
  );
  return id;
}

export async function listCvUploads(pool: Pool, userId: string): Promise<readonly CvUploadRecord[]> {
  const result = await pool.query(
    "SELECT id, original_filename, detected_kind, size_bytes, character_count, warnings, created_at FROM cv_uploads WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return result.rows.map(row => {
    const record = row as Record<string, unknown>;
    return {
      id: String(record.id),
      originalFilename: String(record.original_filename),
      kind: String(record.detected_kind) as CvKind,
      sizeBytes: Number(record.size_bytes),
      characterCount: Number(record.character_count),
      warnings: Array.isArray(record.warnings) ? (record.warnings as string[]) : [],
      createdAt: new Date(record.created_at as Date).toISOString(),
    };
  });
}

export async function getCvText(pool: Pool, userId: string, id: string): Promise<string | null> {
  if (!/^cv_[a-f0-9]{24}$/u.test(id)) return null;
  const result = await pool.query(
    "SELECT extracted_text FROM cv_uploads WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  const row = result.rows[0] as { extracted_text?: string } | undefined;
  return row?.extracted_text ?? null;
}

export async function deleteCvUpload(pool: Pool, userId: string, id: string): Promise<boolean> {
  if (!/^cv_[a-f0-9]{24}$/u.test(id)) return false;
  const result = await pool.query(
    "DELETE FROM cv_uploads WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Profile deletion removes all CV uploads of the user (spec: deleting a CV
// removes the file and all derived data).
export async function deleteAllCvUploads(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query("DELETE FROM cv_uploads WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}
