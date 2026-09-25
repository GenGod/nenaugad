import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import {
  countProfileVersions, deleteAllProfiles, latestProfile, saveProfileVersion,
} from "../../../../server/profile-service.ts";
import { deleteAllCvUploads } from "../../../../server/cv/service.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const pool = snapshotPool();
  const profile = await latestProfile(pool, user.id);
  const versions = await countProfileVersions(pool, user.id);
  return NextResponse.json({ versions, profile: profile?.input ?? null });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  try {
    const saved = await saveProfileVersion(snapshotPool(), user.id, body);
    // Event trigger: profile changed → cached relevance scores are stale.
    // Fire-and-forget: submit an async OpenAI Batch (50% discount) so fresh
    // scores are ready when the user next opens /matched.
    const { submitRelevanceBatch } = await import("../../../../server/ai/batch-queue-service.ts");
    void submitRelevanceBatch({ pool: snapshotPool(), userId: user.id })
      .catch(() => undefined);
    return NextResponse.json({ ok: true, version: saved.version });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_SAVE_FAILED";
    const known = ["INVALID_PROFILE_SHAPE", "INVALID_RESIDENCE_COUNTRY", "INVALID_TIMEZONE",
      "TIMEZONE_WITHOUT_COUNTRY", "INVALID_TARGET_ROLES", "INVALID_EMPLOYMENT_TYPES",
      "INVALID_AVAILABILITY", "INVALID_FLAGS", "INVALID_COMPENSATION"];
    return NextResponse.json({ error: known.includes(code) ? code : "PROFILE_SAVE_FAILED" },
      { status: known.includes(code) ? 400 : 500 });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const pool = snapshotPool();
  const removedProfiles = await deleteAllProfiles(pool, user.id);
  // Profile deletion also removes all stored CV uploads (spec 9/4.3).
  const removedCv = await deleteAllCvUploads(pool, user.id);
  return NextResponse.json({ ok: true, removed: removedProfiles, removedCvUploads: removedCv },
    { status: 200 });
}
