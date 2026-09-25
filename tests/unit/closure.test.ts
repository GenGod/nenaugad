import assert from "node:assert/strict";
import { test } from "node:test";
import { headJobicyListing } from "../../src/server/import/fetcher.ts";
import {
  nextCounters, shouldQuarantine, CLOSE_AFTER_CONSECUTIVE_INACTIVE,
} from "../../src/server/import/closure-checks.ts";

test("headJobicyListing classifies HEAD outcomes; only 404/410 mean inactive", async () => {
  const originalFetch = globalThis.fetch;
  test.after(() => { globalThis.fetch = originalFetch; });
  const respond = (status: number) => async () =>
    new Response(null, { status, headers: { "content-type": "text/html" } });

  globalThis.fetch = respond(200) as typeof fetch;
  assert.equal((await headJobicyListing("https://jobicy.com/jobs/1-x")).result, "active");
  globalThis.fetch = respond(404) as typeof fetch;
  assert.equal((await headJobicyListing("https://jobicy.com/jobs/1-x")).result, "inactive");
  globalThis.fetch = respond(410) as typeof fetch;
  assert.equal((await headJobicyListing("https://jobicy.com/jobs/1-x")).result, "inactive");
  for (const status of [429, 500, 503, 301, 403]) {
    globalThis.fetch = respond(status) as typeof fetch;
    assert.equal((await headJobicyListing("https://jobicy.com/jobs/1-x")).result, "unknown",
      `status ${status}`);
  }
  globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
  assert.equal((await headJobicyListing("https://jobicy.com/jobs/1-x")).result, "unknown");
  // Foreign hosts and garbage URLs never produce a closure signal.
  assert.equal((await headJobicyListing("https://evil.example/jobs/1")).result, "unknown");
  assert.equal((await headJobicyListing("not a url")).result, "unknown");
});

test("counter transitions: active resets, unknown is neutral, inactive accumulates", () => {
  assert.equal(nextCounters({ previousConsecutiveInactive: 3, outcome: "active" }), 0);
  assert.equal(nextCounters({ previousConsecutiveInactive: 3, outcome: "unknown" }), 3);
  assert.equal(nextCounters({ previousConsecutiveInactive: 0, outcome: "inactive" }), 1);
  assert.equal(nextCounters({
    previousConsecutiveInactive: CLOSE_AFTER_CONSECUTIVE_INACTIVE - 1,
    outcome: "inactive",
  }), CLOSE_AFTER_CONSECUTIVE_INACTIVE);
});

test("mass-closure guard triggers only on a dominating inactive sample", () => {
  assert.equal(shouldQuarantine({ checked: 3, inactive: 3 }), false); // below min sample
  assert.equal(shouldQuarantine({ checked: 4, inactive: 3 }), true); // 75%
  assert.equal(shouldQuarantine({ checked: 8, inactive: 4 }), false); // exactly 50% is not "more than"
  assert.equal(shouldQuarantine({ checked: 8, inactive: 5 }), true);
  assert.equal(shouldQuarantine({ checked: 10, inactive: 2 }), false);
});
