import { NextResponse } from "next/server";
import { registerUser, RegistrationError } from "../../../../../server/users.ts";
import { snapshotPool } from "../../../../../server/storage/snapshots.ts";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const raw = body as { email?: unknown; password?: unknown };
  if (typeof raw.email !== "string" || typeof raw.password !== "string") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const user = await registerUser(snapshotPool(), raw.email, raw.password);
    return NextResponse.json({ ok: true, id: user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrationError) {
      const status = error.message === "EMAIL_TAKEN" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error(JSON.stringify({ code: "REGISTRATION_FAILED" }));
    return NextResponse.json({ error: "REGISTRATION_FAILED" }, { status: 500 });
  }
}
