import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot, isSourcePolicy, type JobSnapshot, type SourcePolicy } from "../../src/domain/source-contracts.ts";
import {
  atlasFixturesPolicy, himalayasCandidatePolicy, jobicyCandidatePolicy, getSourcePolicy, permissionFor,
  maySendTextToProvider, partitionSourcesByProviderRights,
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
  // Owner approved the permission matrix on 2026-09-24 and activated the
  // source after reviewing the S1-002 diff.
  assert.equal(himalayasCandidatePolicy.status, "approved");
  assert.equal(himalayasCandidatePolicy.enabled, true);
  assert.equal(himalayasCandidatePolicy.reviewed_at !== null, true);
  assert.equal(himalayasCandidatePolicy.approved_by, "owner");
  assert.equal(himalayasCandidatePolicy.terms_hash !== null, true);
  assert.equal(himalayasCandidatePolicy.valid_until, "2026-12-23T00:00:00.000Z");
  assert.equal(himalayasCandidatePolicy.terms_urls.length > 0, true);
  // Approved matrix: API-documented reuse with attribution is allowed;
  // full-text republication, direct apply and syndication are denied.
  for (const permission of ["fetch", "cache", "store_full_text", "store_excerpt",
    "derive_fields", "publish_excerpt", "process_with_ml", "send_to_ai_provider"] as const) {
    assert.equal(himalayasCandidatePolicy.permissions[permission], "allowed", permission);
  }
  // Local ML inference was granted by the owner on 2026-09-30 and provider
  // transfer on 2026-10-01 (both asserted in the decision test below); everything
  // else about the rights is unchanged, and training on upstream text stays denied.
  for (const permission of ["publish_full_text", "send_email", "index_web_page",
    "syndicate_google_jobs", "train_model", "direct_apply", "bulk_export"] as const) {
    assert.equal(himalayasCandidatePolicy.permissions[permission], "denied", permission);
  }
  assert.equal(himalayasCandidatePolicy.apply_route, "source_required");
  assert.equal(himalayasCandidatePolicy.max_retention_hours, 720);
  // While enabled the approved matrix grants fetch and publishing; a disabled
  // clone must deny everything again (rollback works without code changes).
  assert.equal(permissionFor(himalayasCandidatePolicy, "fetch", NOW), "allowed");
  assert.equal(permissionFor(himalayasCandidatePolicy, "publish_excerpt", NOW), "allowed");
  const disabledClone: SourcePolicy = { ...himalayasCandidatePolicy, enabled: false };
  assert.equal(permissionFor(disabledClone, "fetch", NOW), "denied");
  assert.equal(permissionFor(disabledClone, "publish_excerpt", NOW), "denied");
  assert.equal(permissionFor(atlasFixturesPolicy, "publish_excerpt", NOW), "allowed");
  assert.equal(permissionFor(atlasFixturesPolicy, "send_to_ai_provider", NOW), "allowed");
  assert.equal(getSourcePolicy("himalayas")?.source_id, "himalayas");
  // Structural mutations must be rejected by the contract validator.
  const broken: unknown = { ...himalayasCandidatePolicy, status: "maybe" };
  assert.equal(isSourcePolicy(broken), false);
  const extraKey: unknown = { ...atlasFixturesPolicy, surprise: 1 };
  assert.equal(isSourcePolicy(extraKey), false);
});

test("owner decision 2026-09-30 (brief 7.2): local ML inference covers fixtures and himalayas, not jobicy", () => {
  // Granted: synthetic fixtures (the offline eval depends on it) and himalayas
  // (API docs name "AI tools" as an intended audience; the owner accepted that
  // reading — the full analysis lives in the 2026-09-30 decision document).
  assert.equal(permissionFor(atlasFixturesPolicy, "process_with_ml", NOW), "allowed");
  assert.equal(permissionFor(himalayasCandidatePolicy, "process_with_ml", NOW), "allowed");
  // jobicy keeps the denial of LOCAL inference: its Fair Use text is the
  // friendliest of the three, but the owner's 2026-09-30 grant did not cover it,
  // and a silent flip must fail here. The provider-transfer grant below is a
  // separate, later decision and does not change this line.
  assert.equal(permissionFor(jobicyCandidatePolicy, "process_with_ml", NOW), "denied");
  // Inference was never a licence to train on upstream text: that stays denied
  // for every source.
  for (const policy of [atlasFixturesPolicy, himalayasCandidatePolicy, jobicyCandidatePolicy]) {
    assert.equal(permissionFor(policy, "train_model", NOW), "denied", policy.source_id);
  }
  // Unknown is not a licence either: the tri-state stays undecided, and the
  // caller blocks exactly the disputed operation.
  const unreviewed: SourcePolicy = {
    ...atlasFixturesPolicy,
    permissions: { ...atlasFixturesPolicy.permissions, process_with_ml: "unknown" },
  };
  assert.equal(permissionFor(unreviewed, "process_with_ml", NOW), "unknown");
});

