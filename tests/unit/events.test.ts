// Journal payload validation tests (design item A8).
//
// The parser is the only gate between a browser and a journal that later ranking
// work will trust, so these tests are strict on purpose: fixed type codes,
// snapshot ids in the source namespace, bounded batches, no duplicates, and a
// propensity that is either a real probability or null — never a guess.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EventValidationError, normalisePropensity, parseEventBatch, parseRankerVersion,
} from "../../src/domain/events.ts";

function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof EventValidationError) return error.message;
    throw error;
  }
  return "NO_ERROR";
}

const validItem = { snapshotId: "jobicy:senior-data-engineer", position: 0, propensity: 0.75 };

test("parseEventBatch accepts a valid batch and keeps the values", () => {
  const items = parseEventBatch({ type: "impression", items: [validItem] });
  assert.deepEqual(items, [{ snapshotId: validItem.snapshotId, position: 0, propensity: 0.75 }]);
  // Position and propensity are optional; a click usually has no propensity.
  const click = parseEventBatch({ type: "click", items: [{ snapshotId: validItem.snapshotId }] });
  assert.deepEqual(click, [{ snapshotId: validItem.snapshotId, position: null, propensity: null }]);
});

test("parseEventBatch rejects unknown types, bad ids, bad numbers and duplicates", () => {
  assert.equal(errorCode(() => parseEventBatch({ type: "purchase", items: [validItem] })), "INVALID_EVENT_TYPE");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [] })), "INVALID_EVENT_ITEMS");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: "nope" })), "INVALID_EVENT_ITEMS");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, snapshotId: "evil:1" }] })), "INVALID_SNAPSHOT_ID");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, snapshotId: "jobicy:" }] })), "INVALID_SNAPSHOT_ID");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, position: -1 }] })), "INVALID_POSITION");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, position: 1.5 }] })), "INVALID_POSITION");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, propensity: 1.2 }] })), "INVALID_PROPENSITY");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [{ ...validItem, propensity: "high" }] })), "INVALID_PROPENSITY");
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: [validItem, validItem] })), "DUPLICATE_EVENT_ITEM");
  // A batch is bounded: a client cannot flood the journal in one request.
  const flood = Array.from({ length: 51 }, (_, index) => ({
    snapshotId: `jobicy:job-${index}`, position: index, propensity: null,
  }));
  assert.equal(errorCode(() => parseEventBatch({ type: "impression", items: flood })), "INVALID_EVENT_ITEMS");
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

test("ranker version is optional, bounded and trimmed", () => {
  assert.equal(parseRankerVersion(undefined), null);
  assert.equal(parseRankerVersion(null), null);
  assert.equal(parseRankerVersion(""), null);
  assert.equal(parseRankerVersion("  v2-status  "), "v2-status");
  assert.equal(errorCode(() => parseRankerVersion("x".repeat(81))), "INVALID_RANKER_VERSION");
});
