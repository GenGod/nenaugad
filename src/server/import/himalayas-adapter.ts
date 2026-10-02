// Live import orchestration for the owner-approved Himalayas source.
// Pure coordination: transport, persistence and clock are injected, so every
// rule (poll gate, cursor checkpoint, failure classification) is unit-testable
// without network or database.
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import type { SnapshotStore, StoredSnapshot } from "../../domain/snapshot-projection.ts";
import { tombstoneSnapshot } from "../../domain/snapshot-projection.ts";
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
  lastAttemptAt?: string | null;
  consecutiveFailures?: number;
}>;

export type SnapshotPersistence = Readonly<{
  loadImportState(): Promise<ImportState | null>;
  saveImportState(state: ImportState): Promise<void>;
  loadStore(): Promise<{ store: SnapshotStore; excerpts: Record<string, string> }>;
  saveStore(store: SnapshotStore, excerpts: Record<string, string>): Promise<void>;
  tombstoneExpired(now: string): Promise<number>;
  recordAttempt(success: boolean, now: string): Promise<void>;
  resumeAttempts(): Promise<void>;
}>;

export type AdapterReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "applied" | "partial" | "retry_scheduled" | "aborted";
  pagesFetched: number;
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  /** Records retention blanked into tombstones this run (RET-001). */
  tombstoned: number;
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
    async recordAttempt(success, now) {
      if (!this.state) this.state = { lastRunAt: null, nextCursor: null, runCount: 0 };
      this.state = {
        ...this.state,
        lastAttemptAt: now,
        consecutiveFailures: success ? 0 : (this.state.consecutiveFailures ?? 0) + 1,
      };
    },
    async resumeAttempts() {
      if (this.state) this.state = { ...this.state, consecutiveFailures: 0 };
    },
    async loadStore() { return { store: this.store, excerpts: this.excerpts }; },
    async saveStore(store, excerpts) {
      this.store = store;
      this.excerpts = { ...this.excerpts, ...excerpts };
    },
    async tombstoneExpired(now) {
      // Same semantics as the PostgreSQL implementation (RET-001, owner decision
      // No 4): an expired record becomes a tombstone — the row, its hash and its
      // dates stay, the prose does not — and a row already tombstoned is left
      // alone.
      const lastSeenCutoff = Date.parse(now) - retentionHours * 3600 * 1000;
      const expiryCutoff = Date.parse(now) - 7 * 24 * 3600 * 1000;
      const records: Record<string, StoredSnapshot> = { ...this.store.records };
      const excerpts = { ...this.excerpts };
      let tombstoned = 0;
      for (const [id, stored] of Object.entries(records)) {
        if (stored.tombstonedAt) continue;
        const expiresAt = stored.snapshot.dates.expires_at;
        const expired = expiresAt !== null && Date.parse(expiresAt) < expiryCutoff;
        if (Date.parse(stored.snapshot.dates.last_seen_at) < lastSeenCutoff || expired) {
          records[id] = { ...stored, snapshot: tombstoneSnapshot(stored.snapshot), tombstonedAt: now };
          excerpts[id] = "";
          tombstoned += 1;
        }
      }
      this.store = { ...this.store, records };
      this.excerpts = excerpts;
      return tombstoned;
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
    changes: [], tombstoned: 0, nextCursor: null, nextEligibleAt: null,
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
  const tombstoned = await persistence.tombstoneExpired(now);

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
    tombstoned,
    nextCursor: complete ? null : cursor,
    nextEligibleAt: null,
  };
}
