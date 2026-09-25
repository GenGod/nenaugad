import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import {
  getOrCreateLetter, listLetters, LetterError,
} from "../../../../server/letters/service.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function letterError(error: unknown): NextResponse | null {
  if (error instanceof LetterError) {
    const status = error.message === "LETTER_EXISTS" ? 409
      : error.message === "SNAPSHOT_NOT_FOUND" ? 404
      : error.message === "LETTER_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const letters = await listLetters({ pool: snapshotPool(), userId: user.id });
  return NextResponse.json({ items: letters });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const jobId = (body as { jobId?: unknown }).jobId;
  const mode = (body as { mode?: unknown }).mode;
  // General mode: no job, profile-only letter.
  if (mode === "general") {
    try {
      const letter = await getOrCreateLetter({
        pool: snapshotPool(), userId: user.id, jobSnapshotId: null,
      });
      return NextResponse.json(letter, { status: 201 });
    } catch (error) {
      const failure = letterError(error);
      if (failure) return failure;
      return NextResponse.json({ error: "CREATE_FAILED" }, { status: 500 });
    }
  }
  if (typeof jobId !== "string") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const letter = await getOrCreateLetter({
      pool: snapshotPool(), userId: user.id, jobSnapshotId: jobId,
    });
    return NextResponse.json(letter, { status: 201 });
  } catch (error) {
    const failure = letterError(error);
    if (failure) return failure;
    return NextResponse.json({ error: "CREATE_FAILED" }, { status: 500 });
  }
}
