import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { localPool, migrate } from "../../scripts/db.ts";
import { clearAttempts, REGISTRATION_KEY } from "../../src/server/auth-attempts.ts";
import { ConfigurationError, registrationLimit } from "../../src/server/config.ts";
import { findUserByEmail, RegistrationError, registerWithinLimit } from "../../src/server/users.ts";
import { snapshotPool } from "../../src/server/storage/snapshots.ts";
import { POST } from "../../src/app/api/v1/auth/register/route.ts";

// B55 (owner decisions 2026-10-13): one service-wide counter; every registration that
// passes the form checks counts (a created account and EMAIL_TAKEN alike), before the
// password is hashed; 10 per 15 minutes; the REGISTRATION_LIMIT setting, 10 by default.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
// The route uses the app's own pool: point it at the isolated test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
delete process.env.REGISTRATION_LIMIT;
test.after(async () => {
  await pool.end();
  await snapshotPool().end();
});

const PASSWORD = "long-enough-password";
const MINUTE = 60_000;
// In the past, so these windows never meet the route test's, which uses the real clock.
const T0 = new Date("2026-01-09T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function email(): string {
  return `b55-${randomBytes(5).toString("hex")}@example.invalid`;
}
async function counter(): Promise<number | null> {
  const result = await pool.query("SELECT attempts FROM auth_attempts WHERE key = $1", [REGISTRATION_KEY]);
  const row = result.rows[0] as { attempts: number } | undefined;
  return row ? row.attempts : null;
}
function refused(code: string, retryAfterSeconds?: number) {
  return (error: unknown) => error instanceof RegistrationError && error.message === code &&
    (retryAfterSeconds === undefined || error.retryAfterSeconds === retryAfterSeconds);
}

test("REGISTRATION_LIMIT is a whole number from 1 to 10 000, and 10 when unset (B55)", () => {
  assert.equal(registrationLimit({}), 10);
  assert.equal(registrationLimit({ REGISTRATION_LIMIT: "" }), 10);
  assert.equal(registrationLimit({ REGISTRATION_LIMIT: "25" }), 25);
  assert.equal(registrationLimit({ REGISTRATION_LIMIT: "1" }), 1);
  assert.equal(registrationLimit({ REGISTRATION_LIMIT: "10000" }), 10000);
  for (const raw of ["0", "10001", "abc", "1.5", " 5", "-3", "1e3", "05"]) {
    assert.throws(() => registrationLimit({ REGISTRATION_LIMIT: raw }),
      (error: unknown) => error instanceof ConfigurationError && error.message === "REGISTRATION_LIMIT_INVALID", raw);
  }
});

test("ten registrations past the form checks are admitted per window; the eleventh creates nothing (B55)", async () => {
  await migrate(pool);
  await clearAttempts(pool, [REGISTRATION_KEY]);
  const limit = registrationLimit({});

  // The form checks come first: refused as before, and not counted.
  await assert.rejects(registerWithinLimit(pool, "not-an-email", PASSWORD, limit, T0), refused("INVALID_EMAIL"));
  await assert.rejects(registerWithinLimit(pool, email(), "short", limit, T0), refused("WEAK_PASSWORD"));
  assert.equal(await counter(), null);

  // A created account and an EMAIL_TAKEN answer count alike.
  const taken = email();
  await registerWithinLimit(pool, taken, PASSWORD, limit, T0);
  await assert.rejects(registerWithinLimit(pool, ` ${taken.toUpperCase()} `, PASSWORD, limit, T0), refused("EMAIL_TAKEN"));
  for (let i = 0; i < 8; i += 1) await registerWithinLimit(pool, email(), PASSWORD, limit, at(i * MINUTE));
  assert.equal(await counter(), 10);

  const late = email();
  await assert.rejects(registerWithinLimit(pool, late, PASSWORD, limit, at(10 * MINUTE)), refused("TOO_MANY_ATTEMPTS", 300));
  assert.equal(await findUserByEmail(pool, late), null);
  // A probe of a taken email gets the same refusal: the limit answers before the lookup.
  await assert.rejects(registerWithinLimit(pool, taken, PASSWORD, limit, at(10 * MINUTE)), refused("TOO_MANY_ATTEMPTS"));

  // Fifteen minutes after the window's first registration, the count starts again.
  const again = await registerWithinLimit(pool, late, PASSWORD, limit, at(15 * MINUTE));
  assert.equal(again.email, late);
  assert.equal(await counter(), 1);
  await clearAttempts(pool, [REGISTRATION_KEY]);
});

test("the limited registration refuses a limit outside 1 to 10 000 and counts nothing (B55 review 3)", async () => {
  await migrate(pool);
  await clearAttempts(pool, [REGISTRATION_KEY]);
  for (const limit of [0, -1, 1.5, 10_001, Number.NaN, Number.POSITIVE_INFINITY]) {
    const address = email();
    await assert.rejects(registerWithinLimit(pool, address, PASSWORD, limit, T0),
      (error: unknown) => error instanceof ConfigurationError && error.message === "REGISTRATION_LIMIT_INVALID", String(limit));
    assert.equal(await findUserByEmail(pool, address), null);
  }
  assert.equal(await counter(), null);
});

test("parallel registrations admit exactly the limit (B55)", async () => {
  await migrate(pool);
  await clearAttempts(pool, [REGISTRATION_KEY]);
  const addresses = Array.from({ length: 20 }, () => email());
  const results = await Promise.allSettled(addresses.map(address =>
    registerWithinLimit(pool, address, PASSWORD, registrationLimit({}), T0)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 10);
  for (const result of results) {
    if (result.status === "rejected") assert.ok(refused("TOO_MANY_ATTEMPTS")(result.reason));
  }
  const created = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE email = ANY($1::text[])", [addresses]);
  assert.equal((created.rows[0] as { n: number }).n, 10);
  await clearAttempts(pool, [REGISTRATION_KEY]);
});

test("the route answers 429 with Retry-After after ten, and refuses an invalid setting (B55)", async t => {
  await migrate(pool);
  await clearAttempts(pool, [REGISTRATION_KEY]);
  const post = (body: unknown) => POST(new Request("http://127.0.0.1/api/v1/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await post({ email: email(), password: PASSWORD })).status, 201);
  }
  const late = email();
  const refusal = await post({ email: late, password: PASSWORD });
  assert.equal(refusal.status, 429);
  const retryAfter = Number(refusal.headers.get("retry-after"));
  assert.ok(retryAfter >= 1 && retryAfter <= 900, String(retryAfter));
  assert.deepEqual(await refusal.json(), { error: "TOO_MANY_ATTEMPTS", retryAfterSeconds: retryAfter });
  assert.equal(await findUserByEmail(pool, late), null);
  await clearAttempts(pool, [REGISTRATION_KEY]);

  // An invalid setting refuses registration, counts nothing and logs its code.
  const logged = t.mock.method(console, "error", () => undefined);
  process.env.REGISTRATION_LIMIT = "abc";
  try {
    const address = email();
    const failed = await post({ email: address, password: PASSWORD });
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "REGISTRATION_FAILED" });
    assert.equal(await counter(), null);
    assert.equal(await findUserByEmail(pool, address), null);
  } finally {
    delete process.env.REGISTRATION_LIMIT;
  }
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    [JSON.stringify({ code: "REGISTRATION_FAILED", reason: "REGISTRATION_LIMIT_INVALID" })],
  ]);
});
