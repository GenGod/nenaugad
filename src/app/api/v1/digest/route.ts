import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { digestForUser } from "../../../../server/digest-service.ts";
import { lastFeedViewLabel } from "../../../../domain/digest.ts";

// GET /api/v1/digest — what is new since the candidate last saw the feed.
//
// Read-only by design: the cursor is the journal's newest impression (A8), so a
// request cannot move it. There is no POST here and no writing on a page load.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const digest = await digestForUser(user.id);
  if (digest.status === "no_profile") {
    return NextResponse.json({ error: "NO_PROFILE" }, { status: 409 });
  }
  return NextResponse.json({
    status: digest.status,
    since: lastFeedViewLabel(digest.cursor),
    newCount: digest.newCount,
    earlierCount: digest.earlierCount,
    seenSuppressed: digest.seenSuppressed,
    items: digest.items.map(item => ({
      id: item.snapshotId, title: item.title, company: item.company,
      source: item.sourceName, url: item.applyUrl,
      firstSeenAt: item.firstSeenAt ?? null, age: item.ageLabel, freshness: item.freshness,
    })),
  });
}
