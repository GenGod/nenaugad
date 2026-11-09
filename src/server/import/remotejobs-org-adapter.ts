// Live import orchestration for the RemoteJobs.org source (S1-007).
// The feed is a WINDOW: the newest postings of workArrangement=remote, 50 a page, at
// most 20 pages a run (owner decision 4 of 2026-11-07), never a full snapshot. Every run
// is partial by definition, absence from the window is never treated as closure, and
// miss counters never grow (spec 14.3). A page whose postings were all stored before
// this run ends the walk: the feed is newest first, so what follows was read already.
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import { runSnapshotImport } from "./pipeline.ts";
import { AdapterInputError } from "./himalayas-fixture.ts";
import {
  mapRemoteJobsOrgRecord, remoteJobsOrgExcerptOf, type RemoteJobsOrgRawRecord,
} from "./remotejobs-org-fixture.ts";
import {
  REMOTE_JOBS_ORG_MAX_PAGES, REMOTE_JOBS_ORG_PAGE_SIZE, type RemoteJobsOrgPageResult,
} from "./fetcher.ts";
import type { SnapshotPersistence } from "./himalayas-adapter.ts";

/** One page of the window, by its offset (0, 50, 100, …). */
export type RemoteJobsOrgTransport = (offset: number) => Promise<RemoteJobsOrgPageResult>;

type FailedPageResult = Exclude<RemoteJobsOrgPageResult, { status: "ok" }>;

/**
 * The page that ended the walk by failing, and why (B73): its offset, the outcome, the
 * fetcher's reason code, the HTTP status when a response arrived and the runtime's code
 * for a failed connection. A 429's wait is the report's `nextEligibleAt`.
 */
export type RemoteJobsOrgFailedPage = Readonly<{
  offset: number;
  status: FailedPageResult["status"];
  reason?: Exclude<FailedPageResult, { status: "rate_limited" }>["reason"];
  httpStatus?: number;
  errorCode?: string;
}>;

// Field by field, so nothing else a failure object carries reaches the report or a log.
function failedPageOf(offset: number, page: FailedPageResult): RemoteJobsOrgFailedPage {
  if (page.status === "rate_limited") return { offset, status: page.status };
  return {
    offset, status: page.status, reason: page.reason,
    ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
    ...(page.status === "network_error" && page.errorCode !== undefined ? { errorCode: page.errorCode } : {}),
  };
}

/**
 * The wait after a 429 that names none: the API limits requests per hour, so an hour
 * is the longest a window can still be closed.
 */
export const REMOTE_JOBS_ORG_DEFAULT_RETRY_AFTER_SECONDS = 3600;

export type RemoteJobsOrgReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "partial" | "retry_scheduled" | "aborted";
  pagesFetched: number;
  /**
   * How the page walk ended: the feed's end (a short or empty page, or no more pages),
   * a page already stored, the page cap, or a later page that failed (the pages read
   * before it are imported).
   */
  traversal: "complete" | "seen" | "page_cap" | "interrupted" | null;
  /** Null unless a page failed: the first page (`retry_scheduled`) or a later one (`interrupted`). */
  failedPage: RemoteJobsOrgFailedPage | null;
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  /** Records retention blanked into tombstones this run (RET-001). */
  tombstoned: number;
  nextEligibleAt: string | null;
}>;

