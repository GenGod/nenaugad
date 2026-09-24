import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot, isSourcePolicy, type JobSnapshot, type SourcePolicy } from "../../src/domain/source-contracts.ts";
import {
  atlasFixturesPolicy, himalayasCandidatePolicy, getSourcePolicy, permissionFor,
} from "../../src/server/source-policies.ts";
import {
  AdapterInputError, himalayasContractFixture, mapHimalayasFixture, mapHimalayasRecord,
} from "../../src/server/import/himalayas-fixture.ts";
import {
  emptySnapshotStore, runSnapshotImport, type SnapshotStore,
} from "../../src/server/import/pipeline.ts";
import {
  classifySnapshot, policyPublishes, projectCard, snapshotCatalogCards,
} from "../../src/domain/snapshot-projection.ts";

const NOW = "2026-09-24T12:00:00.000Z";
const DAY_LATER = "2026-09-25T12:00:00.000Z";
const TWO_DAYS_LATER = "2026-09-26T12:00:00.000Z";

const okFull = (records: readonly unknown[]) =>
  ({ status: "ok" as const, complete: true as const, records });
const okPartial = (records: readonly unknown[]) =>
  ({ status: "ok" as const, complete: false as const, records });

function importOnce(records: readonly unknown[], store: SnapshotStore = emptySnapshotStore(), now = NOW) {
  return runSnapshotImport({ store, outcome: okFull(records), attempt: 1, maxAttempts: 3, now });
}

test("acceptance 1: source policy fixes purpose, restrictions and owner review", () => {
  assert.equal(isSourcePolicy(himalayasCandidatePolicy), true);
  assert.equal(isSourcePolicy(atlasFixturesPolicy), true);
  assert.equal(himalayasCandidatePolicy.status, "pending");
  assert.equal(himalayasCandidatePolicy.enabled, false);
  assert.equal(himalayasCandidatePolicy.reviewed_at, null);
  assert.equal(himalayasCandidatePolicy.approved_by, null);
  assert.equal(himalayasCandidatePolicy.terms_urls.length > 0, true);
  // Nothing is fetchable or publishable before review: unknown blocks.
  assert.equal(permissionFor(himalayasCandidatePolicy, "fetch", NOW), "denied");
  assert.equal(permissionFor(himalayasCandidatePolicy, "publish_excerpt", NOW), "denied");
  assert.equal(permissionFor(atlasFixturesPolicy, "publish_excerpt", NOW), "allowed");
  assert.equal(permissionFor(atlasFixturesPolicy, "send_to_ai_provider", NOW), "denied");
  assert.equal(getSourcePolicy("himalayas")?.source_id, "himalayas");
  // Structural mutations must be rejected by the contract validator.
  const broken: unknown = { ...himalayasCandidatePolicy, status: "maybe" };
  assert.equal(isSourcePolicy(broken), false);
  const extraKey: unknown = { ...atlasFixturesPolicy, surprise: 1 };
  assert.equal(isSourcePolicy(extraKey), false);
});

test("acceptance 2: real contract validated and fixture is explicitly labelled", () => {
  const snapshots = mapHimalayasFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true);
  // Stable IDs across independent mappings of the same raw records.
  const again = mapHimalayasFixture(DAY_LATER);
  assert.deepEqual(snapshots.map(s => s.id), again.map(s => s.id));
  assert.equal(snapshots[0]?.id, "himalayas:fixture-h-001");
  // The fixture is synthetic by construction (companies/markers).
  assert.equal(himalayasContractFixture.every(r => r.companyName.endsWith("Fixtures")), true);
  assert.equal(snapshots.every(s => s.title.includes("synthetic fixture")), true);
  // Contract violations are rejected, not repaired.
  const mutated: unknown = { ...snapshots[0], workplace: { ...snapshots[0].workplace, type: "space" } };
  assert.equal(isJobSnapshot(mutated), false);
  const noDates: unknown = { ...snapshots[0], dates: undefined };
  assert.equal(isJobSnapshot(noDates), false);
  const foreignKey: unknown = { ...snapshots[0], extra: true };
  assert.equal(isJobSnapshot(foreignKey), false);
});

test("acceptance 2: epoch seconds and milliseconds are detected, ambiguity rejected", () => {
  const [seconds, milliseconds] = himalayasContractFixture;
  const fromSeconds = mapHimalayasRecord(seconds!, NOW).dates.source_published_at;
  const fromMillis = mapHimalayasRecord(milliseconds!, NOW).dates.source_published_at;
  assert.equal(fromSeconds, "2025-06-15T15:06:40.000Z");
  assert.equal(fromMillis, "2025-06-16T15:06:40.000Z");
  assert.throws(
    () => mapHimalayasRecord({ ...seconds!, pubDateEpoch: 175000000000 }, NOW),
    AdapterInputError,
  );
});

