// Closure checks for Jobicy listings (spec 5.2, 14.3, 17; B56-001). Jobicy's
// batch status endpoint answers active, closed or unknown for up to 100 stored
// IDs per request. A record closes only after TWO consecutive `closed` answers
// spaced by the check interval; unknown answers and failed requests never close,
// and a suspiciously inactive pass quarantines closures instead of mass-closing
// on a suspected breaking change. At most one pass an hour, as the source asks.
// All SQL is inline fixed literals with $n parameters; cutoffs are computed in
// JS and passed as parameters.
import type { Pool } from "pg";

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const CLOSE_AFTER_CONSECUTIVE_INACTIVE = 2;
/** The source asks for status synchronization "hourly or less often". */
export const MIN_PASS_INTERVAL_MS = 60 * 60 * 1000;
/** The status endpoint's documented maximum of IDs per request. */
export const IDS_PER_REQUEST = 100;
export const MAX_REQUESTS_PER_PASS = 5;
export const MASS_CLOSURE_FRACTION = 0.5;
export const MASS_CLOSURE_MIN_SAMPLE = 4;

export type CheckOutcome = "active" | "inactive" | "unknown";

/** One status request for up to IDS_PER_REQUEST Jobicy IDs (fetchJobicyStatuses). */
export type StatusCheck = (ids: readonly number[]) => Promise<
  | Readonly<{ status: "ok"; outcomes: ReadonlyMap<number, CheckOutcome> }>
  | Readonly<{ status: "rate_limited" | "server_error" | "network_error" }>
>;

export type ClosurePassReport = Readonly<{
  result: "ok" | "budget_exhausted" | "nothing_due" | "quarantined" | "deferred";
  requests: number;
  checked: number;
  inactive: number;
  unknown: number;
  closed: number;
}>;

// Pure counter transition: active resets the streak, unknown is neutral.
export function nextCounters(params: Readonly<{
  previousConsecutiveInactive: number; outcome: CheckOutcome;
}>): number {
  if (params.outcome === "active") return 0;
  if (params.outcome === "inactive") return params.previousConsecutiveInactive + 1;
  return params.previousConsecutiveInactive;
}

export function shouldQuarantine(params: Readonly<{
  checked: number; inactive: number;
}>): boolean {
  return params.checked >= MASS_CLOSURE_MIN_SAMPLE &&
    params.inactive / params.checked > MASS_CLOSURE_FRACTION;
}

