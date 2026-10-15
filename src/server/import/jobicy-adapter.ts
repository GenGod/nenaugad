// Live import orchestration for the owner-approved Jobicy source.
// The feed is a 7-DAY WINDOW, read page by page with its cursor (B57-001), never
// a full snapshot: every run is partial by definition, absence from the window
// is never treated as closure, and miss counters never grow (spec 14.3).
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import { runSnapshotImport } from "./pipeline.ts";
import { AdapterInputError } from "./himalayas-fixture.ts";
import { mapJobicyRecord, jobicyExcerptOf, type JobicyRawRecord } from "./jobicy-fixture.ts";
import type { JobicyWindowResult } from "./fetcher.ts";
import type { SnapshotPersistence } from "./himalayas-adapter.ts";

/** One page of the window; `cursor` is null for the first page. */
export type JobicyTransport = (cursor: string | null) => Promise<JobicyWindowResult>;

/** At most 2,000 jobs and 10 requests per run, every 6 hours at most. */
export const DEFAULT_MAX_JOBICY_PAGES = 10;

export type JobicyReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "partial" | "retry_scheduled" | "aborted";
  pagesFetched: number;
  /**
   * How the page walk ended: the last page reached, the page cap, or a later
   * page that failed (the pages read before it are imported).
   */
  traversal: "complete" | "page_cap" | "interrupted" | null;
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  /** Records retention blanked into tombstones this run (RET-001). */
  tombstoned: number;
  nextEligibleAt: string | null;
}>;

export async function runJobicyImport(params: Readonly<{
  transport: JobicyTransport;
  persistence: SnapshotPersistence;
  policy: SourcePolicy;
  now: string;
  maxPages?: number;
}>): Promise<JobicyReport> {
  const { transport, persistence, policy, now } = params;
  // At least one page: a run that reads nothing must not use the window.
  const maxPages = Math.max(1, Math.floor(params.maxPages ?? DEFAULT_MAX_JOBICY_PAGES));
  const empty: JobicyReport = {
    result: "refused_disabled", pagesFetched: 0, traversal: null,
    recordsMapped: 0, recordsRejected: 0,
    changes: [], tombstoned: 0, nextEligibleAt: null,
  };
  if (permissionFor(policy, "fetch", now) !== "allowed") return empty;

  const state = await persistence.loadImportState();
  const intervalMs = policy.min_poll_interval_seconds * 1000;
  if (state?.lastRunAt && Date.parse(now) - Date.parse(state.lastRunAt) < intervalMs - 60_000) {
    return { ...empty, result: "refused_poll_interval",
      nextEligibleAt: new Date(Date.parse(state.lastRunAt) + intervalMs).toISOString() };
  }

  // Pages follow each other sequentially, as the source asks; the cursor is
  // passed back unchanged and the page size stays the same.
  const snapshots: JobSnapshot[] = [];
  const excerpts: Record<string, string> = {};
  let rejected = 0;
  let pagesFetched = 0;
  let cursor: string | null = null;
  let traversal: "complete" | "page_cap" | "interrupted" = "page_cap";
  while (pagesFetched < maxPages) {
    const page = await transport(cursor);
    if (page.status !== "ok") {
      // A failed first page imports nothing and does not use the window; a later
      // one keeps what was read, because a Jobicy run is partial anyway.
      if (pagesFetched === 0) return { ...empty, result: "retry_scheduled" };
      traversal = "interrupted";
      break;
    }
    pagesFetched += 1;
    for (const raw of page.jobs as readonly JobicyRawRecord[]) {
      try {
        const snapshot = mapJobicyRecord(raw, now);
        snapshots.push(snapshot);
        // A job repeated across pages: the pipeline keeps its first copy, and so
        // does the excerpt.
        excerpts[snapshot.id] ??= jobicyExcerptOf(raw);
      } catch (error) {
        if (error instanceof AdapterInputError) rejected += 1;
        else throw error;
      }
    }
    cursor = page.nextCursor ?? null;
    if (cursor === null) {
      traversal = "complete";
      break;
    }
  }

  const { store } = await persistence.loadStore();
  // A window is never a complete snapshot: complete=false keeps absent
  // records untouched and never stale.
  const imported = runSnapshotImport({
    store,
    outcome: { status: "ok", complete: false, records: snapshots },
    attempt: 1,
    maxAttempts: 1,
    now,
  });
  await persistence.saveStore(imported.store, excerpts);
  const tombstoned = await persistence.tombstoneExpired(now);
  await persistence.saveImportState({
    lastRunAt: now,
    nextCursor: null,
    runCount: (state?.runCount ?? 0) + 1,
  });
  return {
    result: "partial",
    pagesFetched,
    traversal,
    recordsMapped: snapshots.length,
    recordsRejected: rejected,
    changes: imported.changes,
    tombstoned,
    nextEligibleAt: null,
  };
}