test("acceptance 4: empty locations is worldwide only without a text contradiction", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const worldwide = snapshots.find(s => s.id === "himalayas:fixture-h-001")!;
  assert.equal(worldwide.hiring_options[0]?.geography.scope, "worldwide");
  assert.equal(worldwide.hiring_options[0]?.geography.allowed_countries.length, 0);
  assert.equal(worldwide.conflicts.length, 0);
  // Source said worldwide, text says Germany/Netherlands: the narrower,
  // evidenced reading wins and the contradiction is recorded, not hidden.
  const restricted = snapshots.find(s => s.id === "himalayas:fixture-h-002")!;
  assert.equal(restricted.hiring_options[0]?.geography.scope, "restricted");
  assert.deepEqual(restricted.hiring_options[0]?.geography.allowed_countries, ["DE", "NL"]);
  assert.equal(restricted.conflicts.includes("geography-source-vs-text"), true);
});

test("acceptance 4: remote-tag vs office text is conflicting, unknown stays unknown", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const officeLean = snapshots.find(s => s.id === "himalayas:fixture-h-003")!;
  assert.equal(officeLean.workplace.verification_state, "conflicting");
  assert.equal(officeLean.workplace.mandatory_onsite, "required");
  assert.equal(classifySnapshot(officeLean), "excluded");
  assert.equal(classifySnapshot(snapshots[0]!), "main_catalog");
  const unverified: JobSnapshot = {
    ...snapshots[0]!,
    workplace: { ...snapshots[0]!.workplace, verification_state: "unknown" },
  };
  assert.equal(classifySnapshot(unverified), "needs_review");
});

test("acceptance 3: repeated import creates no duplicate and no semantic rewrite", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const first = importOnce(snapshots);
  assert.equal(first.result, "applied");
  assert.deepEqual(first.changes.map(c => c.change).sort(), ["created", "created", "created"]);
  const second = importOnce(mapHimalayasFixture(DAY_LATER), first.store, DAY_LATER);
  assert.equal(Object.keys(second.store.records).length, 3);
  assert.deepEqual(second.changes.map(c => c.change), ["seen", "seen", "seen"]);
  for (const stored of Object.values(second.store.records)) {
    assert.equal(stored.snapshot.version, 1);
    assert.equal(stored.firstSeenAt, NOW);
    assert.equal(stored.snapshot.dates.last_seen_at, DAY_LATER);
  }
  // A changed description bumps the version and keeps provenance dates.
  const changed = mapHimalayasFixture(TWO_DAYS_LATER).map(s =>
    s.id === "himalayas:fixture-h-001"
      ? { ...s, description_text: `${s.description_text} Updated requirements.` }
      : s);
  const third = importOnce(changed, second.store, TWO_DAYS_LATER);
  const updated = third.store.records["himalayas:fixture-h-001"]!;
  assert.equal(updated.snapshot.version, 2);
  assert.equal(updated.firstSeenAt, NOW);
  assert.equal(updated.snapshot.description_text.includes("Updated requirements."), true);
  // Invalid records are rejected explicitly, never silently stored.
  const poisoned = importOnce([...mapHimalayasFixture(NOW), { kind: "job_snapshot" }]);
  assert.equal(poisoned.rejected.length, 1);
  assert.equal(poisoned.rejected[0]?.reason, "SCHEMA_VIOLATION");
});

