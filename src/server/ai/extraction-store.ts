// Storage for LLM-extracted posting fields (design item C1): the SQL of
// `job_llm_fields` and the shapes it carries, kept apart from the guarded run in
// extraction-service.ts so each file changes for one reason.
//
// Statements follow the house form used in src/server/storage/snapshots.ts: one
// static SQL literal per call site, every value bound as a $n parameter array
// right next to it. Nothing is assembled from data; the literals are plain
// strings, not templates, so interpolation is not even possible.
//
// One row per (snapshot, prompt version, input hash), the input hash being the
// hash of the fields the provider received (docs/OPEN_GAPS.md B28, migration
// 0020). A repost with changed text gets its own record (an audit trail across
// reposts); a new posting version with the same text is answered by the record
// already paid for, and `snapshot_version` keeps the version it was first paid
// for. A repeat write for the same triple is ignored — never overwritten —
// because a record, once paid for, is evidence. The row is also the idempotency
// ledger: a stored record for the current triple answers a repeat without a
// second paid call, and a rejection is kept with its reasons and the raw output
// (a refusal must be auditable).
import type { Pool } from "pg";
import {
  EXTRACTION_PROMPT_VERSION,
  type ExtractedFields, type ExtractionRejection,
} from "../../domain/extraction.ts";

export class ExtractionStoreError extends Error {
  constructor(code: "INVALID_STORED_ROW") {
    super(code);
    this.name = "ExtractionStoreError";
  }
}

/** Who produced a stored record: prompt wording, model artifact, paid operation. */
export type ExtractionProvenance = Readonly<{
  promptVersion: string;
  modelVersion: string;
  operationId: string;
  settledMinor: bigint;
}>;

export type StoredExtraction = Readonly<{
  snapshotId: string;
  /** The posting version the record was first paid for. */
  snapshotVersion: number;
  inputHash: string;
  status: "accepted" | "rejected";
  fields: ExtractedFields | null;
  rawOutput: string | null;
  reasons: readonly ExtractionRejection[];
  provenance: ExtractionProvenance;
}>;

export async function loadExtraction(pool: Pool, params: Readonly<{
  snapshotId: string;
  inputHash: string;
  promptVersion?: string;
}>): Promise<StoredExtraction | null> {
  const promptVersion = params.promptVersion ?? EXTRACTION_PROMPT_VERSION;
  const result = await pool.query(
    "SELECT snapshot_id, snapshot_version, input_hash, prompt_version, model_version, status, payload, reasons, operation_id, settled_minor FROM job_llm_fields WHERE snapshot_id = $1 AND prompt_version = $2 AND input_hash = $3",
    [params.snapshotId, promptVersion, params.inputHash]);
  const row = result.rows[0] as {
    snapshot_id: string; snapshot_version: number; input_hash: string; prompt_version: string;
    model_version: string; status: "accepted" | "rejected"; payload: unknown; reasons: unknown;
    operation_id: string; settled_minor: string;
  } | undefined;
  if (!row) return null;
  const reasons: readonly ExtractionRejection[] =
    Array.isArray(row.reasons) ? row.reasons as ExtractionRejection[] : [];
  const payload = row.payload as { fields?: unknown; rawOutput?: unknown } | null;
  return {
    snapshotId: row.snapshot_id,
    snapshotVersion: Number(row.snapshot_version),
    inputHash: row.input_hash,
    status: row.status,
    fields: row.status === "accepted" ? (payload?.fields as ExtractedFields ?? null) : null,
    rawOutput: row.status === "rejected" && typeof payload?.rawOutput === "string" ? payload.rawOutput : null,
    reasons,
    provenance: {
      promptVersion: row.prompt_version,
      modelVersion: row.model_version,
      operationId: row.operation_id,
      settledMinor: BigInt(row.settled_minor),
    },
  };
}

/** Records one extraction. A repeat for the same triple is ignored, not overwritten. */
export async function storeExtraction(pool: Pool, entry: Readonly<{
  snapshotId: string;
  snapshotVersion: number;
  inputHash: string;
  status: "accepted" | "rejected";
  fields: ExtractedFields | null;
  rawOutput: string | null;
  reasons: readonly ExtractionRejection[];
  provenance: ExtractionProvenance;
}>): Promise<void> {
  const payload = entry.status === "accepted"
    ? { fields: entry.fields }
    : { rawOutput: entry.rawOutput ?? "" };
  await pool.query(
    "INSERT INTO job_llm_fields (snapshot_id, snapshot_version, input_hash, prompt_version, model_version, status, payload, reasons, operation_id, settled_minor) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING",
    [
      entry.snapshotId,
      entry.snapshotVersion,
      entry.inputHash,
      entry.provenance.promptVersion,
      entry.provenance.modelVersion,
      entry.status,
      JSON.stringify(payload),
      JSON.stringify(entry.reasons),
      entry.provenance.operationId,
      entry.provenance.settledMinor.toString(),
    ]);
}
