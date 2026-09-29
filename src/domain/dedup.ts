// Cross-source duplicate grouping (design item A4, exact-key stage).
//
// The same posting is syndicated to several boards, so a catalog that reads two
// sources lists it twice: the candidate sees a fake-looking duplicate and the
// per-source attribution is split across two cards. This module groups records
// that are the SAME posting by an exact normalised key and picks one primary to
// show, while keeping every source's provenance.
//
// What this is NOT: near-duplicate detection. Two boards that publish slightly
// different titles ("Senior Backend Engineer" vs "Backend Engineer (Senior)")
// stay separate here — that is the embedding/MinHash stage (B5). Being honest
// about the boundary is the point: a wrong merge (hiding a real second job) is
// worse for the candidate than a missed merge (seeing a duplicate).
//
// Deterministic: same records, same groups, same primary.

import type { JobSnapshot } from "./source-contracts.ts";

export type DuplicateGroup<T> = Readonly<{
  key: string;
  /** Every record of the posting, in input order. */
  members: readonly T[];
  /** The record that should represent the group. */
  primary: T;
  duplicates: readonly T[];
}>;

/** How a caller reaches the snapshot: records wrap it differently per call site. */
export type SnapshotSelector<T> = (record: T) => JobSnapshot;

// Legal-form suffixes that boards add inconsistently ("Nordwind Labs GmbH" vs
// "Nordwind Labs"). Curated and short on purpose: stripping more (e.g. "Group")
// would start merging genuinely different companies.
const COMPANY_SUFFIXES = [
  "gmbh", "ag", "inc", "inc.", "llc", "l.l.c.", "ltd", "ltd.", "limited", "plc",
  "bv", "b.v.", "nv", "n.v.", "sa", "s.a.", "srl", "s.r.l.", "corp", "corp.",
  "corporation", "co", "co.", "oy", "ab", "as", "a/s", "pte", "pty", "spa", "s.p.a.",
];

// Markers that carry no role meaning and appear on one board but not another.
const TITLE_NOISE = /\((?:m\/f\/d|f\/m\/d|m\/w\/d|w\/m\/d|d\/f\/m|all genders|any gender)\)/giu;
const REMOTE_NOISE = /\((?:fully remote|100% remote|remote)\)/giu;

function stripSuffixes(value: string): string {
  let current = value;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (current.endsWith(` ${suffix}`)) {
        current = current.slice(0, current.length - suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return current;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeCompany(company: string): string {
  return stripSuffixes(normalizeText(company));
}

export function normalizeTitle(title: string): string {
  return normalizeText(title.replace(TITLE_NOISE, " ").replace(REMOTE_NOISE, " "));
}

// Geography is part of the key: the same title at the same company but with a
// different hiring scope is a different opportunity and must not be merged
// (silently widening or narrowing geography would break the eligibility rule).
export function geographyKey(snapshot: JobSnapshot): string {
  const geography = snapshot.hiring_options[0]?.geography;
  if (!geography) return "unspecified";
  const countries = [...geography.allowed_countries].sort().join(",");
  return `${geography.scope}:${countries}`;
}

export function dedupKey(snapshot: JobSnapshot): string {
  return [
    normalizeCompany(snapshot.company_name),
    normalizeTitle(snapshot.title),
    geographyKey(snapshot),
  ].join("|");
}

// Completeness signals, used only to break freshness ties: a card that shows a
// salary and a publication date beats an emptier one from the same posting.
function completeness(snapshot: JobSnapshot): number {
  return [
    snapshot.dates.source_published_at !== null,
    snapshot.apply_url !== null,
    snapshot.compensation.original_text !== null,
    snapshot.compensation.ranges.length > 0,
    snapshot.hiring_options.length > 0,
    snapshot.description_text.length >= 400,
  ].filter(Boolean).length;
}

/**
 * Which record represents the group. Freshest first (the card shows "last seen",
 * so a stale copy would misdate the posting), then the more complete record,
 * then a deterministic tie-break by source id and snapshot id so the choice
 * never depends on iteration order or timing.
 */
export function choosePrimary<T>(records: readonly T[], snapshotOf: SnapshotSelector<T>): T {
  const sorted = [...records].sort((a, b) => {
    const left = snapshotOf(a);
    const right = snapshotOf(b);
    const seen = right.dates.last_seen_at.localeCompare(left.dates.last_seen_at);
    if (seen !== 0) return seen;
    const complete = completeness(right) - completeness(left);
    if (complete !== 0) return complete;
    const id = left.id.localeCompare(right.id);
    if (id !== 0) return id;
    return left.source_record_id.localeCompare(right.source_record_id);
  });
  const first = sorted[0];
  if (first === undefined) throw new Error("EMPTY_DEDUP_GROUP");
  return first;
}

/**
 * Groups records by dedup key, preserving input order of first appearance so the
 * caller's ordering stays stable. Groups of one are returned as well: the caller
 * decides what to do with them (the projection fills `alsoListedAt` only when
 * there is more than one member).
 */
export function groupDuplicates<T>(
  records: readonly T[],
  snapshotOf: SnapshotSelector<T>,
): readonly DuplicateGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const record of records) {
    const key = dedupKey(snapshotOf(record));
    const bucket = byKey.get(key);
    if (bucket) bucket.push(record);
    else byKey.set(key, [record]);
  }
  const groups: DuplicateGroup<T>[] = [];
  for (const [key, bucket] of byKey) {
    const primary = choosePrimary(bucket, snapshotOf);
    groups.push({
      key,
      members: bucket,
      primary,
      duplicates: bucket.filter(record => record !== primary),
    });
  }
  return groups;
}
