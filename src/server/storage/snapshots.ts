// PostgreSQL persistence for imported job snapshots (migration 0002).
// Accepts a pg Pool-like client so integration tests and the CLI share
// exactly one implementation. Full text is stored (allowed by policy) but
// the read path only ever exposes the excerpt + attribution. All SQL uses
// fixed literals with $n parameters; no user input is ever concatenated.
import { Pool } from "pg";
import { isJobSnapshot, type SourcePolicy } from "../../domain/source-contracts.ts";
import type { ClosureSignal } from "../../domain/ev-multipliers.ts";
import type { SnapshotStore, StoredSnapshot } from "../../domain/snapshot-projection.ts";
import type { ImportState, SnapshotPersistence } from "../import/himalayas-adapter.ts";
import { localDatabaseUrl } from "../config.ts";

type Row = Record<string, unknown>;

function toStored(row: Row): StoredSnapshot | null {
  const snapshot = row.snapshot;
  if (!isJobSnapshot(snapshot)) return null;
  return {
    sourceId: String(row.source_id),
    snapshot,
    contentHash: String(row.content_hash),
    firstSeenAt: new Date(row.first_seen_at as Date).toISOString(),
    fullPassMisses: Number(row.full_pass_misses),
    tombstonedAt: row.tombstoned_at === null || row.tombstoned_at === undefined
      ? null
      : new Date(row.tombstoned_at as Date).toISOString(),
  };
}

