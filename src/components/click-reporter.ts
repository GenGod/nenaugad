"use client";
import type { FeedKey } from "../domain/feed-order.ts";

// Click reporting (B1, the other half of the journal A8 started): when the
// candidate follows a posting's primary link, the journal records ONE click for
// that snapshot. The payload carries an id, a position and the feed key — the
// server attaches the label and the owner. Reporting must never affect the
// navigation, so the request is fire-and-forget and failure is swallowed here by
// the same rule as impressions.

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
