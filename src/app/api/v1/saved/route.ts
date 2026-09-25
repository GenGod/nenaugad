import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import {
  listSavedJobs, saveJobForUser, unsaveJobForUser, ProfileServiceError,
} from "../../../../server/profile-service.ts";
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
  const rows = await listSavedJobs(snapshotPool(), user.id);
  return NextResponse.json({
    items: rows.map(row => ({ snapshotId: row.snapshotId, savedAt: row.savedAt, excerpt: row.excerpt })),
  });
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
  if (snapshotId === null) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  try {
    await saveJobForUser(snapshotPool(), user.id, snapshotId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ProfileServiceError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
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
  const removed = await unsaveJobForUser(snapshotPool(), user.id, snapshotId);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
