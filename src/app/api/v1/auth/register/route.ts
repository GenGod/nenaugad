import { registerWithinLimit, RegistrationError } from "../../../../../server/users.ts";
import { snapshotPool } from "../../../../../server/storage/snapshots.ts";
import { ConfigurationError, registrationLimit } from "../../../../../server/config.ts";

// The standard Response (as /api/health), so the route itself runs under the Node test
// runner (B55).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const raw = body as { email?: unknown; password?: unknown };
  if (typeof raw.email !== "string" || typeof raw.password !== "string") {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  try {
    const user = await registerWithinLimit(snapshotPool(), raw.email, raw.password, registrationLimit(process.env));
    return Response.json({ ok: true, id: user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof RegistrationError) {
      if (error.message === "TOO_MANY_ATTEMPTS") {
        // B55: 10 per 15 minutes service-wide by default (owner decisions 2026-10-13).
        const retryAfterSeconds = error.retryAfterSeconds ?? 900;
        return Response.json({ error: "TOO_MANY_ATTEMPTS", retryAfterSeconds },
          { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });
      }
      const status = error.message === "EMAIL_TAKEN" ? 409 : 400;
      return Response.json({ error: error.message }, { status });
    }
    // A configuration error's own fixed code (such as REGISTRATION_LIMIT_INVALID); nothing
    // of any other error.
    const reason = error instanceof ConfigurationError ? error.message : undefined;
    console.error(JSON.stringify({ code: "REGISTRATION_FAILED", reason }));
    return Response.json({ error: "REGISTRATION_FAILED" }, { status: 500 });
  }
}
