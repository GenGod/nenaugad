// Journal payload validation tests (design item A8).
//
// The parser is the only gate between a browser and a journal that later ranking
// work will trust, so these tests are strict on purpose: fixed type codes,
// snapshot ids in the source namespace, bounded batches, no duplicates, and no
// client-supplied probabilities — propensity is computed server-side (B2/B20).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EventValidationError, normalisePropensity, parseEventBatch,
} from "../../src/domain/events.ts";
import { FEED_ORDERS, feedOrderLabel, isFeedKey } from "../../src/domain/feed-order.ts";

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof EventValidationError) return error.message;
    throw error;
  }
  return "NO_ERROR";
}

const validItem = { snapshotId: "jobicy:senior-data-engineer", position: 0 };

test("parseEventBatch accepts a valid batch and keeps the values", () => {
  const items = parseEventBatch({ type: "impression", items: [validItem] });
  assert.deepEqual(items, [{ snapshotId: validItem.snapshotId, position: 0 }]);
  // Position is optional; a click usually has none.
  const click = parseEventBatch({ type: "click", items: [{ snapshotId: validItem.snapshotId }] });
  assert.deepEqual(click, [{ snapshotId: validItem.snapshotId, position: null }]);
});

test("parseEventBatch rejects unknown types, bad ids, bad numbers and duplicates", () => {
  assert.equal(errorCode(() => parseEventBatch({ type: "purchase", items: [validItem] })), "INVALID_EVENT_TYPE");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [] })), "INVALID_EVENT_ITEMS");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: "nope" })), "INVALID_EVENT_ITEMS");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, snapshotId: "evil:1" }] })), "INVALID_SNAPSHOT_ID");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, snapshotId: "jobicy:" }] })), "INVALID_SNAPSHOT_ID");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, position: -1 }] })), "INVALID_POSITION");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, position: 1.5 }] })), "INVALID_POSITION");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [validItem, validItem] })), "DUPLICATE_EVENT_ITEM");
  // A batch is bounded: a client cannot flood the journal in one request.
  const flood = Array.from({ length: 51 }, (_, index) => ({ snapshotId: `jobicy:job-${index}`, position: index }));
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: flood })), "INVALID_EVENT_ITEMS");
});

test("B20: a client-supplied propensity is refused, never stored or overridden", () => {
  assert.equal(errorCode(() => parseEventBatch({
    type: "impression", items: [{ ...validItem, propensity: 0.75 }],
  })), "PROPENSITY_NOT_ACCEPTED");
  assert.equal(errorCode(() => parseEventBatch({
    type: "impression", items: [{ ...validItem, propensity: null }],
  })), "PROPENSITY_NOT_ACCEPTED");
});

test("propensity normalisation never invents a probability", () => {
  assert.equal(normalisePropensity(50, 100), 0.5);
  assert.equal(normalisePropensity(100, 100), 1);
  assert.equal(normalisePropensity(-10, 100), 0); // clamped, never negative
  assert.equal(normalisePropensity(150, 100), 1); // clamped, never above 1
  assert.equal(normalisePropensity(null, 100), null);
  assert.equal(normalisePropensity(50, null), null);
  assert.equal(normalisePropensity(50, 0), null, "no positive reference score means no probability");
  assert.equal(normalisePropensity(Number.NaN, 100), null);
});

test("B3: feed order labels are a closed, server-owned set", () => {
  assert.deepEqual(Object.keys(FEED_ORDERS).sort(), ["match", "review"]);
  assert.equal(isFeedKey("match"), true);
  assert.equal(isFeedKey("review"), true);
  // The old placeholder labels and anything else are not accepted.
  assert.equal(isFeedKey("v0-ai-score-then-catalog"), false);
  assert.equal(isFeedKey("__proto__"), false, "prototype keys are not feed keys");
  assert.equal(feedOrderLabel("match"), "feed-ai-score-then-catalog@1");
});
