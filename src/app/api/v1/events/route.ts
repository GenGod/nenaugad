// POST /api/v1/events — journal one batch of impressions or clicks (item A8).
//
// The user id comes from the session only: a client cannot write events for
// somebody else, and there is no GET on purpose — nothing in the candidate-facing
// UI reads the journal back. The `feed` key names which rendered feed the events
// come from; the server maps it to the journal label itself (B3/B20).
import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { parseEventBatch, EventValidationError } from "../../../../domain/events.ts";
import { isFeedKey } from "../../../../domain/feed-order.ts";
import { recordClicks, recordImpressions } from "../../../../server/events-service.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  try {
    const items = parseEventBatch(body);
    const feed = (body as { feed?: unknown }).feed;
    if (!isFeedKey(feed)) {
      return NextResponse.json({ error: "INVALID_FEED" }, { status: 400 });
    }
    const type = (body as { type: string }).type;
    const pool = snapshotPool();
    const written = type === "impression"
      ? await recordImpressions({ pool, userId: user.id, items, feed })
      : await recordClicks({ pool, userId: user.id, items, feed });
    return NextResponse.json({ recorded: written }, { status: 201 });
  } catch (error) {
    if (error instanceof EventValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // A snapshot that no longer exists (FK 23503) is a client-visible 404, not a
    // server error: the posting vanished between rendering and reporting.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23503") {
      return NextResponse.json({ error: "SNAPSHOT_NOT_FOUND" }, { status: 404 });
    }
    console.error(JSON.stringify({ code: "EVENT_WRITE_FAILED" }));
    return NextResponse.json({ error: "EVENT_WRITE_FAILED" }, { status: 503 });
  }
}
