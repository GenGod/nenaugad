import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import {
  hideJobForUser, listHiddenJobs, unhideJobForUser, FeedbackError,
} from "../../../../server/feedback-service.ts";
import { isHideReason } from "../../../../domain/feedback.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function readSnapshotId(body: unknown): string | null {
  const raw = body as { snapshotId?: unknown };
  return typeof raw.snapshotId === "string" && raw.snapshotId.length <= 160 ? raw.snapshotId : null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const items = await listHiddenJobs(snapshotPool(), user.id);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const snapshotId = readSnapshotId(body);
  const reason = (body as { reason?: unknown }).reason;
  if (snapshotId === null) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  if (!isHideReason(reason)) return NextResponse.json({ error: "INVALID_REASON" }, { status: 400 });
  try {
    await hideJobForUser({ pool: snapshotPool(), userId: user.id, snapshotId, reasonCode: reason });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "HIDE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const snapshotId = readSnapshotId(body);
  if (snapshotId === null) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const removed = await unhideJobForUser(snapshotPool(), user.id, snapshotId);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
