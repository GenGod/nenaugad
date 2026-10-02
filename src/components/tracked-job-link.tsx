"use client";
import type { FeedKey } from "../domain/feed-order.ts";
import { clickReport } from "./journal-reporter.ts";

// The posting's primary link in the matched feed: a normal external link that
// also journals the click (B1) before the browser leaves the page. Styling and
// semantics are the caller's anchor — this only adds the report.
export function TrackedJobLink({ snapshotId, feed, position, href, children }: {
  snapshotId: string;
  feed: FeedKey;
  position: number;
  href: string;
  children: React.ReactNode;
}) {
  return <a href={href} rel="nofollow noreferrer" target="_blank"
    onClick={() => clickReport(snapshotId, feed, position)}>{children}</a>;
}
