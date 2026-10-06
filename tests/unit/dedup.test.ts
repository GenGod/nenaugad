// Cross-source deduplication tests (design item A4).
//
// Two properties matter more than the grouping itself, and both are pinned
// here: a merge must never touch provenance (every source keeps its own named
// backlink), and a merge must never happen across different hiring geography
// (silently widening or narrowing where a job hires would corrupt the
// eligibility rule).
import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLDEN_SET } from "../../src/data/matching-golden.ts";
import {
  choosePrimary, dedupKey, groupDuplicates, normalizeCompany, normalizeTitle,
} from "../../src/domain/dedup.ts";
import {
  classifySnapshot, projectCard, provenanceOf, snapshotCatalogCards,
  type PolicyBoundRecord, type StoredSnapshot,
} from "../../src/domain/snapshot-projection.ts";
import type { Geography, JobSnapshot, SourcePolicy } from "../../src/domain/source-contracts.ts";
import { getSourcePolicy } from "../../src/server/source-policies.ts";

const NOW = "2026-09-29T12:00:00.000Z";
const baseJob: JobSnapshot = GOLDEN_SET.jobs[0]!.snapshot;

function jobWith(overrides: Partial<JobSnapshot> & { geography?: Geography }): JobSnapshot {
  const { geography, ...rest } = overrides;
  const hiringOptions = baseJob.hiring_options.map(option => ({
    ...option,
    geography: geography ?? option.geography,
  }));
  return { ...baseJob, ...rest, hiring_options: hiringOptions };
}

function storedFor(snapshot: JobSnapshot, sourceId: string, firstSeenAt = NOW): StoredSnapshot {
  return { sourceId, snapshot, contentHash: "hash", firstSeenAt, fullPassMisses: 0 };
}

function recordFor(snapshot: JobSnapshot, policy: SourcePolicy): PolicyBoundRecord {
  return { stored: storedFor(snapshot, policy.source_id), policy };
}

test("dedup key normalises company suffixes, title noise and case", () => {
  assert.equal(normalizeCompany("Nordwind Labs GmbH"), normalizeCompany("nordwind labs"));
  assert.equal(normalizeCompany("Meridian Pay, Inc."), "meridian pay");
  assert.equal(normalizeTitle("Senior Node.js Engineer (m/f/d)"), normalizeTitle("Senior Node.js Engineer"));
  assert.equal(normalizeTitle("Backend Engineer (Fully Remote)"), normalizeTitle("backend engineer"));
  // Meaningful words are not stripped: a different seniority stays different.
  assert.notEqual(normalizeTitle("Senior Node.js Engineer"), normalizeTitle("Junior Node.js Engineer"));
});

test("dedup key includes hiring geography and company", () => {
  const worldwide = jobWith({ geography: { scope: "worldwide", allowed_countries: [], excluded_countries: [], allowed_subdivisions: [], region_text: null, exhaustive: true, evidence_ids: [] } });
  const restricted = jobWith({ geography: { scope: "restricted", allowed_countries: ["DE"], excluded_countries: [], allowed_subdivisions: [], region_text: null, exhaustive: true, evidence_ids: [] } });
  assert.notEqual(dedupKey(worldwide), dedupKey(restricted));
  assert.equal(dedupKey(worldwide), dedupKey(jobWith({ company_name: "Nordwind Labs", geography: worldwide.hiring_options[0]?.geography })));
  assert.notEqual(dedupKey(worldwide), dedupKey(jobWith({ company_name: "Kestrel Systems" })));
});

test("grouping keeps different geography apart and merges the same posting", () => {
  const worldwide = jobWith({ id: "job-a", company_name: "Nordwind Labs" });
  const sameWorldwide = jobWith({ id: "job-b", company_name: "Nordwind Labs GmbH", title: "Senior Node.js Engineer (m/f/d)" });
  const restricted = jobWith({
    id: "job-c", company_name: "Nordwind Labs",
    geography: { scope: "restricted", allowed_countries: ["DE"], excluded_countries: [], allowed_subdivisions: [], region_text: null, exhaustive: true, evidence_ids: [] },
  });
  const groups = groupDuplicates([worldwide, sameWorldwide, restricted].map(snapshot => ({ snapshot })), record => record.snapshot);
  assert.equal(groups.length, 2);
  const merged = groups.find(group => group.duplicates.length === 1);
  assert.ok(merged, "the two worldwide records must form one group of two");
  assert.deepEqual(new Set([merged.primary.snapshot.id, ...merged.duplicates.map(d => d.snapshot.id)]), new Set(["job-a", "job-b"]));
});

