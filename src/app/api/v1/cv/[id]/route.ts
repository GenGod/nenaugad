import { NextResponse } from "next/server";
import { currentUser } from "../../../../../server/auth.ts";
import { deleteCvUpload, getCvText } from "../../../../../server/cv/service.ts";
import { snapshotPool } from "../../../../../server/storage/snapshots.ts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const text = await getCvText(snapshotPool(), user.id, id);
  if (text === null) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id, text });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await params;
  const removed = await deleteCvUpload(snapshotPool(), user.id, id);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