export async function runRemoteJobsOrgImport(params: Readonly<{
  transport: RemoteJobsOrgTransport;
  persistence: SnapshotPersistence;
  policy: SourcePolicy;
  now: string;
  maxPages?: number;
}>): Promise<RemoteJobsOrgReport> {
  const { transport, persistence, policy, now } = params;
  // At least one page, never past the decided cap.
  const maxPages = Math.min(REMOTE_JOBS_ORG_MAX_PAGES,
    Math.max(1, Math.floor(params.maxPages ?? REMOTE_JOBS_ORG_MAX_PAGES)));
  const empty: RemoteJobsOrgReport = {
    result: "refused_disabled", pagesFetched: 0, traversal: null, failedPage: null,
    recordsMapped: 0, recordsRejected: 0,
    changes: [], tombstoned: 0, nextEligibleAt: null,
  };
  // Not activated (enabled false, as committed), pending, revoked or expired: nothing is requested.
  if (permissionFor(policy, "fetch", now) !== "allowed") return empty;

  const state = await persistence.loadImportState();
  const intervalMs = policy.min_poll_interval_seconds * 1000;
  if (state?.lastRunAt && Date.parse(now) - Date.parse(state.lastRunAt) < intervalMs - 60_000) {
    return { ...empty, result: "refused_poll_interval",
      nextEligibleAt: new Date(Date.parse(state.lastRunAt) + intervalMs).toISOString() };
  }
  // The wait a 429 asked for holds across runs and restarts (the scheduler reads it too).
  if (state?.retryNotBefore && Date.parse(now) < Date.parse(state.retryNotBefore)) {
    return { ...empty, result: "refused_poll_interval", nextEligibleAt: state.retryNotBefore };
  }

  const { store } = await persistence.loadStore();
  const storedBefore = new Set(Object.keys(store.records));
  const snapshots: JobSnapshot[] = [];
  const excerpts: Record<string, string> = {};
  let rejected = 0;
  let pagesFetched = 0;
  let retryNotBefore: string | null = null;
  let failedPage: RemoteJobsOrgFailedPage | null = null;
  let traversal: "complete" | "seen" | "page_cap" | "interrupted" = "page_cap";
  while (pagesFetched < maxPages) {
    const offset = pagesFetched * REMOTE_JOBS_ORG_PAGE_SIZE;
    const page = await transport(offset);
    if (page.status !== "ok") {
      failedPage = failedPageOf(offset, page);
      if (page.status === "rate_limited") {
        const seconds = page.retryAfterSeconds ?? REMOTE_JOBS_ORG_DEFAULT_RETRY_AFTER_SECONDS;
        retryNotBefore = new Date(Date.parse(now) + seconds * 1000).toISOString();
      }
      // A failed first page imports nothing and does not use the window (a 429 still
      // records its wait); a later one keeps what was read, a window run being partial.
      if (pagesFetched === 0) {
        if (retryNotBefore !== null) {
          await persistence.saveImportState({
            lastRunAt: state?.lastRunAt ?? null, nextCursor: null,
            runCount: state?.runCount ?? 0, retryNotBefore,
          });
        }
        return { ...empty, result: "retry_scheduled", failedPage, nextEligibleAt: retryNotBefore };
      }
      traversal = "interrupted";
      break;
    }
    pagesFetched += 1;
    let mappedOnPage = 0;
    let newOnPage = 0;
    for (const raw of page.jobs as readonly RemoteJobsOrgRawRecord[]) {
      try {
        const snapshot = mapRemoteJobsOrgRecord(raw, now);
        snapshots.push(snapshot);
        mappedOnPage += 1;
        if (!storedBefore.has(snapshot.id)) newOnPage += 1;
        // A posting repeated across pages (the window moves while it is read): the
        // pipeline keeps its first copy, and so does the excerpt.
        excerpts[snapshot.id] ??= remoteJobsOrgExcerptOf(snapshot);
      } catch (error) {
        if (error instanceof AdapterInputError) rejected += 1;
        else throw error;
      }
    }
    if (!page.hasMore || page.jobs.length < REMOTE_JOBS_ORG_PAGE_SIZE) {
      traversal = "complete";
      break;
    }
    // Every posting on the page was stored by an earlier run: the rest is older still.
    if (mappedOnPage > 0 && newOnPage === 0) {
      traversal = "seen";
      break;
    }
  }

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
    retryNotBefore,
  });
  return {
    result: "partial",
    pagesFetched,
    traversal,
    failedPage,
    recordsMapped: snapshots.length,
    recordsRejected: rejected,
    changes: imported.changes,
    tombstoned,
    nextEligibleAt: retryNotBefore,
  };
}
