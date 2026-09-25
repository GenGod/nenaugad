import { NextResponse } from "next/server";
import { currentUser } from "../../../../../server/auth.ts";
import {
  getLetterDetail, saveUserEdit, deleteLetter, LetterError,
} from "../../../../../server/letters/service.ts";
import { snapshotPool } from "../../../../../server/storage/snapshots.ts";

type Params = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function letterError(error: unknown): NextResponse | null {
  if (error instanceof LetterError) {
    const status = error.message === "VERSION_CONFLICT" ? 409
      : error.message === "LETTER_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const detail = await getLetterDetail({
    pool: snapshotPool(), userId: user.id, letterId: id,
  });
  if (!detail) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const text = (body as { body?: unknown }).body;
  const expected = (body as { expectedVersion?: unknown }).expectedVersion;
  if (typeof text !== "string" || typeof expected !== "number") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const revision = await saveUserEdit({
      pool: snapshotPool(), userId: user.id, letterId: id,
      body: text, expectedVersion: expected,
    });
    return NextResponse.json(revision, { status: 200 });
  } catch (error) {
    const failure = letterError(error);
    if (failure) return failure;
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const removed = await deleteLetter({
    pool: snapshotPool(), userId: user.id, letterId: id,
  });
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