/** The numeric Jobicy ID of a stored record (`jobicy:<id>`), or null. */
export function jobicyIdOf(snapshotId: string): number | null {
  const match = /^jobicy:(\d{1,15})$/u.exec(snapshotId);
  const id = match ? Number(match[1]) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type CandidateRow = { id: string; consecutive_inactive: number };

export async function runClosureCheckPass(params: Readonly<{
  pool: Pool;
  now: string;
  check: StatusCheck;
}>): Promise<ClosurePassReport> {
  const { pool, now, check } = params;
  const nowMs = Date.parse(now);
  const empty = { requests: 0, checked: 0, inactive: 0, unknown: 0, closed: 0 };
  // One pass an hour, persisted in the DB: a worker restart cannot run a
  // second pass early.
  const recent = await pool.query(
    "SELECT EXISTS (SELECT 1 FROM closure_checks WHERE last_check_at > $1::timestamptz) AS recent",
    [new Date(nowMs - MIN_PASS_INTERVAL_MS).toISOString()],
  );
  if ((recent.rows[0] as { recent: boolean }).recent) {
    return { result: "budget_exhausted", ...empty };
  }
  // Candidates: active jobicy records not seen in the latest window
  // (last_seen older than the check interval) and not checked within it.
  const checkCutoff = new Date(nowMs - CHECK_INTERVAL_MS).toISOString();
  const candidates = await pool.query<CandidateRow>(
    "SELECT j.id, COALESCE(c.consecutive_inactive, 0) AS consecutive_inactive FROM job_snapshots j LEFT JOIN closure_checks c ON c.snapshot_id = j.id WHERE j.source_id = $4 AND j.snapshot->>'lifecycle' = 'active' AND (j.snapshot#>>'{dates,last_seen_at}')::timestamptz < $1::timestamptz AND (c.snapshot_id IS NULL OR c.last_check_at < $2::timestamptz) ORDER BY (j.snapshot#>>'{dates,last_seen_at}')::timestamptz ASC, j.id ASC LIMIT $3",
    [checkCutoff, checkCutoff, IDS_PER_REQUEST * MAX_REQUESTS_PER_PASS, "jobicy"],
  );
  if (candidates.rows.length === 0) return { result: "nothing_due", ...empty };

  let requests = 0;
  let checked = 0;
  let inactive = 0;
  let unknown = 0;
  let deferred = false;
  const closable: string[] = [];
  for (let start = 0; start < candidates.rows.length && !deferred; start += IDS_PER_REQUEST) {
    const batch = candidates.rows.slice(start, start + IDS_PER_REQUEST);
    const ids = batch.map(row => jobicyIdOf(row.id)).filter((id): id is number => id !== null);
    let outcomes: ReadonlyMap<number, CheckOutcome> = new Map();
    if (ids.length > 0) {
      requests += 1;
      const answer = await check(ids);
      // A failed request (429, 5xx, network) ends the pass: its batch is
      // recorded as unknown, so the hourly gate holds and those IDs wait their
      // interval; the rest stay due for the next pass.
      if (answer.status === "ok") outcomes = answer.outcomes;
      else deferred = true;
    }
    for (const row of batch) {
      const id = jobicyIdOf(row.id);
      const result: CheckOutcome = id === null ? "unknown" : outcomes.get(id) ?? "unknown";
      const streak = nextCounters({
        previousConsecutiveInactive: Number(row.consecutive_inactive), outcome: result,
      });
      checked += 1;
      if (result === "inactive") inactive += 1;
      if (result === "unknown") unknown += 1;
      await pool.query(
        "INSERT INTO closure_checks (snapshot_id, last_check_at, last_result, consecutive_inactive) VALUES ($1, $2, $3, $4) ON CONFLICT (snapshot_id) DO UPDATE SET last_check_at = EXCLUDED.last_check_at, last_result = EXCLUDED.last_result, consecutive_inactive = EXCLUDED.consecutive_inactive",
        [row.id, now, result, streak],
      );
      // Only a `closed` answer in this pass can close: a record whose streak
      // reached the threshold in a held-back pass (quarantined or deferred)
      // keeps it through `unknown`, and an `unknown` must never close (B56-001
      // review).
      if (result === "inactive" && streak >= CLOSE_AFTER_CONSECUTIVE_INACTIVE) {
        closable.push(row.id);
      }
    }
  }

  // A pass cut short by a failed request closes nothing: a record whose streak
  // reached the threshold closes at its next `closed` answer instead.
  if (deferred) {
    return { result: "deferred", requests, checked, inactive, unknown, closed: 0 };
  }
  // A pass dominated by inactivity smells like a breaking change, not 200+
  // genuine closures: record the checks but apply nothing (spec 17).
  if (shouldQuarantine({ checked, inactive })) {
    return { result: "quarantined", requests, checked, inactive, unknown, closed: 0 };
  }
  for (const id of closable) {
    // Provenance and dates stay untouched; only the lifecycle moves.
    await pool.query(
      "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{lifecycle}', $2::jsonb) WHERE id = $1 AND snapshot->>'lifecycle' = 'active'",
      [id, JSON.stringify("closed")],
    );
  }
  return { result: "ok", requests, checked, inactive, unknown, closed: closable.length };
}

export async function closureStatus(pool: Pool): Promise<Record<string, number>> {
  const tracked = await pool.query(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN last_result = $1 THEN 1 ELSE 0 END) AS inactive_last, SUM(CASE WHEN last_result = $2 THEN 1 ELSE 0 END) AS unknown_last FROM closure_checks",
    ["inactive", "unknown"],
  );
  const closed = await pool.query(
    "SELECT COUNT(*) AS closed FROM job_snapshots WHERE source_id = $1 AND snapshot->>'lifecycle' = $2",
    ["jobicy", "closed"],
  );
  const row = tracked.rows[0] as Record<string, string | number | null>;
  return {
    tracked: Number(row.total ?? 0),
    lastInactive: Number(row.inactive_last ?? 0),
    lastUnknown: Number(row.unknown_last ?? 0),
    closedJobicy: Number((closed.rows[0] as { closed: string }).closed),
  };
}
