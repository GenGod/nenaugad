// Unit tests for the digest rules (design item A7).
//
// The digest claims "new since your last look". These tests pin what that claim
// is allowed to rest on: facts we recorded ourselves (when we first saw the
// posting, when the feed was last rendered), never a guess. Unknown age is not
// "just now", a broken clock is not a fresh sighting, and a first look says so.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyFreshness, compareForDigest, lastFeedViewLabel, type DigestCursor,
} from "../../src/domain/digest.ts";

const NOW = "2026-09-29T12:00:00.000Z";
const HOUR_MS = 3_600_000;

function ago(ms: number): string {
  return new Date(Date.parse(NOW) - ms).toISOString();
}

const FIRST_LOOK: DigestCursor = { lastFeedViewAt: null };

test("digest: without a feed view everything is new, and the page is told there is no window", () => {
  assert.equal(classifyFreshness(ago(3 * HOUR_MS), FIRST_LOOK, NOW), "new");
  assert.equal(classifyFreshness(ago(90 * 24 * HOUR_MS), FIRST_LOOK, NOW), "new",
    "a first look is not the same as 'appeared since yesterday'");
  assert.equal(lastFeedViewLabel(FIRST_LOOK), null);
  assert.equal(lastFeedViewLabel({ lastFeedViewAt: "not-a-date" }), null);
});

test("digest: after a feed view, only later sightings are new", () => {
  const cursor: DigestCursor = { lastFeedViewAt: ago(2 * HOUR_MS) };
  assert.equal(classifyFreshness(ago(1 * HOUR_MS), cursor, NOW), "new");
  assert.equal(classifyFreshness(ago(3 * HOUR_MS), cursor, NOW), "earlier");
  // The boundary is exact: something first seen at the very moment of the view
  // was already on the screen the candidate looked at.
  assert.equal(classifyFreshness(cursor.lastFeedViewAt ?? "", cursor, NOW), "earlier");
  assert.equal(classifyFreshness(ago(2 * HOUR_MS - 1), cursor, NOW), "new");
  assert.equal(lastFeedViewLabel(cursor), "2026-09-29 10:00 UTC");
});

test("digest: unknown and future ages are never new", () => {
  const cursor: DigestCursor = { lastFeedViewAt: ago(2 * HOUR_MS) };
  assert.equal(classifyFreshness(undefined, cursor, NOW), "unknown_age");
  assert.equal(classifyFreshness("not-a-date", cursor, NOW), "unknown_age");
  // Clock skew between hosts is not a fresh sighting.
  assert.equal(classifyFreshness(new Date(Date.parse(NOW) + HOUR_MS).toISOString(), cursor, NOW), "unknown_age");
  // An unusable cursor must not swallow new postings: it degrades to a first look.
  assert.equal(classifyFreshness(ago(1 * HOUR_MS), { lastFeedViewAt: "broken" }, NOW), "new");
});

test("digest: ordering is newest first, undated last, and deterministic", () => {
  const entries = [
    { snapshotId: "b", firstSeenAt: ago(3 * HOUR_MS) },
    { snapshotId: "a", firstSeenAt: ago(1 * HOUR_MS) },
    { snapshotId: "d", firstSeenAt: undefined },
    { snapshotId: "c", firstSeenAt: ago(3 * HOUR_MS) },
  ];
  const sorted = [...entries].sort(compareForDigest).map(entry => entry.snapshotId);
  assert.deepEqual(sorted, ["a", "b", "c", "d"]);
  // Same inputs, same order — and the comparator is a proper order (antisymmetric).
  assert.deepEqual([...entries].sort(compareForDigest).map(entry => entry.snapshotId), sorted);
  assert.equal(compareForDigest(entries[0]!, entries[3]!), -compareForDigest(entries[3]!, entries[0]!));
  assert.equal(compareForDigest(entries[0]!, entries[0]!), 0);
});
