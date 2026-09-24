import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchHimalayasPage, HIMALAYAS_FEED_URL } from "../../src/server/import/fetcher.ts";
import {
  createMemoryPersistence, runHimalayasImport,
} from "../../src/server/import/himalayas-adapter.ts";
import { himalayasCandidatePolicy } from "../../src/server/source-policies.ts";
import { himalayasContractFixture } from "../../src/server/import/himalayas-fixture.ts";

const NOW = "2026-09-24T12:00:00.000Z";
const enabledPolicy = { ...himalayasCandidatePolicy, enabled: true };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

test("fetcher pins the destination, validates the cursor and classifies failures", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  test.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return jsonResponse({ jobs: [], nextCursor: null });
  }) as typeof fetch;
  const ok = await fetchHimalayasPage({ cursor: "abc.123_-~=" });
  assert.equal(ok.status, "ok");
  assert.equal(ok.nextCursor, null);
  const seen = new URL(calls[0] ?? "");
  assert.equal(seen.href.startsWith(HIMALAYAS_FEED_URL), true);
  assert.equal(seen.searchParams.get("cursor"), "abc.123_-~=");
  assert.equal(seen.searchParams.get("limit"), "20");

  globalThis.fetch = (async () => jsonResponse({ jobs: [] }, 429)) as typeof fetch;
  assert.equal((await fetchHimalayasPage()).status, "rate_limited");
  globalThis.fetch = (async () => jsonResponse({ jobs: [] }, 500)) as typeof fetch;
  assert.equal((await fetchHimalayasPage()).status, "server_error");
  globalThis.fetch = (async () => new Response("nope", {
    status: 200, headers: { "content-type": "text/plain" },
  })) as typeof fetch;
  assert.equal((await fetchHimalayasPage()).status, "server_error");
  globalThis.fetch = (async () => { throw new Error("dns"); }) as typeof fetch;
  assert.equal((await fetchHimalayasPage()).status, "network_error");

  // An invalid cursor is refused locally: no request leaves the process.
  let left = 0;
  globalThis.fetch = (async () => { left += 1; return jsonResponse({ jobs: [] }); }) as typeof fetch;
  const refused = await fetchHimalayasPage({ cursor: "https://evil.example/x" });
  assert.equal(refused.status, "network_error");
  assert.equal(left, 0);
});

test("adapter refuses a disabled or unapproved source without any transport call", async () => {
  let calls = 0;
  const report = await runHimalayasImport({
    transport: async () => { calls += 1; return { status: "ok", jobs: [], nextCursor: null }; },
    persistence: createMemoryPersistence(),
    policy: himalayasCandidatePolicy,
    now: NOW,
  });
  assert.equal(report.result, "refused_disabled");
  assert.equal(calls, 0);
});

test("adapter enforces the polling window and does not spend it on failures", async () => {
  const persistence = createMemoryPersistence();
  const feed = async () => ({ status: "ok" as const, jobs: [...himalayasContractFixture], nextCursor: null });
  const first = await runHimalayasImport({
    transport: feed, persistence, policy: enabledPolicy, now: NOW,
  });
  assert.equal(first.result, "applied");
  assert.equal(persistence.state?.lastRunAt, NOW);
  assert.equal(persistence.state?.nextCursor, null);

  const tooSoon = await runHimalayasImport({
    transport: feed, persistence, policy: enabledPolicy, now: "2026-09-24T13:00:00.000Z",
  });
  assert.equal(tooSoon.result, "refused_poll_interval");
  assert.equal(tooSoon.nextEligibleAt, "2026-09-25T12:00:00.000Z");

  const failed = createMemoryPersistence();
  const rateLimited = await runHimalayasImport({
    transport: async () => ({ status: "rate_limited" as const }),
    persistence: failed, policy: enabledPolicy, now: NOW,
  });
  assert.equal(rateLimited.result, "retry_scheduled");
  assert.equal(failed.state, null);
});

test("cursor budget yields a partial run with a checkpoint and no misses", async () => {
  const persistence = createMemoryPersistence();
  let page = 0;
  const report = await runHimalayasImport({
    transport: async () => {
      page += 1;
      return page === 1
        ? { status: "ok" as const, jobs: [...himalayasContractFixture], nextCursor: "page-2" }
        : { status: "ok" as const, jobs: [], nextCursor: null };
    },
    persistence,
    policy: enabledPolicy,
    now: NOW,
    maxPages: 1,
  });
  assert.equal(report.result, "partial");
  assert.equal(report.nextCursor, "page-2");
  assert.equal(persistence.state?.nextCursor, "page-2");
  for (const stored of Object.values(persistence.store.records)) {
    assert.equal(stored.fullPassMisses, 0);
    assert.equal(stored.snapshot.lifecycle, "active");
  }
});

test("two full passes 24h apart stale an absent record; retention deletes old ones", async () => {
  const persistence = createMemoryPersistence();
  const fullFeed = async () => ({
    status: "ok" as const, jobs: [...himalayasContractFixture], nextCursor: null,
  });
  const shrunkFeed = async () => ({
    status: "ok" as const, jobs: [himalayasContractFixture[0]!], nextCursor: null,
  });
  await runHimalayasImport({ transport: fullFeed, persistence, policy: enabledPolicy, now: NOW });
  await runHimalayasImport({
    transport: shrunkFeed, persistence, policy: enabledPolicy, now: "2026-09-25T12:00:00.000Z",
  });
  const absentId = "himalayas:jobs-fixture-h-002";
  const afterSecond = await persistence.loadStore();
  assert.equal(afterSecond.store.records[absentId]?.fullPassMisses, 1);
  assert.equal(afterSecond.store.records[absentId]?.snapshot.lifecycle, "active");
  await runHimalayasImport({
    transport: shrunkFeed, persistence, policy: enabledPolicy, now: "2026-09-26T12:00:00.000Z",
  });
  const afterThird = await persistence.loadStore();
  assert.equal(afterThird.store.records[absentId]?.snapshot.lifecycle, "stale");

  const shortRetention = createMemoryPersistence(1);
  await runHimalayasImport({
    transport: fullFeed, persistence: shortRetention, policy: enabledPolicy, now: NOW,
  });
  const deleted = await shortRetention.deleteExpired("2026-09-25T13:00:00.000Z");
  assert.equal(deleted, 3);
  const remaining = await shortRetention.loadStore();
  assert.equal(Object.keys(remaining.store.records).length, 0);
});
