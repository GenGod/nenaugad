// Embedding storage and indexing (design item B1).
//
// Two responsibilities, deliberately in one file the way profile-service.ts
// keeps SQL and its rules together (they change for the same reason):
//
//   * the SQL that reads and writes vectors (fixed literals, $n parameters);
//   * the indexing run: which postings need a vector, whether this source may
//     have one at all, and what was written.
//
// Statements follow the house form used in src/server/storage/snapshots.ts: one
// static SQL literal per call, every value and every bound passed as a $n
// parameter. Nothing is assembled from data — the optional row bound is a
// parameter too (UNBOUNDED_LIMIT), not a fragment glued in when absent.
//
// The ML permission is asked HERE, at the point of use, not at startup. A policy
// can expire (himalayas and jobicy carry valid_until = 2026-12-23), and an
// expired policy must stop producing new vectors even though older ones still
// exist. A source without the grant is skipped whole — never partially indexed,
// because a half-covered source inside one request is a partial signal that looks
// like a quality result.
//
// Counts and codes are all this module ever reports: no posting text, no vector,
// no profile field reaches a log line or an error message.
import type { Pool } from "pg";
import {
  assertEmbedderOutput, jobEmbeddingText, makeEmbeddingVector,
  type Embedder, type EmbeddingVector,
} from "../../domain/embeddings.ts";
import { isJobSnapshot, type JobSnapshot } from "../../domain/source-contracts.ts";
import { getSourcePolicy, permissionFor } from "../source-policies.ts";

/**
 * Row bound for "embed everything this source has". int4 max: far above any
 * catalog we run against, and it keeps one statement for both cases.
 */
const UNBOUNDED_LIMIT = 2147483647;

/**
 * How many postings are handed to the embedder between progress reports. The
 * embedder decides its own batching (local-embedder.ts embeds one document at a
 * time for memory reasons); this chunk exists so a long run is observable.
 */
const PROGRESS_CHUNK = 25;

export class EmbeddingStoreError extends Error {
  constructor(code: "PROFILE_VERSION_NOT_FOUND" | "INVALID_VECTOR" | "INVALID_SNAPSHOT") {
    super(code);
    this.name = "EmbeddingStoreError";
  }
}

/** One stored posting with its vector: the near-dup queue input (B5). */
export type EmbeddedPosting = Readonly<{
  snapshotId: string;
  sourceId: string;
  snapshot: JobSnapshot;
  vector: EmbeddingVector;
}>;

/**
 * pgvector's text form: numbers only, in brackets. These numbers travel to
 * PostgreSQL as a bound parameter like every other value; String() of a double
 * is its shortest round-trip form, so nothing is invented or lost on the way.
 */
export function toVectorLiteral(values: readonly number[]): string {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new EmbeddingStoreError("INVALID_VECTOR");
  }
  return `[${values.join(", ")}]`;
}

function fromVectorLiteral(
  params: Readonly<{ modelVersion: string; instructionVersion: string; role: "query" | "document"; literal: string; dim: number }>,
): EmbeddingVector {
  const trimmed = params.literal.trim().replace(/^\[/u, "").replace(/\]$/u, "");
  const values = trimmed.length === 0 ? [] : trimmed.split(",").map(Number);
  if (values.length !== params.dim || values.some(value => !Number.isFinite(value))) {
    // A row that does not match the artifact's dimension means the table and the
    // contract have drifted; refusing is the only safe answer.
    throw new EmbeddingStoreError("INVALID_VECTOR");
  }
  return makeEmbeddingVector({
    modelVersion: params.modelVersion,
    instructionVersion: params.instructionVersion,
    role: params.role,
    values,
    // Stored vectors were normalized before they were written; normalizing again
    // would be harmless but would hide a corrupted row that is not unit length.
    // pgvector keeps components as float4, so a round-tripped vector is
    // single-precision: comparisons with a freshly computed one are approximate
    // to ~1e-6. The checks that must stay exact (version, role, dimension) do not
    // depend on precision.
    normalized: true,
  });
}

export type EmbeddingWork = Readonly<{
  snapshotId: string;
  contentHash: string;
  text: string;
}>;

