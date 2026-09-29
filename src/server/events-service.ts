// Interaction journal service (design item A8).
//
// Writes are owner-scoped by construction: the caller passes the session user
// id, never a client-supplied one, and the table's foreign keys keep the rows
// attached to a real user and a real snapshot. There is no candidate-facing read
// path here on purpose: events feed ranking quality work (A9/A10, later LTR).
// The one reader is the seen-set service (item A6), which reads the journal back
// only to decide what the feed shows.
//
// Every statement is parameterised with $n placeholders and array parameters
// passed to unnest: no placeholder text is ever assembled from data, so there is
// no string-built SQL in this file at all (the write-time security gate flagged
// the earlier placeholder-joining version, and it was right to).
import type { Pool } from "pg";
import type { EventItem } from "../domain/events.ts";

type JournalRow = Readonly<{
  snapshotId: string;
  eventType: "impression" | "click";
  position: number | null;
  propensity: number | null;
  rankerVersion: string | null;
  /** Fingerprint of the content as shown; null for events that are not exposures. */
  shownContentHash: string | null;
}>;

async function insertRows(pool: Pool, userId: string, rows: readonly JournalRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await pool.query(
    `INSERT INTO job_events (user_id, snapshot_id, event_type, position, propensity, ranker_version, shown_content_hash)
     SELECT $1::text, item.snapshot_id, item.event_type, item.position, item.propensity, item.ranker_version, item.shown_content_hash
     FROM unnest(
       $2::text[], $3::text[], $4::int[], $5::numeric[], $6::text[], $7::text[]
     ) AS item (snapshot_id, event_type, position, propensity, ranker_version, shown_content_hash)`,
    [
      userId,
      rows.map(row => row.snapshotId),
      rows.map(row => row.eventType),
      rows.map(row => row.position),
      rows.map(row => row.propensity),
      rows.map(row => row.rankerVersion),
      rows.map(row => row.shownContentHash),
    ],
  );
  return result.rowCount ?? 0;
}

/**
 * Content fingerprints for the snapshots in a batch, read from the catalog
 * rather than trusted from the request. A snapshot that is missing here gets a
 * null fingerprint and then fails the insert on its foreign key — the caller
 * sees the same 404 as before, never a silently stored event.
 */
async function shownHashes(pool: Pool, snapshotIds: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
  const result = await pool.query(
    "SELECT id, content_hash FROM job_snapshots WHERE id = ANY($1::text[])",
    [snapshotIds],
  );
  const hashes = new Map<string, string | null>();
  for (const row of result.rows as readonly Record<string, unknown>[]) {
    hashes.set(String(row.id), row.content_hash === null ? null : String(row.content_hash));
  }
  return hashes;
}

/**
 * Impressions with their show-time propensities. Propensity is NULL while no
 * ranker is wired into the read path (item A10) — an unknown probability stays
 * unknown, it is never invented as 1.0. The content fingerprint records WHAT was
 * shown, which is what the seen-set rule (A6) compares against the posting's
 * fingerprint today.
 */
export async function recordImpressions(params: Readonly<{
  pool: Pool;
  userId: string;
  items: readonly EventItem[];
  rankerVersion: string | null;
}>): Promise<number> {
  const hashes = await shownHashes(params.pool, params.items.map(item => item.snapshotId));
  return insertRows(params.pool, params.userId, params.items.map(item => ({
    snapshotId: item.snapshotId,
    eventType: "impression" as const,
    position: item.position,
    propensity: item.propensity,
    rankerVersion: params.rankerVersion,
    shownContentHash: hashes.get(item.snapshotId) ?? null,
  })));
}

export async function recordClicks(params: Readonly<{
  pool: Pool;
  userId: string;
  items: readonly EventItem[];
  rankerVersion: string | null;
}>): Promise<number> {
  return insertRows(params.pool, params.userId, params.items.map(item => ({
    snapshotId: item.snapshotId,
    eventType: "click" as const,
    position: item.position,
    propensity: null,
    rankerVersion: params.rankerVersion,
    shownContentHash: null,
  })));
}

/** How many events this user has — used by tests and by the deletion path. */
export async function countEventsForUser(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query(
    "SELECT COUNT(*) AS total FROM job_events WHERE user_id = $1",
    [userId],
  );
  return Number((result.rows[0] as { total: string }).total);
}

/**
 * When this user last saw the feed: the newest impression in the journal. The
 * digest (item A7) uses it as its cursor — "new since my last look" needs no
 * second table, and a page render cannot move it (only a real feed render
 * writes impressions).
 */
export async function lastImpressionAt(pool: Pool, userId: string): Promise<string | null> {
  const result = await pool.query(
    "SELECT MAX(created_at) AS last_shown FROM job_events WHERE user_id = $1 AND event_type = 'impression'",
    [userId],
  );
  const value = (result.rows[0] as { last_shown: Date | null } | undefined)?.last_shown;
  return value === null || value === undefined ? null : new Date(value).toISOString();
}

/**
 * Profile deletion must leave no behavioural trace: the journal is deleted with
 * the profile, exactly like the CV text (minimisation, not just isolation).
 */
export async function deleteEventsForUser(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query("DELETE FROM job_events WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}
