// Live import orchestration for the owner-approved Himalayas source.
// Pure coordination: transport, persistence and clock are injected, so every
// rule (poll gate, cursor checkpoint, failure classification) is unit-testable
// without network or database.
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import type { SnapshotStore, StoredSnapshot } from "../../domain/snapshot-projection.ts";
import { runSnapshotImport } from "./pipeline.ts";
import {
  AdapterInputError, mapHimalayasRecord, type HimalayasRawRecord,
} from "./himalayas-fixture.ts";
import type { FetchPageResult } from "./fetcher.ts";

export const DEFAULT_MAX_PAGES_PER_RUN = 25;

export type HimalayasTransport = (cursor: string | null) => Promise<FetchPageResult>;

export type ImportState = Readonly<{
  lastRunAt: string | null;
  nextCursor: string | null;
  runCount: number;
}>;

export type SnapshotPersistence = Readonly<{
  loadImportState(): Promise<ImportState | null>;
  saveImportState(state: ImportState): Promise<void>;
  loadStore(): Promise<{ store: SnapshotStore; excerpts: Record<string, string> }>;
  saveStore(store: SnapshotStore, excerpts: Record<string, string>): Promise<void>;
  deleteExpired(now: string): Promise<number>;
}>;

export type AdapterReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "applied" | "partial" | "retry_scheduled" | "aborted";
  pagesFetched: number;
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  deletedExpired: number;
  nextCursor: string | null;
  nextEligibleAt: string | null;
}>;

export function createMemoryPersistence(retentionHours = 720): SnapshotPersistence & {
  state: ImportState | null; store: SnapshotStore; excerpts: Record<string, string>;
} {
  return {
    state: null,
    store: { records: {}, lastFullPassAt: null },
    excerpts: {},
    async loadImportState() { return this.state; },
    async saveImportState(state) { this.state = state; },
    async loadStore() { return { store: this.store, excerpts: this.excerpts }; },
    async saveStore(store, excerpts) {
      this.store = store;
      this.excerpts = { ...this.excerpts, ...excerpts };
    },
    async deleteExpired(now) {
      // Same semantics as the PostgreSQL implementation: retention window on
      // last_seen, plus listings that expired more than a week ago.
      const lastSeenCutoff = Date.parse(now) - retentionHours * 3600 * 1000;
      const expiryCutoff = Date.parse(now) - 7 * 24 * 3600 * 1000;
      const kept: Record<string, StoredSnapshot> = {};
      let deleted = 0;
      for (const [id, stored] of Object.entries(this.store.records)) {
        const expiresAt = stored.snapshot.dates.expires_at;
        const expired = expiresAt !== null && Date.parse(expiresAt) < expiryCutoff;
        if (Date.parse(stored.snapshot.dates.last_seen_at) < lastSeenCutoff || expired) deleted += 1;
        else kept[id] = stored;
      }
      this.store = { ...this.store, records: kept };
      return deleted;
    },
  };
}

export async function runHimalayasImport(params: Readonly<{
  transport: HimalayasTransport;
  persistence: SnapshotPersistence;
  policy: SourcePolicy;
  now: string;
  maxPages?: number;
}>): Promise<AdapterReport> {
  const { transport, persistence, policy, now } = params;
  const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES_PER_RUN;
  const emptyReport: AdapterReport = {
    result: "refused_disabled", pagesFetched: 0, recordsMapped: 0, recordsRejected: 0,
    changes: [], deletedExpired: 0, nextCursor: null, nextEligibleAt: null,
  };
  // Approval alone activates nothing; fetch requires enabled+approved+allowed.
  if (permissionFor(policy, "fetch", now) !== "allowed") return emptyReport;

  const state = await persistence.loadImportState();
  const intervalMs = policy.min_poll_interval_seconds * 1000;
  if (state?.lastRunAt && Date.parse(now) - Date.parse(state.lastRunAt) < intervalMs - 60_000) {
    return { ...emptyReport, result: "refused_poll_interval",
      nextCursor: state.nextCursor,
      nextEligibleAt: new Date(Date.parse(state.lastRunAt) + intervalMs).toISOString() };
  }

  const snapshots: JobSnapshot[] = [];
  const excerpts: Record<string, string> = {};
  let rejected = 0;
  let cursor = state?.nextCursor ?? null;
  let pagesFetched = 0;
  let failure: "rate_limited" | "server_error" | "network_error" | null = null;

  while (pagesFetched < maxPages) {
    const page = await transport(cursor);
    if (page.status !== "ok") {
      failure = page.status;
      break;
    }
    pagesFetched += 1;
    for (const raw of page.jobs as readonly HimalayasRawRecord[]) {
      try {
        const snapshot = mapHimalayasRecord(raw, now);
        snapshots.push(snapshot);
        if (typeof raw.excerpt === "string") excerpts[snapshot.id] = raw.excerpt;
      } catch (error) {
        if (error instanceof AdapterInputError) rejected += 1;
        else throw error;
      }
    }
    cursor = page.nextCursor;
    if (cursor === null) break;
  }

  const complete = failure === null && cursor === null;
  const { store } = await persistence.loadStore();
  const imported = runSnapshotImport({
    store,
    outcome: failure === null
      ? { status: "ok", complete, records: snapshots }
      : { status: failure, records: [] },
    attempt: 1,
    maxAttempts: 1,
    now,
  });
  await persistence.saveStore(imported.store, excerpts);
  const deletedExpired = await persistence.deleteExpired(now);

  // A failed run must not consume the polling window.
  if (failure === null) {
    await persistence.saveImportState({
      lastRunAt: now,
      nextCursor: complete ? null : cursor,
      runCount: (state?.runCount ?? 0) + 1,
    });
  }
  return {
    result: failure === null ? imported.result : "retry_scheduled",
    pagesFetched,
    recordsMapped: snapshots.length,
    recordsRejected: rejected,
    changes: imported.changes,
    deletedExpired,
    nextCursor: complete ? null : cursor,
    nextEligibleAt: null,
  };
}