export function createPostgresPersistence(pool: Pool, policy: SourcePolicy): SnapshotPersistence {
  const sourceId = policy.source_id;
  const retentionHours = policy.max_retention_hours ?? 720;
  return {
    async loadImportState(): Promise<ImportState | null> {
      const result = await pool.query(
        "SELECT last_run_at, next_cursor, run_count, last_attempt_at, consecutive_failures FROM import_state WHERE source_id = $1",
        [sourceId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
        nextCursor: typeof row.next_cursor === "string" ? row.next_cursor : null,
        runCount: Number(row.run_count),
        lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).toISOString() : null,
        consecutiveFailures: Number(row.consecutive_failures ?? 0),
      };
    },
    async saveImportState(state: ImportState): Promise<void> {
      await pool.query(
        "INSERT INTO import_state (source_id, last_run_at, next_cursor, run_count) VALUES ($1, $2, $3, $4) ON CONFLICT (source_id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at, next_cursor = EXCLUDED.next_cursor, run_count = EXCLUDED.run_count",
        [sourceId, state.lastRunAt, state.nextCursor, state.runCount],
      );
    },
    async recordAttempt(success: boolean, now: string): Promise<void> {
      await pool.query(
        "INSERT INTO import_state (source_id, last_attempt_at, consecutive_failures) VALUES ($1, $2, $3) ON CONFLICT (source_id) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at, consecutive_failures = CASE WHEN $4::boolean THEN 0 ELSE import_state.consecutive_failures + 1 END",
        [sourceId, now, success ? 0 : 1, success],
      );
    },
    async resumeAttempts(): Promise<void> {
      await pool.query(
        "UPDATE import_state SET consecutive_failures = 0 WHERE source_id = $1",
        [sourceId],
      );
    },
    async loadStore(): Promise<{ store: SnapshotStore; excerpts: Record<string, string> }> {
      const result = await pool.query(
        "SELECT id, source_id, content_hash, first_seen_at, full_pass_misses, excerpt, snapshot, tombstoned_at FROM job_snapshots WHERE source_id = $1",
        [sourceId],
      );
      const records: Record<string, StoredSnapshot> = {};
      const excerpts: Record<string, string> = {};
      for (const row of result.rows) {
        const stored = toStored(row as Row);
        if (!stored) continue; // corrupt row: skipped for reading, never silently rewritten
        records[stored.snapshot.id] = stored;
        excerpts[stored.snapshot.id] = String((row as Row).excerpt ?? "");
      }
      return { store: { records, lastFullPassAt: null }, excerpts };
    },
    async saveStore(store: SnapshotStore, excerpts: Record<string, string>): Promise<void> {
      // `excerpts` holds the records this run fetched; every other stored record keeps its
      // excerpt, as the in-memory persistence always did (docs/OPEN_GAPS.md B30). Writing
      // "" for them blanked the card of every posting an import did not see.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const stored of Object.values(store.records)) {
          const id = stored.snapshot.id;
          await client.query(
            "INSERT INTO job_snapshots (id, source_id, content_hash, first_seen_at, full_pass_misses, excerpt, snapshot, tombstoned_at) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT (id) DO UPDATE SET content_hash = EXCLUDED.content_hash, full_pass_misses = EXCLUDED.full_pass_misses, excerpt = CASE WHEN $9::boolean THEN EXCLUDED.excerpt ELSE job_snapshots.excerpt END, snapshot = EXCLUDED.snapshot, tombstoned_at = EXCLUDED.tombstoned_at",
            [id, sourceId, stored.contentHash, stored.firstSeenAt,
              stored.fullPassMisses, excerpts[id] ?? "",
              JSON.stringify(stored.snapshot), stored.tombstonedAt ?? null, Object.hasOwn(excerpts, id)],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async tombstoneExpired(now: string): Promise<number> {
      // Retention (RET-001, owner decision No 4): a row past the policy window
      // becomes a tombstone instead of disappearing — identifiers, dates and the
      // content hash stay (dedup and history keep their trace; the candidate's
      // journal rows are not cascaded away before their own TTL), while the
      // posting's prose is blanked and the lifecycle says why. The derived
      // vectors go: they were computed from text that no longer exists.
      const lastSeenCutoff = new Date(Date.parse(now) - retentionHours * 3600 * 1000);
      const expiryCutoff = new Date(Date.parse(now) - 7 * 24 * 3600 * 1000);
      const result = await pool.query(
        `UPDATE job_snapshots SET
           tombstoned_at = $1,
           excerpt = '',
           snapshot = jsonb_set(jsonb_set(jsonb_set(snapshot, '{title}', '""'::jsonb), '{company_name}', '""'::jsonb), '{description_text}', '""'::jsonb) || jsonb_build_object('lifecycle', 'tombstoned')
         WHERE source_id = $2 AND tombstoned_at IS NULL
           AND ((snapshot#>>'{dates,last_seen_at}')::timestamptz < $3
             OR ((snapshot#>>'{dates,expires_at}') IS NOT NULL AND (snapshot#>>'{dates,expires_at}')::timestamptz < $4))`,
        [now, sourceId, lastSeenCutoff.toISOString(), expiryCutoff.toISOString()],
      );
      const tombstoned = result.rowCount ?? 0;
      if (tombstoned > 0) {
        await pool.query(
          "DELETE FROM job_embeddings WHERE snapshot_id IN (SELECT id FROM job_snapshots WHERE source_id = $1 AND tombstoned_at = $2)",
          [sourceId, now],
        );
      }
      return tombstoned;
    },
  };
}

export type SnapshotCardRecord = Readonly<{
  stored: StoredSnapshot;
  excerpt: string;
  /**
   * Availability signal from the closure checks (item A10), or null when no check
   * has run. Read together with the card so ranking and the candidate-facing note
   * use the same fact.
   */
  closure: ClosureSignal | null;
}>;

export async function readSnapshotCardsData(
  pool: Pool, sourceId: string,
): Promise<readonly SnapshotCardRecord[]> {
  const result = await pool.query(
    "SELECT j.id, j.source_id, j.content_hash, j.first_seen_at, j.full_pass_misses, j.excerpt, j.snapshot, c.last_result, c.consecutive_inactive FROM job_snapshots j LEFT JOIN closure_checks c ON c.snapshot_id = j.id WHERE j.source_id = $1",
    [sourceId],
  );
  const rows: SnapshotCardRecord[] = [];
  for (const row of result.rows) {
    const stored = toStored(row as Row);
    if (stored) {
      rows.push({
        stored,
        excerpt: String((row as Row).excerpt ?? ""),
        closure: toClosureSignal(row as Row),
      });
    }
  }
  return rows;
}

/** Closure signals are optional (a source without availability checks has none). */
function toClosureSignal(row: Row): ClosureSignal | null {
  const lastResult = row.last_result;
  if (lastResult !== "active" && lastResult !== "inactive" && lastResult !== "unknown") return null;
  return { lastResult, consecutiveInactive: Number(row.consecutive_inactive ?? 0) };
}

const globalPool = globalThis as typeof globalThis & { nenaugadSnapshotPool?: Pool };

export function snapshotPool(): Pool {
  const url = localDatabaseUrl(process.env.DATABASE_URL);
  if (!globalPool.nenaugadSnapshotPool) {
    globalPool.nenaugadSnapshotPool = new Pool({ connectionString: url, max: 5 });
    globalPool.nenaugadSnapshotPool.on("error", () => {
      // Idle client errors must not crash the process; read paths fail closed.
    });
  }
  return globalPool.nenaugadSnapshotPool;
}