test("grouping never merges an incomplete country list with the complete one (B25)", () => {
  const listing = (id: string, exhaustive: boolean) => jobWith({
    id, geography: { scope: "restricted", allowed_countries: ["US", "CA"], excluded_countries: [], allowed_subdivisions: [], region_text: null, exhaustive, evidence_ids: [] },
  });
  const groups = groupDuplicates(
    [listing("job-full", true), listing("job-partial", false), listing("job-full-copy", true)].map(snapshot => ({ snapshot })),
    record => record.snapshot,
  );
  assert.deepEqual(groups.map(group => group.members.map(member => member.snapshot.id)),
    [["job-full", "job-full-copy"], ["job-partial"]]);
});

test("primary choice: freshest wins, then completeness, then id order", () => {
  const older = { snapshot: jobWith({ id: "job-old", dates: { source_published_at: null, fetched_at: NOW, last_seen_at: "2026-09-28T00:00:00.000Z", expires_at: null } }) };
  const newer = { snapshot: jobWith({ id: "job-new", dates: { source_published_at: null, fetched_at: NOW, last_seen_at: "2026-09-29T00:00:00.000Z", expires_at: null } }) };
  assert.equal(choosePrimary([older, newer], record => record.snapshot).snapshot.id, "job-new");
  // Same freshness: the record with a publication date and a salary wins.
  const sparse = { snapshot: jobWith({ id: "job-sparse", dates: { source_published_at: null, fetched_at: NOW, last_seen_at: NOW, expires_at: null } }) };
  const complete = { snapshot: jobWith({ id: "job-complete", dates: { source_published_at: "2026-09-20T00:00:00.000Z", fetched_at: NOW, last_seen_at: NOW, expires_at: null } }) };
  assert.equal(choosePrimary([sparse, complete], record => record.snapshot).snapshot.id, "job-complete");
  const tied = [{ snapshot: jobWith({ id: "job-b" }) }, { snapshot: jobWith({ id: "job-a" }) }];
  assert.equal(choosePrimary(tied, record => record.snapshot).snapshot.id, "job-a");
});

test("projection: one card per posting with both source backlinks preserved", () => {
  const himalayas = jobWith({
    id: "job-h", company_name: "Nordwind Labs",
    source_url: "https://example.invalid/himalayas/job",
    dates: { source_published_at: "2026-09-25T00:00:00.000Z", fetched_at: NOW, last_seen_at: "2026-09-29T09:00:00.000Z", expires_at: null },
  });
  const jobicy = jobWith({
    id: "job-j", company_name: "Nordwind Labs GmbH", title: "Senior Node.js Engineer (m/f/d)",
    source_url: "https://example.invalid/jobicy/job",
    dates: { source_published_at: null, fetched_at: NOW, last_seen_at: "2026-09-28T00:00:00.000Z", expires_at: null },
  });
  const himalayasPolicy = getSourcePolicy("himalayas");
  const jobicyPolicy = getSourcePolicy("jobicy");
  assert.ok(himalayasPolicy && jobicyPolicy);
  const groups = groupDuplicates([
    recordFor(himalayas, himalayasPolicy),
    recordFor(jobicy, jobicyPolicy),
  ], record => record.stored.snapshot);
  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.ok(group);
  const card = projectCard(group.primary.stored, group.primary.policy, provenanceOf(group));
  assert.equal(card.visibility, "main_catalog");
  // The fresher record (himalayas, last seen 2026-09-29) is the card's source...
  assert.equal(card.source.id, "himalayas");
  // ...and the other board is still credited with a working link.
  assert.equal(card.alsoListedAt.length, 1);
  assert.equal(card.alsoListedAt[0]?.sourceId, "jobicy");
  assert.equal(card.alsoListedAt[0]?.url, "https://example.invalid/jobicy/job");
  assert.ok((card.alsoListedAt[0]?.displayName ?? "").length > 0, "provenance must carry a display name");
});

