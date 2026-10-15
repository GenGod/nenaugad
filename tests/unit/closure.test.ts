import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchJobicyStatuses, JOBICY_STATUS_URL } from "../../src/server/import/fetcher.ts";
import {
  nextCounters, shouldQuarantine, jobicyIdOf, CLOSE_AFTER_CONSECUTIVE_INACTIVE,
} from "../../src/server/import/closure-checks.ts";

type Captured = { url: string; init: RequestInit | undefined };

function stubFetch(t: { after: (fn: () => void) => void }, respond: () => Response | Promise<Response>): Captured[] {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("fetchJobicyStatuses sends one pinned GET with the IDs, commas literal", async t => {
  const calls = stubFetch(t, json({ jobs: [] }));
  await fetchJobicyStatuses([153988, 151596]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `${JOBICY_STATUS_URL}?ids=153988,151596`);
  assert.equal(new URL(calls[0]!.url).host, "jobicy.com");
  assert.equal(calls[0]!.init?.method, "GET");
  assert.equal(calls[0]!.init?.redirect, "error");
});

test("fetchJobicyStatuses: only an explicit closed is inactive; doubt stays unknown", async t => {
  stubFetch(t, json({
    jobs: [
      { id: 1, status: "active" },
      { id: 2, status: "closed" },
      { id: 3, status: "unknown" },
      // 4 is missing from the answer.
      { id: 5, status: "Closed" }, // casing is not a reason to miss a closure
      { id: "6", status: "closed" }, // a numeric string ID is read as the number
      { id: 7, status: "closed" }, { id: 7, status: "active" }, // contradictory → unknown
      { id: 8, status: "closed" }, { id: 8, status: "closed" }, // a repeated, equal answer stands
      { id: 9, status: "filled" }, // an undocumented status
      { id: 10 }, null, "junk", { id: 999, status: "closed" }, // malformed, or not requested
    ],
  }));
  const result = await fetchJobicyStatuses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(Object.fromEntries(result.outcomes), {
    1: "active", 2: "inactive", 3: "unknown", 4: "unknown", 5: "inactive",
    6: "inactive", 7: "unknown", 8: "inactive", 9: "unknown", 10: "unknown",
  });
  assert.equal(result.outcomes.has(999), false);
});

test("fetchJobicyStatuses classifies failed requests and never reads them as answers", async () => {
  const cases: [() => Response | Promise<Response>, string][] = [
    [json({ success: false, error: "Too many requests" }, 429), "rate_limited"],
    [json({ success: false, error: "Bad ids" }, 400), "server_error"],
    [json({ success: false }, 503), "server_error"],
    [() => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } }), "server_error"],
    [() => new Response("{not json", { status: 200, headers: { "content-type": "application/json" } }), "server_error"],
    [json({ success: true, count: 0 }), "server_error"], // no jobs array
    [() => { throw new Error("offline"); }, "network_error"],
  ];
  for (const [respond, expected] of cases) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => respond()) as typeof fetch;
    try {
      assert.equal((await fetchJobicyStatuses([1])).status, expected, expected);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("fetchJobicyStatuses refuses a malformed batch without a request", async t => {
  const calls = stubFetch(t, json({ jobs: [] }));
  for (const ids of [[], Array.from({ length: 101 }, (_, i) => i + 1), [0], [-3], [1.5], [Number.MAX_SAFE_INTEGER + 1]]) {
    assert.equal((await fetchJobicyStatuses(ids)).status, "network_error", JSON.stringify(ids.slice(0, 3)));
  }
  assert.equal(calls.length, 0);
  assert.equal((await fetchJobicyStatuses(Array.from({ length: 100 }, (_, i) => i + 1))).status, "ok");
  assert.equal(calls.length, 1);
});

test("jobicyIdOf reads only a stored jobicy ID", () => {
  assert.equal(jobicyIdOf("jobicy:153988"), 153988);
  assert.equal(jobicyIdOf("himalayas:153988"), null);
  assert.equal(jobicyIdOf("jobicy:0"), null);
  assert.equal(jobicyIdOf("jobicy:12a"), null);
  assert.equal(jobicyIdOf("jobicy:"), null);
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