test("acceptance 6: 429/5xx and incomplete snapshots never close or stale records", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const seeded = importOnce(snapshots).store;
  for (const status of ["rate_limited", "server_error", "network_error"] as const) {
    const outcome = runSnapshotImport({
      store: seeded, outcome: { status, records: [] }, attempt: 1, maxAttempts: 3, now: DAY_LATER,
    });
    assert.equal(outcome.result, "retry_scheduled");
    assert.equal(Object.keys(outcome.store.records).length, 3);
    for (const stored of Object.values(outcome.store.records)) {
      assert.equal(stored.snapshot.lifecycle, "active");
      assert.equal(stored.fullPassMisses, 0);
      assert.equal(stored.snapshot.dates.last_seen_at, NOW);
    }
  }
  // A partial page keeps present records fresh without penalising absent ones.
  const partial = runSnapshotImport({
    store: seeded, outcome: okPartial([snapshots[0]!]), attempt: 1, maxAttempts: 3, now: DAY_LATER,
  });
  assert.equal(partial.result, "partial");
  assert.equal(partial.store.records["himalayas:fixture-h-002"]!.fullPassMisses, 0);
  assert.equal(partial.store.records["himalayas:fixture-h-002"]!.snapshot.lifecycle, "active");
  // Full passes < 24h apart do not accumulate misses either.
  const quick = importOnce([snapshots[0]!], seeded, "2026-09-24T18:00:00.000Z");
  assert.equal(quick.store.records["himalayas:fixture-h-002"]!.fullPassMisses, 0);
  // Two complete passes with a >=24h gap stale the absent record, never close it.
  const missedOnce = importOnce([snapshots[0]!], seeded, DAY_LATER);
  assert.equal(missedOnce.store.records["himalayas:fixture-h-002"]!.fullPassMisses, 1);
  assert.equal(missedOnce.store.records["himalayas:fixture-h-002"]!.snapshot.lifecycle, "active");
  const missedTwice = importOnce([snapshots[0]!], missedOnce.store, TWO_DAYS_LATER);
  const absent = missedTwice.store.records["himalayas:fixture-h-002"]!;
  assert.equal(absent.fullPassMisses, 2);
  assert.equal(absent.snapshot.lifecycle, "stale");
  // Retry is finite: an attempt beyond the budget changes nothing.
  const aborted = runSnapshotImport({
    store: seeded, outcome: okFull([]), attempt: 4, maxAttempts: 3, now: TWO_DAYS_LATER,
  });
  assert.equal(aborted.result, "aborted");
  assert.deepEqual(aborted.store, seeded);
});

test("acceptance 5: the card carries source, dates and a policy-approved apply route", () => {
  const store = importOnce(mapHimalayasFixture(NOW)).store;
  const stored = store.records["himalayas:fixture-h-002"]!;
  const card = projectCard(stored, himalayasCandidatePolicy);
  assert.equal(card.source.displayName, "Himalayas");
  assert.equal(card.source.attributionRequired, true);
  assert.equal(card.source.backlinkRequired, true);
  assert.equal(card.publishedAt, "2025-06-16T15:06:40.000Z");
  assert.equal(card.lastSeenAt, NOW);
  assert.equal(card.firstSeenAt, NOW);
  assert.equal(card.salaryOriginalText, "60000–75000 EUR / annual");
  // apply_route is unknown for the pending source: the safe fallback is the
  // source board, never a guessed direct link.
  assert.equal(card.apply.kind, "source_board");
  assert.equal(card.apply.url, stored.snapshot.source_url);
  const directPolicy: SourcePolicy = {
    ...himalayasCandidatePolicy, status: "approved", enabled: true,
    apply_route: "direct_allowed",
    permissions: { ...himalayasCandidatePolicy.permissions,
      publish_excerpt: "allowed", direct_apply: "allowed" },
  };
  const directCard = projectCard(stored, directPolicy);
  assert.equal(directCard.apply.kind, "direct");
  assert.equal(directCard.apply.url, stored.snapshot.apply_url);
});

test("acceptance 7: a disabled or unapproved source publishes nothing, no mocks", () => {
  const store = importOnce(mapHimalayasFixture(NOW)).store;
  assert.deepEqual(snapshotCatalogCards({
    store, getPolicy: getSourcePolicy, now: NOW,
  }), []);
  // Even a hypothetical approval change is not enough without enabled+permission.
  const suspended: SourcePolicy = { ...himalayasCandidatePolicy, enabled: true, status: "suspended" };
  assert.equal(policyPublishes(suspended, NOW), false);
  const expired: SourcePolicy = {
    ...himalayasCandidatePolicy, enabled: true, status: "approved",
    valid_until: "2026-01-01T00:00:00.000Z",
    permissions: { ...himalayasCandidatePolicy.permissions, publish_excerpt: "allowed" },
  };
  assert.equal(policyPublishes(expired, NOW), false);
  // Atlas fixtures policy does publish, but the fixture store has no
  // atlas-fixtures records, so the snapshot path contributes nothing extra.
  const syntheticStore = importOnce([], emptySnapshotStore(), NOW).store;
  assert.deepEqual(snapshotCatalogCards({
    store: syntheticStore, getPolicy: getSourcePolicy, now: NOW,
  }), []);
  // Enabling himalayas hypothetically still yields only gated cards.
  const approved: SourcePolicy = {
    ...himalayasCandidatePolicy, status: "approved", enabled: true,
    permissions: { ...himalayasCandidatePolicy.permissions, publish_excerpt: "allowed" },
  };
  const cards = snapshotCatalogCards({
    store, getPolicy: id => (id === "himalayas" ? approved : getSourcePolicy(id)), now: NOW,
  });
  assert.deepEqual(cards.map(c => c.id).sort(),
    ["himalayas:fixture-h-001", "himalayas:fixture-h-002"]);
  assert.equal(cards.every(c => c.visibility === "main_catalog"), true);
});
