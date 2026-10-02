"use client";
import type { FeedKey } from "../domain/feed-order.ts";

// Journal payloads (items A8/B1, pinned by tests): what the candidate's browser
// is allowed to say to /api/v1/events. Ids, positions and the feed key — no
// profile data, no free text, no probabilities (propensity and the journal label
// are computed server-side, B2/B3/B20). Kept out of the .tsx components so the
// shapes are unit-testable without a DOM.

/** The exact request body for one impression batch. */
export function impressionPayload(
  items: readonly { snapshotId: string; position: number }[],
  feed: FeedKey,
): string {
  return JSON.stringify({ type: "impression", feed, items });
}

/** The exact request body for one click; exported so tests can pin its shape. */
export function clickPayload(snapshotId: string, feed: FeedKey, position: number | null): string {
  return JSON.stringify({ type: "click", feed, items: [{ snapshotId, position }] });
}

export function clickReport(snapshotId: string, feed: FeedKey, position: number | null): void {
  try {
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: clickPayload(snapshotId, feed, position),
      // keepalive: the navigation may start before the request finishes; without
      // it the browser cancels the report and the click is silently lost.
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Never block the link, whatever the environment does.
  }
}
