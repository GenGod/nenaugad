// Unit tests for the seen-set rule (design item A6, seen-set part).
//
// The rule decides whether a posting the candidate already saw comes back into
// the feed. What is pinned here: no suppression without evidence, a content
// change returns immediately, an action lifts the rule entirely, the window has
// an exact boundary, and the clock never comes from inside the module.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSeen, SEEN_CLOCK_SKEW_TOLERANCE_MS, SEEN_TTL_DAYS, SEEN_TTL_MS, type SeenJournalState } from "../../src/domain/seen-set.ts";

const NOW = "2026-09-29T12:00:00.000Z";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function ago(ms: number): string {
  return new Date(Date.parse(NOW) - ms).toISOString();
}

function state(overrides: Partial<SeenJournalState> = {}): SeenJournalState {
  return { lastShownAt: ago(2 * HOUR_MS), shownContentHash: "hash-a", ...overrides };
}

test("seen-set: a posting with no exposure record is shown", () => {
  assert.deepEqual(
    decideSeen({ state: undefined, contentHash: "hash-a", acted: false, now: NOW }),
    { suppress: false, reason: "unseen" },
  );
});

test("seen-set: within the window the posting stays out, with its exact return time", () => {
  const shownAt = ago(3 * DAY_MS);
  const outcome = decideSeen({ state: state({ lastShownAt: shownAt }), contentHash: "hash-a", acted: false, now: NOW });
  assert.equal(outcome.suppress, true);
  assert.equal(outcome.reason, "seen_recently");
  assert.equal(outcome.suppress && outcome.returnAt,
    new Date(Date.parse(shownAt) + SEEN_TTL_MS).toISOString(),
    "the return time is when the window ends, not a rounded guess");
});

test("seen-set: a changed posting returns immediately, a timed-out one returns by the clock", () => {
  // Same content, one minute after the window ended: shown again, reason honest.
  assert.deepEqual(
    decideSeen({ state: state({ lastShownAt: ago(SEEN_TTL_MS) }), contentHash: "hash-a", acted: false, now: NOW }),
    { suppress: false, reason: "window_expired" },
  );
  // One millisecond inside the window still suppresses: the boundary is exact.
  assert.equal(
    decideSeen({ state: state({ lastShownAt: ago(SEEN_TTL_MS - 1) }), contentHash: "hash-a", acted: false, now: NOW }).suppress,
    true,
  );
  // Different fingerprint one minute after the impression: back in the feed.
  assert.deepEqual(
    decideSeen({ state: state({ lastShownAt: ago(60_000), shownContentHash: "hash-old" }), contentHash: "hash-new", acted: false, now: NOW }),
    { suppress: false, reason: "changed" },
  );
});

test("seen-set: a click or a save lifts the rule — the candidate acted on it", () => {
  assert.deepEqual(
    decideSeen({ state: state({ lastShownAt: ago(60_000) }), contentHash: "hash-a", acted: true, now: NOW }),
    { suppress: false, reason: "acted" },
  );
});

test("seen-set: without evidence nothing is suppressed", () => {
  // The journal has no fingerprint (an impression written before the column, or
  // a caller that could not resolve the snapshot): "unknown" is not "seen".
  assert.deepEqual(
    decideSeen({ state: state({ shownContentHash: null }), contentHash: "hash-a", acted: false, now: NOW }),
    { suppress: false, reason: "unknown" },
  );
  assert.deepEqual(
    decideSeen({ state: state(), contentHash: null, acted: false, now: NOW }),
    { suppress: false, reason: "unknown" },
  );
  assert.deepEqual(
    decideSeen({ state: state({ lastShownAt: "not-a-date" }), contentHash: "hash-a", acted: false, now: NOW }),
    { suppress: false, reason: "unknown" },
  );
  // A timestamp a day ahead is a broken clock, not proof of exposure.
  assert.deepEqual(
    decideSeen({ state: state({ lastShownAt: new Date(Date.parse(NOW) + DAY_MS).toISOString() }), contentHash: "hash-a", acted: false, now: NOW }),
    { suppress: false, reason: "unknown" },
  );
});

test("seen-set: a show stamped a few seconds ahead still counts — the database clock is not the caller's", () => {
  // The journal writes created_at with the database clock while the caller passes
  // its own; a small difference is normal, and the posting really was shown.
  const slightlyAhead = new Date(Date.parse(NOW) + 2_000).toISOString();
  const outcome = decideSeen({ state: state({ lastShownAt: slightlyAhead }), contentHash: "hash-a", acted: false, now: NOW });
  assert.equal(outcome.suppress, true);
  assert.equal(outcome.suppress && outcome.returnAt,
    new Date(Date.parse(slightlyAhead) + SEEN_TTL_MS).toISOString());
  // Beyond the tolerance the timestamp is not usable and nothing is hidden.
  const farAhead = new Date(Date.parse(NOW) + SEEN_CLOCK_SKEW_TOLERANCE_MS + 1).toISOString();
  assert.equal(
    decideSeen({ state: state({ lastShownAt: farAhead }), contentHash: "hash-a", acted: false, now: NOW }).suppress,
    false,
  );
});

test("seen-set: the window is a documented value from the researched range, and the rule is deterministic", () => {
  assert.ok(SEEN_TTL_DAYS >= 7 && SEEN_TTL_DAYS <= 14,
    `research (part 2 C1) puts the seen window at 7-14 days, found ${SEEN_TTL_DAYS}`);
  assert.equal(SEEN_TTL_MS, SEEN_TTL_DAYS * DAY_MS);
  // Same inputs, same decision: no clock is read inside the module.
  const first = decideSeen({ state: state({ lastShownAt: ago(DAY_MS) }), contentHash: "hash-a", acted: false, now: NOW });
  const second = decideSeen({ state: state({ lastShownAt: ago(DAY_MS) }), contentHash: "hash-a", acted: false, now: NOW });
  assert.deepEqual(first, second);
});
