// Seen-set application for the feed (design item A6, seen-set part).
//
// The registry of what a candidate was shown is not a new table: it is a
// question asked of the interaction journal (migration 0014), because "shown at
// time T with this content" is a fact the journal already owns. Storing a second
// copy of it would create the thing this project avoids — two sources of truth
// for one fact, and a deletion path that can miss one of them. Deleting the
// profile already deletes the journal, so the seen state disappears with it.
//
// Reads are owner-scoped by construction: the user id comes from the session
// (via the service caller), never from a request payload, and every statement
// filters on it.
import type { Pool } from "pg";
import { decideSeen, type SeenJournalState } from "../domain/seen-set.ts";

/** One posting the feed is considering, with its fingerprint today. */
export type SeenCandidate = Readonly<{ snapshotId: string; contentHash: string | null }>;

/**
 * Last exposure of each posting for this user. `DISTINCT ON` keeps the newest
 * impression per snapshot; clicks are read separately because a click is an
 * action, not an exposure.
 */
export async function seenStatesForUser(pool: Pool, userId: string): Promise<ReadonlyMap<string, SeenJournalState>> {
  const result = await pool.query(
    `SELECT DISTINCT ON (snapshot_id) snapshot_id, created_at, shown_content_hash
     FROM job_events
     WHERE user_id = $1 AND event_type = 'impression'
     ORDER BY snapshot_id, created_at DESC`,
    [userId],
  );
  const states = new Map<string, SeenJournalState>();
  for (const row of result.rows as readonly Record<string, unknown>[]) {
    states.set(String(row.snapshot_id), {
      lastShownAt: new Date(row.created_at as Date).toISOString(),
      shownContentHash: row.shown_content_hash === null ? null : String(row.shown_content_hash),
    });
  }
  return states;
}

/**
 * Postings this user did something about: a click in the journal or a save.
 * An explicit hide is not here — hides are permanent and handled by their own
 * table before the seen rule is consulted.
 */
export async function actedSnapshotIds(pool: Pool, userId: string): Promise<ReadonlySet<string>> {
  const result = await pool.query(
    `SELECT DISTINCT snapshot_id FROM job_events WHERE user_id = $1 AND event_type = 'click'
     UNION SELECT snapshot_id FROM saved_jobs WHERE user_id = $1`,
    [userId],
  );
  const acted = new Set<string>();
  for (const row of result.rows as readonly Record<string, unknown>[]) acted.add(String(row.snapshot_id));
  return acted;
}

/**
 * The postings to keep out of this user's feed right now. Two queries and one
 * pure rule per candidate; the rule itself lives in src/domain/seen-set.ts so it
 * is testable without a database.
 */
export async function suppressedSnapshotIds(params: Readonly<{
  pool: Pool;
  userId: string;
  now: string;
  candidates: readonly SeenCandidate[];
}>): Promise<ReadonlySet<string>> {
  if (params.candidates.length === 0) return new Set();
  const [states, acted] = await Promise.all([
    seenStatesForUser(params.pool, params.userId),
    actedSnapshotIds(params.pool, params.userId),
  ]);
  const suppressed = new Set<string>();
  for (const candidate of params.candidates) {
    const outcome = decideSeen({
      state: states.get(candidate.snapshotId),
      contentHash: candidate.contentHash,
      acted: acted.has(candidate.snapshotId),
      now: params.now,
    });
    if (outcome.suppress) suppressed.add(candidate.snapshotId);
  }
  return suppressed;
}
