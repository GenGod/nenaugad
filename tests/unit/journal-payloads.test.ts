import assert from "node:assert/strict";
import { test } from "node:test";
import { clickPayload, impressionPayload } from "../../src/components/journal-reporter.ts";

// B1 / DGAP-001: both journal payloads are pinned here — ids, positions and the
// feed key, and nothing else. The client never supplies a propensity (B20) and
// the journal label is derived server-side from the feed key (B3). This is the
// closest testable layer for impression reporting: e2e runs on the fixture
// backend, where the matched feed is honestly empty and nothing is reported.
test("journal payloads: one item for a click, a batch for impressions, no probabilities", () => {
  const click = JSON.parse(clickPayload("jobicy:senior-data-engineer", "match", 3)) as Record<string, unknown>;
  assert.deepEqual(click, {
    type: "click",
    feed: "match",
    items: [{ snapshotId: "jobicy:senior-data-engineer", position: 3 }],
  });

  const impression = JSON.parse(impressionPayload(
    [{ snapshotId: "himalayas:data-engineer", position: 0 },
      { snapshotId: "jobicy:qa-lead", position: 1 }],
    "review",
  )) as Record<string, unknown>;
  assert.deepEqual(impression, {
    type: "impression",
    feed: "review",
    items: [
      { snapshotId: "himalayas:data-engineer", position: 0 },
      { snapshotId: "jobicy:qa-lead", position: 1 },
    ],
  });

  for (const item of impression.items as Record<string, unknown>[]) {
    assert.ok(!("propensity" in item), "the client never supplies a propensity (B20)");
  }
});