export type EmbeddingIndexReport = Readonly<{
  sourceId: string;
  outcome: "indexed" | "partial_store" | "no_permission" | "unknown_source" | "nothing_to_do";
  /** Postings embedded in this run (new or refreshed) and durably stored. */
  embedded: number;
  /** Postings whose vector is already current. */
  current: number;
  /** Rows whose stored snapshot failed validation — a storage bug, reported not hidden. */
  invalid: number;
  modelVersion: string;
  /**
   * Snapshot ids the database could NOT resolve by primary key while storing
   * (`foreign key violation`). Every one of them was embedded; the database
   * refuses to attach the vector. Measured cause (2026-09-30): a btree whose
   * ordering no longer matches the server's collation after a database image
   * change — 12 of 700 ids in the working database answered "not found" to an
   * index lookup while a sequential scan saw the row. The remedy is
   * `REINDEX TABLE job_snapshots` and it is an owner action, not an application
   * workaround: skipping the row here keeps the run complete, it does not make
   * the posting findable.
   */
  unreachable?: readonly string[];
}>;

/**
 * Postings of a source that need a vector: no row for this model version yet, or
 * the text changed since the vector was made (content_hash). Ordered by id so a
 * limited run is deterministic and resumable.
 */
export async function embeddingWork(
  pool: Pool, sourceId: string, modelVersion: string, limit?: number,
): Promise<readonly EmbeddingWork[]> {
  const result = await pool.query(`
    SELECT j.id, j.content_hash, j.snapshot FROM job_snapshots j
    LEFT JOIN job_embeddings e ON e.snapshot_id = j.id AND e.model_version = $2
    WHERE j.source_id = $1 AND (e.snapshot_id IS NULL OR e.content_hash <> j.content_hash)
    ORDER BY j.id LIMIT $3`, [sourceId, modelVersion, limit ?? UNBOUNDED_LIMIT]);
  const work: EmbeddingWork[] = [];
  for (const row of result.rows as { id: string; content_hash: string; snapshot: unknown }[]) {
    if (!isJobSnapshot(row.snapshot)) continue; // a row the storage layer should have refused
    work.push({ snapshotId: row.id, contentHash: row.content_hash, text: jobEmbeddingText(row.snapshot) });
  }
  return work;
}

export async function countPostings(pool: Pool, sourceId: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM job_snapshots WHERE source_id = $1", [sourceId],
  );
  return Number((result.rows[0] as { total: string }).total);
}

/**
 * Embeds what needs embedding for one source and stores it. `limit` bounds one
 * run: the local model is fast enough for the whole catalog, but a bounded run
 * means an interrupted index is simply resumed by running it again.
 */
export async function indexSourceEmbeddings(params: Readonly<{
  pool: Pool;
  sourceId: string;
  embedder: Embedder;
  now: string;
  limit?: number;
  /**
   * Called as postings are embedded, with counts only. A full catalog takes tens
   * of minutes on CPU (see the batch note in local-embedder.ts), so a run needs
   * to be observable without a data-bearing log line.
   */
  onProgress?: (done: number, total: number) => void;
}>): Promise<EmbeddingIndexReport> {
  const { pool, sourceId, embedder, now, limit, onProgress } = params;
  const policy = getSourcePolicy(sourceId);
  const empty = { embedded: 0, current: 0, invalid: 0, modelVersion: embedder.modelVersion };
  if (!policy) return { sourceId, outcome: "unknown_source", ...empty };
  if (permissionFor(policy, "process_with_ml", now) !== "allowed") {
    // Not an error: a source whose policy withholds or has revoked the right —
    // a disabled or expired policy, or a grant the owner never made — simply has
    // no dense representation.
    return { sourceId, outcome: "no_permission", ...empty };
  }

  const work = await embeddingWork(pool, sourceId, embedder.modelVersion, limit);
  const total = await countPostings(pool, sourceId);
  const current = Math.max(0, total - work.length);
  if (work.length === 0) return { sourceId, outcome: "nothing_to_do", ...empty, current };

  // Embedded in chunks, and each chunk is stored in its own transaction: a full
  // catalog is tens of minutes of CPU, and one unwritable row must not throw that
  // work away. A stopped run is resumed by running it again — the work list is
  // derived from content_hash, so what was stored is not recomputed.
  let embedded = 0;
  const unreachable: string[] = [];
  for (let start = 0; start < work.length; start += PROGRESS_CHUNK) {
    const slice = work.slice(start, start + PROGRESS_CHUNK);
    const requests = slice.map(entry => ({ role: "document" as const, text: entry.text }));
    const vectors = await embedder.embed(requests, "matching");
    assertEmbedderOutput(vectors, requests, embedder);
    const result = await storeChunk(pool, slice, vectors);
    embedded += result.stored;
    unreachable.push(...result.unreachable);
    onProgress?.(embedded + unreachable.length, work.length);
  }
  if (unreachable.length > 0) {
    // Every posting was embedded; some could not be attached to their snapshot.
    // Reported and stepped over rather than retried forever: the same row would
    // fail on every run, and stopping would leave the rest of the catalog
    // unindexed for one bad key.
    return { sourceId, outcome: "partial_store", ...empty, embedded, current, unreachable };
  }
  return { sourceId, outcome: "indexed", ...empty, embedded, current };
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23503";
}

