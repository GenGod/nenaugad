// Live import orchestration for the Remote First Jobs source (S1-006).
// The feed is a WINDOW: the 500 newest jobs of the default query, pages 0 to 4 of 100,
// never a full snapshot. Every run is partial by definition, absence from the window
// is never treated as closure, and miss counters never grow (spec 14.3).
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import { runSnapshotImport } from "./pipeline.ts";
import { AdapterInputError } from "./himalayas-fixture.ts";
import {
  mapRemoteFirstJobsRecord, remoteFirstJobsExcerptOf, type RemoteFirstJobsRawRecord,
} from "./remote-first-jobs-fixture.ts";
import { REMOTE_FIRST_JOBS_MAX_PAGES, type FetchPageResult } from "./fetcher.ts";
import type { SnapshotPersistence } from "./himalayas-adapter.ts";

/** One page of the window, numbered from 0. */
export type RemoteFirstJobsTransport = (page: number) => Promise<FetchPageResult>;

/** The documented page size: a shorter page is the last one. */
export const REMOTE_FIRST_JOBS_PAGE_SIZE = 100;

export type RemoteFirstJobsReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "partial" | "retry_scheduled" | "aborted";
  pagesFetched: number;
  /**
   * How the page walk ended: a short page, the page cap, or a later page that
   * failed (the pages read before it are imported).
   */
  traversal: "complete" | "page_cap" | "interrupted" | null;
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  /** Records retention blanked into tombstones this run (RET-001). */
  tombstoned: number;
  nextEligibleAt: string | null;
}>;

export async function runRemoteFirstJobsImport(params: Readonly<{
  transport: RemoteFirstJobsTransport;
  persistence: SnapshotPersistence;
  policy: SourcePolicy;
  now: string;
  maxPages?: number;
}>): Promise<RemoteFirstJobsReport> {
  const { transport, persistence, policy, now } = params;
  // At least one page, never past the documented last one.
  const maxPages = Math.min(REMOTE_FIRST_JOBS_MAX_PAGES,
    Math.max(1, Math.floor(params.maxPages ?? REMOTE_FIRST_JOBS_MAX_PAGES)));
  const empty: RemoteFirstJobsReport = {
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

  const snapshots: JobSnapshot[] = [];
  const excerpts: Record<string, string> = {};
  let rejected = 0;
  let pagesFetched = 0;
  let traversal: "complete" | "page_cap" | "interrupted" = "page_cap";
  while (pagesFetched < maxPages) {
    const page = await transport(pagesFetched);
    if (page.status !== "ok") {
      // A failed first page imports nothing and does not use the window; a later
      // one keeps what was read, because a window run is partial anyway.
      if (pagesFetched === 0) return { ...empty, result: "retry_scheduled" };
      traversal = "interrupted";
      break;
    }
    pagesFetched += 1;
    for (const raw of page.jobs as readonly RemoteFirstJobsRawRecord[]) {
      try {
        const snapshot = mapRemoteFirstJobsRecord(raw, now);
        snapshots.push(snapshot);
        // A job repeated across pages (the window moves while it is read): the
        // pipeline keeps its first copy, and so does the excerpt.
        excerpts[snapshot.id] ??= remoteFirstJobsExcerptOf(snapshot);
      } catch (error) {
        if (error instanceof AdapterInputError) rejected += 1;
        else throw error;
      }
    }
    if (page.jobs.length < REMOTE_FIRST_JOBS_PAGE_SIZE) {
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
