// Live import orchestration for the owner-approved Jobicy source.
// The feed returns the LATEST WINDOW (up to 200 records), never a full
// snapshot: every run is partial by definition, absence from the window is
// never treated as closure, and miss counters never grow (spec 14.3).
import type { JobSnapshot, SourcePolicy } from "../../domain/source-contracts.ts";
import { permissionFor } from "../source-policies.ts";
import { runSnapshotImport } from "./pipeline.ts";
import { AdapterInputError } from "./himalayas-fixture.ts";
import { mapJobicyRecord, jobicyExcerptOf, type JobicyRawRecord } from "./jobicy-fixture.ts";
import type { JobicyWindowResult } from "./fetcher.ts";
import type { SnapshotPersistence } from "./himalayas-adapter.ts";

export type JobicyTransport = () => Promise<JobicyWindowResult>;

export type JobicyReport = Readonly<{
  result:
    | "refused_disabled" | "refused_poll_interval"
    | "partial" | "retry_scheduled" | "aborted";
  recordsMapped: number;
  recordsRejected: number;
  changes: readonly { id: string; change: string; version: number }[];
  deletedExpired: number;
  nextEligibleAt: string | null;
}>;

export async function runJobicyImport(params: Readonly<{
  transport: JobicyTransport;
  persistence: SnapshotPersistence;
  policy: SourcePolicy;
  now: string;
}>): Promise<JobicyReport> {
  const { transport, persistence, policy, now } = params;
  const empty: JobicyReport = {
    result: "refused_disabled", recordsMapped: 0, recordsRejected: 0,
    changes: [], deletedExpired: 0, nextEligibleAt: null,
  };
  if (permissionFor(policy, "fetch", now) !== "allowed") return empty;

  const state = await persistence.loadImportState();
  const intervalMs = policy.min_poll_interval_seconds * 1000;
  if (state?.lastRunAt && Date.parse(now) - Date.parse(state.lastRunAt) < intervalMs - 60_000) {
    return { ...empty, result: "refused_poll_interval",
      nextEligibleAt: new Date(Date.parse(state.lastRunAt) + intervalMs).toISOString() };
  }

  const window = await transport();
  if (window.status !== "ok") {
    return { ...empty, result: "retry_scheduled" };
  }
  const snapshots: JobSnapshot[] = [];
  const excerpts: Record<string, string> = {};
  let rejected = 0;
  for (const raw of window.jobs as readonly JobicyRawRecord[]) {
    try {
      const snapshot = mapJobicyRecord(raw, now);
      snapshots.push(snapshot);
      excerpts[snapshot.id] = jobicyExcerptOf(raw);
    } catch (error) {
      if (error instanceof AdapterInputError) rejected += 1;
      else throw error;
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
  const deletedExpired = await persistence.deleteExpired(now);
  await persistence.saveImportState({
    lastRunAt: now,
    nextCursor: null,
    runCount: (state?.runCount ?? 0) + 1,
  });
  return {
    result: "partial",
    recordsMapped: snapshots.length,
    recordsRejected: rejected,
    changes: imported.changes,
    deletedExpired,
    nextEligibleAt: null,
  };
}
