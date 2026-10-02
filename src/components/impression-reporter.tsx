"use client";
import { useEffect } from "react";
import type { FeedKey } from "../domain/feed-order.ts";

// The feed tells the journal what it showed (item A6, completing the half A8
// deferred). The batch carries ids, positions and WHICH FEED it was — no profile
// data, no free text, no probabilities. The server attaches the content
// fingerprint and computes the propensity itself, so nothing sent from here can
// claim "the candidate never saw this" or invent a show probability (B2/B20).
//
// What counts as an impression: the posting was in the rendered result list, and
// `position` is its place in that list. Viewport tracking is neither attempted
// nor claimed.
//
// Reporting must never affect the feed: failures are swallowed on purpose, and
// the request is aborted if the component goes away before it finishes.
const MAX_ITEMS_PER_REQUEST = 50;

export function ImpressionReporter({ items, feed }: {
  items: readonly { snapshotId: string; position: number }[];
  feed: FeedKey;
}) {
  // The payload is a plain string, so the effect below re-runs only when its
  // CONTENT changes — not on every re-render of the list.
  const payload = JSON.stringify({
    type: "impression",
    feed,
    items: items.slice(0, MAX_ITEMS_PER_REQUEST),
  });
  useEffect(() => {
    if (items.length === 0) return;
    const controller = new AbortController();
    void fetch("/api/v1/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: controller.signal,
    }).catch(() => undefined);
    return () => controller.abort();
    // `items` is only read for the emptiness check; `payload` carries the data.
  }, [payload, items.length]);

  return null;
}
