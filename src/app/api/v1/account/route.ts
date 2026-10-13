import { NextResponse } from "next/server";
import { currentUser } from "../../../../server/auth.ts";
import { AccountDeletionError, deleteAccount } from "../../../../server/account-deletion.ts";
import { snapshotPool } from "../../../../server/storage/snapshots.ts";
import { ConfigurationError } from "../../../../server/config.ts";

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
      if (error.message === "TOO_MANY_ATTEMPTS") {
        // B53: 5 attempts per 15 minutes per account (owner decision 2026-10-13).
        const retryAfterSeconds = error.retryAfterSeconds ?? 900;
        return NextResponse.json({ error: "TOO_MANY_ATTEMPTS", retryAfterSeconds },
          { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
      }
      return error.message === "PASSWORD_MISMATCH"
        ? NextResponse.json({ error: "PASSWORD_MISMATCH" }, { status: 403 })
        : unauthorized();
    }
    // A configuration error's own fixed code (such as AUTH_SECRET_REQUIRED, B54); nothing
    // of any other error.
    const reason = error instanceof ConfigurationError ? error.message : undefined;
    console.error(JSON.stringify({ code: "ACCOUNT_DELETION_FAILED", reason }));
    return NextResponse.json({ error: "ACCOUNT_DELETION_FAILED" }, { status: 500 });
  }
}
