// Idempotent snapshot import (technical spec sections 6, 14; SP section 7).
// Pure functions: no transport, no clock, no filesystem. The caller supplies
// the fetch outcome and the current time, which keeps every rule testable.
import { createHash } from "node:crypto";
import { isJobSnapshot, type JobSnapshot } from "../../domain/source-contracts.ts";
import type { SnapshotStore, StoredSnapshot } from "../../domain/snapshot-projection.ts";

export type { SnapshotStore, StoredSnapshot } from "../../domain/snapshot-projection.ts";

export type FetchOutcome =
  | Readonly<{ status: "ok"; complete: true; records: readonly unknown[] }>
  | Readonly<{ status: "ok"; complete: false; records: readonly unknown[] }>
  | Readonly<{ status: "rate_limited" | "server_error" | "network_error"; records: readonly [] }>;

export type ImportChange = Readonly<{
  id: string;
  change: "created" | "seen" | "updated" | "stale" | "closed";
  version: number;
}>;

export type ImportRejection = Readonly<{ id: string; reason: string }>;

export type ImportResult = Readonly<{
  store: SnapshotStore;
  result: "applied" | "partial" | "retry_scheduled" | "aborted";
  changes: readonly ImportChange[];
  rejected: readonly ImportRejection[];
}>;

export const FULL_PASS_GAP_MS = 24 * 60 * 60 * 1000;
export const STALE_AFTER_FULL_PASS_MISSES = 2;

export function emptySnapshotStore(): SnapshotStore {
  return { records: {}, lastFullPassAt: null };
}

// Only the semantic content participates: fetch timestamps and the
// pipeline-owned version never create a "new meaning" on their own.
function semanticFingerprint(snapshot: JobSnapshot): string {
  // JSON.stringify drops the undefined version, so fetch metadata and the
  // pipeline-owned version never create a "new meaning" on their own.
  const semantic: unknown = {
    ...snapshot,
    version: undefined,
    dates: { ...snapshot.dates, fetched_at: "", last_seen_at: "" },
  };
  return createHash("sha256")
    .update(JSON.stringify(sortKeysDeep(semantic)))
    .digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map(key => [key, sortKeysDeep((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function sourceIdOf(snapshot: JobSnapshot): string {
  const separator = snapshot.source_record_id.indexOf(":");
  return separator === -1 ? snapshot.source_record_id : snapshot.source_record_id.slice(0, separator);
}

function withDates(snapshot: JobSnapshot, now: string): JobSnapshot {
  return { ...snapshot, dates: { ...snapshot.dates, fetched_at: now, last_seen_at: now } };
}

export function runSnapshotImport(params: Readonly<{
  store: SnapshotStore;
  outcome: FetchOutcome;
  attempt: number;
  maxAttempts: number;
  now: string;
}>): ImportResult {
  const { store, outcome, attempt, maxAttempts, now } = params;
  // Finite retry: no SDK or queue retry may keep an operation alive forever (I-08).
  if (attempt > maxAttempts) {
    return { store, result: "aborted", changes: [], rejected: [] };
  }
  // 429/5xx/network errors never close, stale or otherwise touch stored
  // records; the caller retries within the attempt budget (spec 14.3).
  if (outcome.status !== "ok") {
    return { store, result: "retry_scheduled", changes: [], rejected: [] };
  }

  const changes: ImportChange[] = [];
  const rejected: ImportRejection[] = [];
  const records: Record<string, StoredSnapshot> = { ...store.records };
  const seenIds = new Set<string>();

  for (const candidate of outcome.records) {
    if (!isJobSnapshot(candidate)) {
      rejected.push({ id: "<invalid>", reason: "SCHEMA_VIOLATION" });
      continue;
    }
    if (seenIds.has(candidate.id)) {
      rejected.push({ id: candidate.id, reason: "DUPLICATE_ID_IN_BATCH" });
      continue;
    }
    seenIds.add(candidate.id);
    const contentHash = semanticFingerprint(candidate);
    const existing = records[candidate.id];
    if (!existing) {
      records[candidate.id] = {
        sourceId: sourceIdOf(candidate),
        snapshot: withDates({ ...candidate, version: 1 }, now),
        contentHash,
        firstSeenAt: now,
        fullPassMisses: 0,
      };
      changes.push({ id: candidate.id, change: "created", version: 1 });
      continue;
    }
    if (existing.contentHash === contentHash) {
      // Same meaning: only observation dates move; version and first_seen stay.
      records[candidate.id] = {
        ...existing,
        snapshot: withDates(existing.snapshot, now),
        contentHash,
      };
      changes.push({ id: candidate.id, change: "seen", version: existing.snapshot.version });
      continue;
    }
    // Text or another semantic field changed: new version, provenance kept.
    const version = existing.snapshot.version + 1;
    records[candidate.id] = {
      ...existing,
      snapshot: withDates({ ...candidate, version }, now),
      contentHash,
    };
    changes.push({ id: candidate.id, change: "updated", version });
  }

  // Absence counts only in a complete snapshot taken at least 24h after the
  // previous full pass; two such misses make the record stale, never closed.
  let lastFullPassAt = store.lastFullPassAt;
  if (outcome.complete) {
    const gapElapsed = lastFullPassAt === null ||
      Date.parse(now) - Date.parse(lastFullPassAt) >= FULL_PASS_GAP_MS;
    if (gapElapsed) {
      for (const [id, stored] of Object.entries(records)) {
        if (seenIds.has(id)) {
          if (stored.fullPassMisses > 0) records[id] = { ...stored, fullPassMisses: 0 };
          continue;
        }
        const misses = stored.fullPassMisses + 1;
        const staled = misses >= STALE_AFTER_FULL_PASS_MISSES &&
          stored.snapshot.lifecycle === "active";
        records[id] = {
          ...stored,
          fullPassMisses: misses,
          snapshot: staled
            ? withDates({ ...stored.snapshot, lifecycle: "stale" }, stored.snapshot.dates.last_seen_at)
            : stored.snapshot,
        };
        if (staled) {
          changes.push({ id, change: "stale", version: stored.snapshot.version });
        }
      }
      lastFullPassAt = now;
    }
  }

  return {
    store: { records, lastFullPassAt },
    result: outcome.complete ? "applied" : "partial",
    changes,
    rejected,
  };
}
