import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobSnapshot } from "../../src/domain/source-contracts.ts";
import {
  jobicyContractFixture, mapJobicyFixture, mapJobicyRecord,
} from "../../src/server/import/jobicy-fixture.ts";
import {
  mapHimalayasFixture, AdapterInputError as HimalayaAdapterInputError,
} from "../../src/server/import/himalayas-fixture.ts";
import { runJobicyImport } from "../../src/server/import/jobicy-adapter.ts";
import { createMemoryPersistence } from "../../src/server/import/himalayas-adapter.ts";
import { jobicyCandidatePolicy } from "../../src/server/source-policies.ts";
import { fetchJobicyWindow } from "../../src/server/import/fetcher.ts";
import { classifySnapshot } from "../../src/domain/snapshot-projection.ts";

const NOW = "2026-09-25T12:00:00.000Z";
const enabledPolicy = { ...jobicyCandidatePolicy, enabled: true };

test("policy: jobicy matrix approved but not activated", () => {
  assert.equal(jobicyCandidatePolicy.status, "approved");
  assert.equal(jobicyCandidatePolicy.enabled, false);
  assert.equal(jobicyCandidatePolicy.terms_hash !== null, true);
  assert.equal(jobicyCandidatePolicy.valid_until, "2026-12-23T00:00:00.000Z");
  for (const permission of ["fetch", "cache", "store_full_text", "store_excerpt",
    "derive_fields", "publish_excerpt"] as const) {
    assert.equal(jobicyCandidatePolicy.permissions[permission], "allowed", permission);
  }
  for (const permission of ["publish_full_text", "process_with_ml", "send_to_ai_provider",
    "send_email", "index_web_page", "syndicate_google_jobs", "train_model",
    "direct_apply", "bulk_export"] as const) {
    assert.equal(jobicyCandidatePolicy.permissions[permission], "denied", permission);
  }
  assert.equal(jobicyCandidatePolicy.min_poll_interval_seconds, 21600);
});

test("mapper: fixture validates; ids stable; labels are honest", () => {
  const snapshots = mapJobicyFixture(NOW);
  assert.equal(snapshots.length, 3);
  for (const snapshot of snapshots) assert.equal(isJobSnapshot(snapshot), true);
  assert.deepEqual(snapshots.map(s => s.id),
    mapJobicyFixture("2026-09-26T00:00:00.000Z").map(s => s.id));

  const worldwide = snapshots.find(s => s.id === "jobicy:900001")!;
  assert.equal(worldwide.hiring_options[0]?.geography.scope, "worldwide");
  assert.equal(classifySnapshot(worldwide), "main_catalog");
  assert.equal(worldwide.dates.source_published_at, "2026-09-24T08:00:00.000Z");

  // "Europe" is a region: no invented country list, rule stays unknown.
  const region = snapshots.find(s => s.id === "jobicy:900002")!;
  assert.equal(region.hiring_options[0]?.geography.scope, "restricted");
  assert.deepEqual(region.hiring_options[0]?.geography.allowed_countries, []);
  assert.equal(region.hiring_options[0]?.geography.exhaustive, false);
  assert.equal(region.hiring_options[0]?.geography.region_text, "Europe");

  // "USA" maps to a concrete ISO country; office text quarantines.
  const usa = snapshots.find(s => s.id === "jobicy:900003")!;
  assert.deepEqual(usa.hiring_options[0]?.geography.allowed_countries, ["US"]);
  assert.equal(usa.workplace.verification_state, "conflicting");
  assert.equal(classifySnapshot(usa), "excluded");
  assert.equal(usa.compensation.original_text, "40–60 USD / hourly");
});

