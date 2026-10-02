import assert from "node:assert/strict";
import { test } from "node:test";
import { clickPayload } from "../../src/components/click-reporter.ts";

// B1: the click report's shape is pinned here — one snapshot, its feed and its
// position, and nothing else. The route re-validates exactly this shape.
test("B1: the click payload carries one item, the feed and no probabilities", () => {
  const payload = JSON.parse(clickPayload("jobicy:senior-data-engineer", "match", 3)) as Record<string, unknown>;
  assert.deepEqual(payload, {
    type: "click",
    feed: "match",
    items: [{ snapshotId: "jobicy:senior-data-engineer", position: 3 }],
  });
  assert.ok(!("propensity" in (payload.items as Record<string, unknown>[])[0]!),
    "the client never supplies a propensity (B20)");
});