test("owner decision 2026-10-01: provider transfer is granted, and the gate that enforces it exists", () => {
  // Granted for all three sources: the operation is the same one the approved
  // purposes need. Recorded honestly in the jobicy policy: on 2026-09-30 the owner
  // withheld even the weaker local-inference grant there, so this is a later and
  // stronger decision — narrowing it back is a one-line policy change plus this test.
  for (const policy of [atlasFixturesPolicy, himalayasCandidatePolicy, jobicyCandidatePolicy]) {
    assert.equal(permissionFor(policy, "send_to_ai_provider", NOW), "allowed", policy.source_id);
    assert.equal(maySendTextToProvider(policy.source_id, NOW), true, policy.source_id);
  }
  // The gate is the executable form of the grant: unknown sources and rolled-back
  // policies answer false, never "probably fine".
  assert.equal(maySendTextToProvider("not-a-source", NOW), false);
  assert.equal(maySendTextToProvider("himalayas", "2027-01-01T00:00:00.000Z"), false,
    "an expired policy stops the transfer");
  const partition = partitionSourcesByProviderRights(
    ["atlas-fixtures", "himalayas", "jobicy", "not-a-source"], NOW);
  assert.deepEqual(partition.allowed, ["atlas-fixtures", "himalayas", "jobicy"]);
  assert.deepEqual(partition.denied, ["not-a-source"]);
});

test("acceptance 2: real contract validated and fixture is explicitly labelled", () => {
  const snapshots = mapHimalayasFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true);
  // Stable IDs across independent mappings of the same raw records.
  const again = mapHimalayasFixture(DAY_LATER);
  assert.deepEqual(snapshots.map(s => s.id), again.map(s => s.id));
  assert.equal(snapshots[0]?.id, "himalayas:jobs-fixture-h-001");
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
    () => mapHimalayasRecord({ ...seconds!, pubDate: 175000000000 }, NOW),
    AdapterInputError,
  );
});

test("acceptance 4: empty locations is worldwide only without a text contradiction", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const worldwide = snapshots.find(s => s.id === "himalayas:jobs-fixture-h-001")!;
  assert.equal(worldwide.hiring_options[0]?.geography.scope, "worldwide");
  assert.equal(worldwide.hiring_options[0]?.geography.allowed_countries.length, 0);
  assert.equal(worldwide.conflicts.length, 0);
  // Source said worldwide, text says Germany/Netherlands: the narrower,
  // evidenced reading wins and the contradiction is recorded, not hidden.
  const restricted = snapshots.find(s => s.id === "himalayas:jobs-fixture-h-002")!;
  assert.equal(restricted.hiring_options[0]?.geography.scope, "restricted");
  assert.deepEqual(restricted.hiring_options[0]?.geography.allowed_countries, ["DE", "NL"]);
  assert.equal(restricted.conflicts.includes("geography-source-vs-text"), true);
});

test("acceptance 4: remote-tag vs office text is conflicting, unknown stays unknown", () => {
  const snapshots = mapHimalayasFixture(NOW);
  const officeLean = snapshots.find(s => s.id === "himalayas:jobs-fixture-h-003")!;
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
    s.id === "himalayas:jobs-fixture-h-001"
      ? { ...s, description_text: `${s.description_text} Updated requirements.` }
      : s);
  const third = importOnce(changed, second.store, TWO_DAYS_LATER);
  const updated = third.store.records["himalayas:jobs-fixture-h-001"]!;
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
  assert.equal(partial.store.records["himalayas:jobs-fixture-h-002"]!.fullPassMisses, 0);
  assert.equal(partial.store.records["himalayas:jobs-fixture-h-002"]!.snapshot.lifecycle, "active");
  // Full passes < 24h apart do not accumulate misses either.
  const quick = importOnce([snapshots[0]!], seeded, "2026-09-24T18:00:00.000Z");
  assert.equal(quick.store.records["himalayas:jobs-fixture-h-002"]!.fullPassMisses, 0);
  // Two complete passes with a >=24h gap stale the absent record, never close it.
  const missedOnce = importOnce([snapshots[0]!], seeded, DAY_LATER);
  assert.equal(missedOnce.store.records["himalayas:jobs-fixture-h-002"]!.fullPassMisses, 1);
  assert.equal(missedOnce.store.records["himalayas:jobs-fixture-h-002"]!.snapshot.lifecycle, "active");
  const missedTwice = importOnce([snapshots[0]!], missedOnce.store, TWO_DAYS_LATER);
  const absent = missedTwice.store.records["himalayas:jobs-fixture-h-002"]!;
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
  const stored = store.records["himalayas:jobs-fixture-h-002"]!;
  const card = projectCard(stored, himalayasCandidatePolicy);
  assert.equal(card.source.displayName, "Himalayas");
  assert.equal(card.source.attributionRequired, true);
  assert.equal(card.source.backlinkRequired, true);
  assert.equal(card.publishedAt, "2025-06-16T15:06:40.000Z");
  assert.equal(card.lastSeenAt, NOW);
  assert.equal(card.firstSeenAt, NOW);
  assert.equal(card.salaryOriginalText, "60–75 EUR / hourly");
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
  // The activated real policy now publishes the gated fixture cards.
  const published = snapshotCatalogCards({
    store, getPolicy: getSourcePolicy, now: NOW,
  });
  assert.deepEqual(published.map(card => card.id).sort(),
    ["himalayas:jobs-fixture-h-001", "himalayas:jobs-fixture-h-002"]);
  assert.equal(published.every(card => card.visibility === "main_catalog"), true);
  // A disabled clone of the same policy contributes nothing — no mocks.
  assert.deepEqual(snapshotCatalogCards({
    store, getPolicy: id => (id === "himalayas"
      ? { ...himalayasCandidatePolicy, enabled: false }
      : getSourcePolicy(id)), now: NOW,
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
});
