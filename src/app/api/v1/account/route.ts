import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { AccountDeletionError, deleteAccount } from "../../../../server/account-deletion.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";

function unauthorized() {
  return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

// Deletes the session's own account and everything personal in it (B11-001). There is
// no account id in the request: the session names the account, and the password the
// user re-enters confirms it (owner decision 2026-10-13).
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "PASSWORD_REQUIRED" }, { status: 400 });
  }
  // Registration caps a password at 200 characters; a longer one is not hashed.
  if (password.length > 200) return NextResponse.json({ error: "PASSWORD_MISMATCH" }, { status: 403 });
  try {
    await deleteAccount(snapshotPool(), user.id, password);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AccountDeletionError) {
      return error.message === "PASSWORD_MISMATCH"
        ? NextResponse.json({ error: "PASSWORD_MISMATCH" }, { status: 403 })
        : unauthorized();
    }
    console.error(JSON.stringify({ code: "ACCOUNT_DELETION_FAILED" }));
    return NextResponse.json({ error: "ACCOUNT_DELETION_FAILED" }, { status: 500 });
  }
}