/**
 * One chunk, one transaction, one savepoint per row. The savepoint exists so a
 * single row the database cannot resolve (see `unreachable` above) does not abort
 * the whole chunk; a failure that is NOT a foreign-key violation is a real error
 * and still aborts, because stepping over it would hide a bug.
 *
 * Exported so the step-over behaviour can be tested without corrupting a database
 * index on purpose.
 */
export async function storeChunk(
  pool: Pool,
  work: readonly EmbeddingWork[],
  vectors: readonly EmbeddingVector[],
): Promise<Readonly<{ stored: number; unreachable: readonly string[] }>> {
  const client = await pool.connect();
  const unreachable: string[] = [];
  try {
    await client.query("BEGIN");
    for (const [index, entry] of work.entries()) {
      const vector = vectors[index];
      if (!vector) throw new EmbeddingStoreError("INVALID_VECTOR");
      await client.query("SAVEPOINT row");
      try {
        await client.query(`
          INSERT INTO job_embeddings (snapshot_id, model_version, instruction_version, content_hash, embedding)
          VALUES ($1, $2, $3, $4, $5::vector)
          ON CONFLICT (snapshot_id, model_version) DO UPDATE SET
            instruction_version = EXCLUDED.instruction_version,
            content_hash = EXCLUDED.content_hash,
            embedding = EXCLUDED.embedding,
            created_at = now()`, [
          entry.snapshotId, vector.modelVersion, vector.instructionVersion, entry.contentHash,
          toVectorLiteral(vector.values),
        ]);
        await client.query("RELEASE SAVEPOINT row");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT row");
        if (isForeignKeyViolation(error)) {
          unreachable.push(entry.snapshotId);
          continue;
        }
        throw error;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return { stored: work.length - unreachable.length, unreachable };
}

/** Vectors for the given snapshots, or nothing for those not covered yet. */
export async function loadJobEmbeddings(params: Readonly<{
  pool: Pool;
  snapshotIds: readonly string[];
  modelVersion: string;
  instructionVersion: string;
}>): Promise<ReadonlyMap<string, EmbeddingVector>> {
  const { pool, snapshotIds, modelVersion, instructionVersion } = params;
  const map = new Map<string, EmbeddingVector>();
  if (snapshotIds.length === 0) return map;
  const result = await pool.query(`
    SELECT snapshot_id, embedding::text AS literal FROM job_embeddings
    WHERE model_version = $1 AND instruction_version = $2 AND snapshot_id = ANY($3::text[])`,
  [modelVersion, instructionVersion, [...snapshotIds]]);
  for (const row of result.rows as { snapshot_id: string; literal: string }[]) {
    map.set(row.snapshot_id, fromVectorLiteral({
      modelVersion, instructionVersion, role: "document", literal: row.literal, dim: 1024,
    }));
  }
  return map;
}

/**
 * Every stored posting that has a vector for this artifact, with its snapshot
 * body: the input of the near-dup queue (design item B5). Tombstoned rows are
 * excluded explicitly — retention deletes their text and vectors, so the join
 * would drop them anyway, and the predicate keeps that fact visible. A row whose
 * snapshot JSON is invalid is refused, not skipped: a corrupted row must not
 * make the queue quietly incomplete.
 */
export async function loadEmbeddedPostings(pool: Pool, params: Readonly<{
  modelVersion: string;
  instructionVersion: string;
}>): Promise<readonly EmbeddedPosting[]> {
  const { modelVersion, instructionVersion } = params;
  const result = await pool.query(`
    SELECT s.id AS snapshot_id, s.source_id, s.snapshot, e.embedding::text AS literal
    FROM job_snapshots s
    JOIN job_embeddings e ON e.snapshot_id = s.id
    WHERE e.model_version = $1 AND e.instruction_version = $2 AND s.tombstoned_at IS NULL
    ORDER BY s.id`,
  [modelVersion, instructionVersion]);
  const postings: EmbeddedPosting[] = [];
  for (const row of result.rows as { snapshot_id: string; source_id: string; snapshot: unknown; literal: string }[]) {
    if (!isJobSnapshot(row.snapshot)) throw new EmbeddingStoreError("INVALID_SNAPSHOT");
    postings.push({
      snapshotId: row.snapshot_id,
      sourceId: row.source_id,
      snapshot: row.snapshot,
      vector: fromVectorLiteral({
        modelVersion, instructionVersion, role: "document", literal: row.literal, dim: 1024,
      }),
    });
  }
  return postings;
}

/**
 * Writes the profile's query vector. The composite foreign key to
 * candidate_profiles means this cannot create a vector for a profile version
 * that does not exist, and cannot outlive it either.
 */
export async function saveProfileEmbedding(pool: Pool, params: Readonly<{
  userId: string;
  profileVersion: number;
  profileTextVersion: string;
  vector: EmbeddingVector;
}>): Promise<void> {
  const { userId, profileVersion, profileTextVersion, vector } = params;
  if (vector.role !== "query") throw new EmbeddingStoreError("INVALID_VECTOR");
  try {
    await pool.query(`
      INSERT INTO profile_embeddings
        (user_id, profile_version, model_version, instruction_version, profile_text_version, embedding)
      VALUES ($1, $2, $3, $4, $5, $6::vector)
      ON CONFLICT (user_id, profile_version, model_version) DO UPDATE SET
        instruction_version = EXCLUDED.instruction_version,
        profile_text_version = EXCLUDED.profile_text_version,
        embedding = EXCLUDED.embedding,
        created_at = now()`, [
      userId, profileVersion, vector.modelVersion, vector.instructionVersion, profileTextVersion,
      toVectorLiteral(vector.values),
    ]);
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
      throw new EmbeddingStoreError("PROFILE_VERSION_NOT_FOUND");
    }
    throw error;
  }
}

export async function loadProfileEmbedding(pool: Pool, params: Readonly<{
  userId: string;
  profileVersion: number;
  modelVersion: string;
  instructionVersion: string;
  profileTextVersion: string;
}>): Promise<EmbeddingVector | null> {
  const result = await pool.query(`
    SELECT embedding::text AS literal FROM profile_embeddings
    WHERE user_id = $1 AND profile_version = $2 AND model_version = $3 AND instruction_version = $4
      AND profile_text_version = $5`,
  [params.userId, params.profileVersion, params.modelVersion, params.instructionVersion,
    params.profileTextVersion]);
  const row = result.rows[0] as { literal: string } | undefined;
  if (!row) return null;
  return fromVectorLiteral({
    modelVersion: params.modelVersion, instructionVersion: params.instructionVersion,
    role: "query", literal: row.literal, dim: 1024,
  });
}

/** Counts only — used by tests and by an operator checking that deletion worked. */
export async function countProfileEmbeddings(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM profile_embeddings WHERE user_id = $1", [userId],
  );
  return Number((result.rows[0] as { total: string }).total);
}

export async function countJobEmbeddings(pool: Pool, modelVersion: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM job_embeddings WHERE model_version = $1", [modelVersion],
  );
  return Number((result.rows[0] as { total: string }).total);
}
