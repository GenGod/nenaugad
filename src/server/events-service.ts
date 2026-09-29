// Interaction journal service (design item A8).
//
// Writes are owner-scoped by construction: the caller passes the session user
// id, never a client-supplied one, and the table's foreign keys keep the rows
// attached to a real user and a real snapshot. There is no read path here on
// purpose: events feed ranking quality work (A9/A10, later LTR), and nothing in
// the candidate-facing UI reads them back.
//
// Every insert is ONE statement built from array parameters via unnest: no
// placeholder text is ever assembled from data, so there is no string-built SQL
// in this file at all (the write-time security gate flagged the earlier
// placeholder-joining version, and it was right to).
import type { Pool } from "pg";
import type { EventItem } from "../domain/events.ts";

type JournalRow = Readonly<{
  snapshotId: string;
  eventType: "impression" | "click";
  position: number | null;
  propensity: number | null;
  rankerVersion: string | null;
}>;

async function insertRows(pool: Pool, userId: string, rows: readonly JournalRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await pool.query(
    `INSERT INTO job_events (user_id, snapshot_id, event_type, position, propensity, ranker_version)
     SELECT $1::text, item.snapshot_id, item.event_type, item.position, item.propensity, item.ranker_version
     FROM unnest(
       $2::text[], $3::text[], $4::int[], $5::numeric[], $6::text[]
     ) AS item (snapshot_id, event_type, position, propensity, ranker_version)`,
    [
      userId,
      rows.map(row => row.snapshotId),
      rows.map(row => row.eventType),
      rows.map(row => row.position),
      rows.map(row => row.propensity),
      rows.map(row => row.rankerVersion),
    ],
  );
  return result.rowCount ?? 0;
}

/**
 * Impressions with their show-time propensities. Propensity is NULL while no
 * ranker is wired into the read path (item A10) — an unknown probability stays
 * unknown, it is never invented as 1.0.
 */
export async function recordImpressions(params: Readonly<{
  pool: Pool;
  userId: string;
  items: readonly EventItem[];
  rankerVersion: string | null;
}>): Promise<number> {
  return insertRows(params.pool, params.userId, params.items.map(item => ({
    snapshotId: item.snapshotId,
    eventType: "impression" as const,
    position: item.position,
    propensity: item.propensity,
    rankerVersion: params.rankerVersion,
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
 * Profile deletion must leave no behavioural trace: the journal is deleted with
 * the profile, exactly like the CV text (minimisation, not just isolation).
 */
export async function deleteEventsForUser(pool: Pool, userId: string): Promise<number> {
  const result = await pool.query("DELETE FROM job_events WHERE user_id = $1", [userId]);
  return result.rowCount ?? 0;
}