test("mapper: employment types mapped, unknown when absent; invalid input rejected", () => {
  const [fullTime, contract] = mapJobicyFixture(NOW);
  assert.deepEqual(fullTime!.hiring_options[0]?.employment_types, ["employment_full_time"]);
  assert.deepEqual(contract!.hiring_options[0]?.employment_types, ["contractor"]);
  const noType = mapJobicyRecord({ ...jobicyContractFixture[0]!, jobType: [] }, NOW);
  assert.deepEqual(noType.hiring_options[0]?.employment_types, ["unknown"]);

  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, id: 1.5 }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord(
    { ...jobicyContractFixture[0]!, url: "https://evil.example/jobs/1" }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, pubDate: "not-a-date" }, NOW),
    HimalayaAdapterInputError);
  assert.throws(() => mapJobicyRecord({ ...jobicyContractFixture[0]!, jobDescription: "" }, NOW),
    HimalayaAdapterInputError);
});

test("window import: always partial, idempotent, poll-gated, disabled refuses", async () => {
  // Disabled policy: no transport call.
  let calls = 0;
  const refused = await runJobicyImport({
    transport: async () => { calls += 1; return { status: "ok", jobs: [] }; },
    persistence: createMemoryPersistence(), policy: jobicyCandidatePolicy, now: NOW,
  });
  assert.equal(refused.result, "refused_disabled");
  assert.equal(calls, 0);

  const persistence = createMemoryPersistence();
  const window = async () => ({ status: "ok" as const, jobs: [...jobicyContractFixture] });
  const first = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.equal(first.result, "partial");
  assert.equal(first.recordsMapped, 3);
  // Re-import inside the 6h window is refused; at/after the gate it runs.
  const tooSoon = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: "2026-09-25T17:00:00.000Z",
  });
  assert.equal(tooSoon.result, "refused_poll_interval");
  assert.equal(tooSoon.nextEligibleAt, "2026-09-25T18:00:00.000Z");
  const afterGate = await runJobicyImport({
    transport: window, persistence, policy: enabledPolicy, now: "2026-09-25T18:00:00.000Z",
  });
  assert.equal(afterGate.result, "partial");
  const store = await persistence.loadStore();
  assert.equal(Object.keys(store.store.records).length, 3);
  for (const stored of Object.values(store.store.records)) {
    assert.equal(stored.snapshot.version, 1);
    assert.equal(stored.fullPassMisses, 0); // window absence never counts as a miss
  }
  // A shrinking window must not stale anything (absence ≠ closure).
  const shrunk = await runJobicyImport({
    transport: async () => ({ status: "ok" as const, jobs: [jobicyContractFixture[0]!] }),
    persistence, policy: enabledPolicy, now: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(shrunk.result, "partial");
  const afterShrink = await persistence.loadStore();
  for (const stored of Object.values(afterShrink.store.records)) {
    assert.equal(stored.snapshot.lifecycle, "active");
  }
  // Failure classification: 429 → retry, window not consumed.
  const failing = createMemoryPersistence();
  const rateLimited = await runJobicyImport({
    transport: async () => ({ status: "rate_limited" as const }),
    persistence: failing, policy: enabledPolicy, now: NOW,
  });
  assert.equal(rateLimited.result, "retry_scheduled");
  assert.equal(failing.state, null);
});

test("fetcher: jobicy window is pinned to jobicy.com", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ jobs: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const ok = await fetchJobicyWindow({ count: 250 });
  assert.equal(ok.status, "ok");
  const url = new URL(seen[0] ?? "");
  assert.equal(url.host, "jobicy.com");
  assert.equal(url.searchParams.get("count"), "200"); // capped at the documented max
});

test("cross-source: himalayas and jobicy fixtures never collide", () => {
  const ids = new Set([
    ...mapHimalayasFixture(NOW).map(s => s.id),
    ...mapJobicyFixture(NOW).map(s => s.id),
  ]);
  assert.equal(ids.size,
    mapHimalayasFixture(NOW).length + mapJobicyFixture(NOW).length);
  assert.equal(jobicyContractFixture.every(r => r.companyName.endsWith("Fixtures")), true);
});
