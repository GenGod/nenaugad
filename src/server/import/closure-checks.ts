// Closure checks for Jobicy listings (spec 5.2, 14.3, 17). A record closes
// only after TWO consecutive 404/410 HEAD checks spaced by the check
// interval; unknown outcomes (429/5xx/network/redirect) never close, and a
// suspiciously inactive pass quarantines closures instead of mass-closing
// on a suspected breaking change. All SQL is inline fixed literals with $n
// parameters; cutoffs are computed in JS and passed as parameters.
import type { Pool } from "pg";

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const CLOSE_AFTER_CONSECUTIVE_INACTIVE = 2;
export const CHECKS_PER_HOUR = 25;
export const MASS_CLOSURE_FRACTION = 0.5;
export const MASS_CLOSURE_MIN_SAMPLE = 4;

export type CheckOutcome = "active" | "inactive" | "unknown";

export type ClosurePassReport = Readonly<{
  result: "ok" | "budget_exhausted" | "nothing_due" | "quarantined";
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

type CandidateRow = { id: string; source_url: string; consecutive_inactive: number };

export async function runClosureCheckPass(params: Readonly<{
  pool: Pool;
  now: string;
  head: (listingUrl: string) => Promise<{ result: CheckOutcome }>;
}>): Promise<ClosurePassReport> {
  const { pool, now, head } = params;
  const nowMs = Date.parse(now);
  // Rolling hourly budget persisted in the DB: a worker restart cannot
  // exceed the politeness ceiling.
  const used = await pool.query(
    "SELECT COUNT(*) AS used FROM closure_checks WHERE last_check_at > $1::timestamptz",
    [new Date(nowMs - 60 * 60 * 1000).toISOString()],
  );
  const budget = CHECKS_PER_HOUR - Number((used.rows[0] as { used: string }).used);
  if (budget <= 0) {
    return { result: "budget_exhausted", checked: 0, inactive: 0, unknown: 0, closed: 0 };
  }
  // Candidates: active jobicy records not seen in the latest window
  // (last_seen older than the check interval) and not checked within it.
  const checkCutoff = new Date(nowMs - CHECK_INTERVAL_MS).toISOString();
  const candidates = await pool.query<CandidateRow>(
    "SELECT j.id, (j.snapshot->>'source_url') AS source_url, COALESCE(c.consecutive_inactive, 0) AS consecutive_inactive FROM job_snapshots j LEFT JOIN closure_checks c ON c.snapshot_id = j.id WHERE j.source_id = $4 AND j.snapshot->>'lifecycle' = 'active' AND (j.snapshot#>>'{dates,last_seen_at}')::timestamptz < $1::timestamptz AND (c.snapshot_id IS NULL OR c.last_check_at < $2::timestamptz) ORDER BY (j.snapshot#>>'{dates,last_seen_at}')::timestamptz ASC LIMIT $3",
    [checkCutoff, checkCutoff, budget, "jobicy"],
  );
  const checked = candidates.rowCount ?? 0;
  if (checked === 0) {
    return { result: "nothing_due", checked: 0, inactive: 0, unknown: 0, closed: 0 };
  }

  let inactive = 0;
  let unknown = 0;
  const closable: string[] = [];
  for (const row of candidates.rows) {
    const { result } = await head(row.source_url);
    const streak = nextCounters({
      previousConsecutiveInactive: Number(row.consecutive_inactive), outcome: result,
    });
    if (result === "inactive") inactive += 1;
    if (result === "unknown") unknown += 1;
    await pool.query(
      "INSERT INTO closure_checks (snapshot_id, last_check_at, last_result, consecutive_inactive) VALUES ($1, $2, $3, $4) ON CONFLICT (snapshot_id) DO UPDATE SET last_check_at = EXCLUDED.last_check_at, last_result = EXCLUDED.last_result, consecutive_inactive = EXCLUDED.consecutive_inactive",
      [row.id, now, result, streak],
    );
    if (streak >= CLOSE_AFTER_CONSECUTIVE_INACTIVE) closable.push(row.id);
  }

  // A pass dominated by inactivity smells like a breaking change, not 200+
  // genuine closures: record the checks but apply nothing (spec 17).
  if (shouldQuarantine({ checked, inactive })) {
    return { result: "quarantined", checked, inactive, unknown, closed: 0 };
  }
  for (const id of closable) {
    // Provenance and dates stay untouched; only the lifecycle moves.
    await pool.query(
      "UPDATE job_snapshots SET snapshot = jsonb_set(snapshot, '{lifecycle}', $2::jsonb) WHERE id = $1 AND snapshot->>'lifecycle' = 'active'",
      [id, JSON.stringify("closed")],
    );
  }
  return { result: "ok", checked, inactive, unknown, closed: closable.length };
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