test("catalog projection groups duplicates and drops unpublishable sources entirely", () => {
  const policyHimalayas = getSourcePolicy("himalayas");
  const policyJobicy = getSourcePolicy("jobicy");
  assert.ok(policyHimalayas && policyJobicy);
  const disabledJobicy: SourcePolicy = {
    ...policyJobicy,
    enabled: false,
  };
  const records: Record<string, StoredSnapshot> = {
    "job-h": storedFor(jobWith({ id: "job-h", company_name: "Nordwind Labs" }), "himalayas"),
    "job-j": storedFor(jobWith({ id: "job-j", company_name: "Nordwind Labs" }), "jobicy"),
  };
  const withBoth = snapshotCatalogCards({
    store: { records, lastFullPassAt: null },
    getPolicy: sourceId => (sourceId === "himalayas" ? policyHimalayas : policyJobicy),
    now: NOW,
  });
  assert.equal(withBoth.length, 1);
  assert.equal(withBoth[0]?.alsoListedAt.length, 1);
  // A disabled source contributes neither a card nor provenance.
  const withDisabled = snapshotCatalogCards({
    store: { records, lastFullPassAt: null },
    getPolicy: sourceId => (sourceId === "himalayas" ? policyHimalayas : disabledJobicy),
    now: NOW,
  });
  assert.equal(withDisabled.length, 1);
  assert.deepEqual(withDisabled[0]?.alsoListedAt, []);
  assert.equal(classifySnapshot(jobWith({ id: "job-h" })), "main_catalog");
});

test("a fresher unreviewed copy does not hide a confirmed posting", () => {
  const policyHimalayas = getSourcePolicy("himalayas");
  const policyJobicy = getSourcePolicy("jobicy");
  assert.ok(policyHimalayas && policyJobicy);
  // The confirmed copy is older; the fresher copy is not verified, so it is not
  // publishable on its own. The confirmed posting must still reach the catalog.
  const confirmed = jobWith({
    id: "job-confirmed", company_name: "Nordwind Labs",
    workplace: { ...baseJob.workplace, verification_state: "confirmed" },
    dates: { source_published_at: null, fetched_at: NOW, last_seen_at: "2026-09-25T00:00:00.000Z", expires_at: null },
  });
  const unreviewed = jobWith({
    id: "job-unreviewed", company_name: "Nordwind Labs",
    workplace: { ...baseJob.workplace, verification_state: "unknown" },
    dates: { source_published_at: null, fetched_at: NOW, last_seen_at: "2026-09-29T09:00:00.000Z", expires_at: null },
  });
  assert.equal(classifySnapshot(unreviewed), "needs_review");
  const cards = snapshotCatalogCards({
    store: {
      records: {
        "job-confirmed": storedFor(confirmed, "himalayas"),
        "job-unreviewed": storedFor(unreviewed, "jobicy"),
      },
      lastFullPassAt: null,
    },
    getPolicy: sourceId => (sourceId === "himalayas" ? policyHimalayas : policyJobicy),
    now: NOW,
  });
  assert.equal(cards.length, 1, "the confirmed posting must stay in the catalog");
  assert.equal(cards[0]?.id, "job-confirmed");
  assert.equal(cards[0]?.visibility, "main_catalog");
  // The unreviewed copy is not publishable, so it is not advertised either.
  assert.deepEqual(cards[0]?.alsoListedAt, []);
});

test("dedup does not rewrite provenance fields of the primary record", () => {
  const snapshot = jobWith({ id: "job-h", company_name: "Nordwind Labs" });
  const policy = getSourcePolicy("himalayas");
  assert.ok(policy);
  const stored = storedFor(snapshot, "himalayas", "2026-09-20T00:00:00.000Z");
  const card = projectCard(stored, policy, []);
  assert.equal(card.firstSeenAt, "2026-09-20T00:00:00.000Z");
  assert.equal(card.lastSeenAt, snapshot.dates.last_seen_at);
  assert.equal(card.source.id, "himalayas");
});
