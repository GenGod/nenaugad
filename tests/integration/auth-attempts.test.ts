import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { localPool, migrate } from "../../scripts/db.ts";
import {
  clearAttempts, deletionAttemptKey, loginAttemptKey, pruneAttempts, takeAttempt,
} from "../../src/server/auth-attempts.ts";
import { accountExists, authorizeCredentials, checkLogin, registerUser } from "../../src/server/users.ts";
import { AccountDeletionError, deleteAccount } from "../../src/server/account-deletion.ts";
import { ConfigurationError } from "../../src/server/config.ts";

// B53 (owner decisions 2026-10-13): a password attempt is counted before the password is
// checked; 5 attempts in 15 minutes, then refused even with the right password until the
// window ends. Login counts per email, deletion per account.
const pool = localPool(process.env.TEST_DATABASE_URL, true);
test.after(async () => { await pool.end(); });

// B54: the login key is derived from the server secret, read as next-auth reads it
// (NEXTAUTH_SECRET, else AUTH_SECRET). These tests bring their own.
const TEST_SECRET = "b54-test-only-secret-not-a-real-one";
delete process.env.NEXTAUTH_SECRET;
process.env.AUTH_SECRET = TEST_SECRET;

/** Runs `run` with exactly these secrets set, then restores the test secret. */
async function withSecrets<T>(secrets: Readonly<{ NEXTAUTH_SECRET?: string; AUTH_SECRET?: string }>, run: () => T | Promise<T>): Promise<T> {
  delete process.env.NEXTAUTH_SECRET;
  delete process.env.AUTH_SECRET;
  Object.assign(process.env, secrets);
  try {
    return await run();
  } finally {
    delete process.env.NEXTAUTH_SECRET;
    process.env.AUTH_SECRET = TEST_SECRET;
  }
}
const noSecret = (error: unknown) => error instanceof ConfigurationError && error.message === "AUTH_SECRET_REQUIRED";

const PASSWORD = "long-enough-password";
const MINUTE = 60_000;
// In the past, so pruning at T0 + 15 minutes never touches a row other tests write now.
const T0 = new Date("2026-01-05T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function email(): string {
  return `b53-${randomBytes(5).toString("hex")}@example.invalid`;
}
function key(): string {
  return `test:${randomBytes(6).toString("hex")}`;
}
async function counter(k: string): Promise<number | null> {
  const result = await pool.query("SELECT attempts FROM auth_attempts WHERE key = $1", [k]);
  const row = result.rows[0] as { attempts: number } | undefined;
  return row ? row.attempts : null;
}
function refusedWith(code: string, retryAfterSeconds?: number) {
  return (error: unknown) => error instanceof AccountDeletionError && error.message === code &&
    (retryAfterSeconds === undefined || error.retryAfterSeconds === retryAfterSeconds);
}

test("a key admits five attempts in fifteen minutes, then refuses until the window ends (B53)", async () => {
  await migrate(pool);
  const k = key();
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await takeAttempt(pool, k, at(i * MINUTE)), { admitted: true });
  }
  assert.deepEqual(await takeAttempt(pool, k, at(10 * MINUTE)), { admitted: false, retryAfterSeconds: 300 });
  // A refused attempt does not extend the window.
  assert.deepEqual(await takeAttempt(pool, k, at(15 * MINUTE - 1000)), { admitted: false, retryAfterSeconds: 1 });
  // Fifteen minutes after the window's first attempt the count starts again.
  assert.deepEqual(await takeAttempt(pool, k, at(15 * MINUTE)), { admitted: true });
  assert.equal(await counter(k), 1);
  for (let i = 0; i < 4; i += 1) assert.equal((await takeAttempt(pool, k, at(16 * MINUTE))).admitted, true);
  assert.equal((await takeAttempt(pool, k, at(16 * MINUTE))).admitted, false);
  await clearAttempts(pool, [k]);
  assert.equal(await counter(k), null);
  assert.equal((await takeAttempt(pool, k, at(16 * MINUTE))).admitted, true);
  await clearAttempts(pool, [k]);
});

test("parallel attempts on one key admit exactly five (B53)", async () => {
  await migrate(pool);
  const k = key();
  const results = await Promise.all(Array.from({ length: 20 }, () => takeAttempt(pool, k, T0)));
  assert.equal(results.filter(result => result.admitted).length, 5);
  assert.equal(await counter(k), 20);
  await clearAttempts(pool, [k]);
});

test("expired windows are pruned, and a locked row is skipped, not waited for (B53)", async () => {
  await migrate(pool);
  const old = key();
  const fresh = key();
  const locked = key();
  await takeAttempt(pool, old, T0);
  await takeAttempt(pool, locked, T0);
  await takeAttempt(pool, fresh, at(10 * MINUTE));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM auth_attempts WHERE key = $1 FOR UPDATE", [locked]);
    await pruneAttempts(pool, at(15 * MINUTE));
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  assert.equal(await counter(old), null);
  assert.equal(await counter(locked), 1);
  assert.equal(await counter(fresh), 1);
  await pruneAttempts(pool, at(15 * MINUTE));
  assert.equal(await counter(locked), null);
  await clearAttempts(pool, [fresh]);

  // One prune deletes at most 100 rows, so a login never does unbounded work.
  const prefix = key();
  await pool.query(
    "INSERT INTO auth_attempts (key, attempts, window_started_at) SELECT $1 || ':' || n, 1, $2 FROM generate_series(1, 150) AS n",
    [prefix, T0]);
  const left = async () => ((await pool.query("SELECT COUNT(*)::int AS n FROM auth_attempts WHERE key LIKE $1 || ':%'", [prefix])).rows[0] as { n: number }).n;
  await pruneAttempts(pool, at(15 * MINUTE));
  assert.equal(await left(), 50);
  await pruneAttempts(pool, at(15 * MINUTE));
  assert.equal(await left(), 0);
});

test("login counts every attempt per email before the password; a success clears it (B53)", async () => {
  await migrate(pool);
  const address = email();
  const user = await registerUser(pool, address, PASSWORD);
  const k = loginAttemptKey(address);
  assert.match(k, /^login:[0-9a-f]{64}$/u);
  assert.equal(loginAttemptKey(` ${address.toUpperCase()} `), k);

  for (let i = 0; i < 4; i += 1) {
    assert.deepEqual(await checkLogin(pool, address, "wrong-password", T0), { ok: false, reason: "INVALID_CREDENTIALS" });
  }
  const success = await checkLogin(pool, address, PASSWORD, T0);
  assert.equal(success.ok && success.user.id, user.id);
  assert.equal(await counter(k), null);

  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await checkLogin(pool, address, "wrong-password", at(i * MINUTE)), { ok: false, reason: "INVALID_CREDENTIALS" });
  }
  // The right password, and the same email written differently, are refused alike.
  assert.deepEqual(await checkLogin(pool, address, PASSWORD, at(5 * MINUTE)), { ok: false, reason: "TOO_MANY_ATTEMPTS" });
  assert.deepEqual(await checkLogin(pool, ` ${address.toUpperCase()} `, PASSWORD, at(5 * MINUTE)), { ok: false, reason: "TOO_MANY_ATTEMPTS" });
  const later = await checkLogin(pool, address, PASSWORD, at(15 * MINUTE));
  assert.equal(later.ok && later.user.id, user.id);

  // An email with no account is counted the same way, so the limit reveals nothing.
  const nobody = email();
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(await checkLogin(pool, nobody, PASSWORD, T0), { ok: false, reason: "INVALID_CREDENTIALS" });
  }
  assert.deepEqual(await checkLogin(pool, nobody, PASSWORD, T0), { ok: false, reason: "TOO_MANY_ATTEMPTS" });

  // The table holds a hash of the email, never the email.
  const stored = await pool.query("SELECT key FROM auth_attempts WHERE key LIKE '%' || $1 || '%' OR key LIKE '%' || $2 || '%'",
    [nobody, address]);
  assert.equal(stored.rowCount, 0);
  assert.equal(await counter(loginAttemptKey(nobody)), 6);
  await clearAttempts(pool, [loginAttemptKey(nobody)]);
});

test("deletion counts attempts per account; a refusal deletes nothing; a deletion removes its counters (B53)", async () => {
  await migrate(pool);
  const addressA = email();
  const a = await registerUser(pool, addressA, PASSWORD);
  const b = await registerUser(pool, email(), PASSWORD);
  await checkLogin(pool, addressA, "wrong-password", T0);
  await takeAttempt(pool, deletionAttemptKey(b.id), T0);
  assert.equal(await counter(loginAttemptKey(addressA)), 1);

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(deleteAccount(pool, a.id, "wrong-password", at(i * MINUTE)), refusedWith("PASSWORD_MISMATCH"));
  }
  // The wrong passwords' counts were committed, though nothing else changed.
  assert.equal(await counter(deletionAttemptKey(a.id)), 5);
  await assert.rejects(deleteAccount(pool, a.id, PASSWORD, at(5 * MINUTE)), refusedWith("TOO_MANY_ATTEMPTS", 600));
  assert.equal(await accountExists(pool, a.id), true);

  await deleteAccount(pool, a.id, PASSWORD, at(15 * MINUTE));
  assert.equal(await accountExists(pool, a.id), false);
  assert.equal(await counter(deletionAttemptKey(a.id)), null);
  assert.equal(await counter(loginAttemptKey(addressA)), null);
  assert.equal(await counter(deletionAttemptKey(b.id)), 1);

  // An account that no longer exists is refused before anything is counted.
  await assert.rejects(deleteAccount(pool, a.id, PASSWORD, at(16 * MINUTE)), refusedWith("ACCOUNT_NOT_FOUND"));
  assert.equal(await counter(deletionAttemptKey(a.id)), null);
  await deleteAccount(pool, b.id, PASSWORD, at(16 * MINUTE));
  assert.equal(await counter(deletionAttemptKey(b.id)), null);
});

test("the credentials provider throws only fixed codes: never a database message (B53)", async t => {
  await migrate(pool);
  const address = email();
  const user = await registerUser(pool, address, PASSWORD);
  const testPool = () => pool;
  assert.equal(await authorizeCredentials({ email: address, password: "" }, testPool, T0), null);
  assert.equal(await authorizeCredentials({ email: address, password: "wrong-password" }, testPool, T0), null);
  assert.deepEqual(await authorizeCredentials({ email: ` ${address.toUpperCase()} `, password: PASSWORD }, testPool, T0),
    { id: user.id, email: address });
  for (let i = 0; i < 5; i += 1) await authorizeCredentials({ email: address, password: "wrong-password" }, testPool, T0);
  await assert.rejects(authorizeCredentials({ email: address, password: PASSWORD }, testPool, T0),
    (error: unknown) => error instanceof Error && error.message === "TOO_MANY_ATTEMPTS");
  await clearAttempts(pool, [loginAttemptKey(address)]);

  // A database that cannot be reached, and a configuration that refuses, both answer
  // LOGIN_UNAVAILABLE; the log holds the code, and a configuration error's own fixed code
  // as the reason (B54), never a database message.
  const logged = t.mock.method(console, "error", () => undefined);
  const unreachable = new Pool({ connectionString: "postgres://nobody:nobody@127.0.0.1:1/atlas_starter_test", connectionTimeoutMillis: 2000 });
  try {
    for (const poolOf of [() => unreachable, () => { throw new ConfigurationError("DATABASE_URL_REQUIRED"); }]) {
      await assert.rejects(authorizeCredentials({ email: address, password: PASSWORD }, poolOf, T0),
        (error: unknown) => error instanceof Error && error.message === "LOGIN_UNAVAILABLE");
    }
  } finally {
    await unreachable.end();
  }
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    [JSON.stringify({ code: "LOGIN_CHECK_FAILED" })],
    [JSON.stringify({ code: "LOGIN_CHECK_FAILED", reason: "DATABASE_URL_REQUIRED" })],
  ]);
});

test("the login key is an HMAC of the email under a key derived from the server secret (B54)", async () => {
  const address = "Someone@Example.invalid";
  const k = loginAttemptKey(address);
  assert.match(k, /^login:[0-9a-f]{64}$/u);
  assert.equal(loginAttemptKey(` ${address.toLowerCase()} `), k);
  // Not the plain hash: a database reader without the secret cannot test a guessed email.
  assert.notEqual(k, `login:${createHash("sha256").update("someone@example.invalid").digest("hex")}`);
  // The construction, pinned: HMAC-SHA256 under HKDF-SHA256(secret, no salt, the label).
  // Changing it starts every login count over, so it changes only on purpose.
  const derived = Buffer.from(hkdfSync("sha256", TEST_SECRET, "", "nenaugad auth-attempts login v1", 32));
  assert.equal(k, `login:${createHmac("sha256", derived).update("someone@example.invalid").digest("hex")}`);
  const other = await withSecrets({ AUTH_SECRET: "another-secret" }, () => loginAttemptKey(address));
  assert.notEqual(other, k);
  // NEXTAUTH_SECRET comes first, as in next-auth.
  assert.equal(await withSecrets({ NEXTAUTH_SECRET: "another-secret", AUTH_SECRET: TEST_SECRET }, () => loginAttemptKey(address)), other);
  // Unset or empty is no secret: refused, never a fallback.
  for (const secrets of [{}, { AUTH_SECRET: "" }, { NEXTAUTH_SECRET: "", AUTH_SECRET: TEST_SECRET }]) {
    await withSecrets(secrets, () => assert.throws(() => loginAttemptKey(address), noSecret));
  }
});

test("without the server secret, login and deletion refuse and count nothing (B54)", async t => {
  await migrate(pool);
  const address = email();
  const user = await registerUser(pool, address, PASSWORD);
  // A window start no other test uses, so "nothing was counted" can be read off the table.
  const now = new Date("2026-01-07T09:00:00.000Z");
  // An expired counter: a login without the secret must not prune it either.
  const expired = key();
  await takeAttempt(pool, expired, new Date(now.getTime() - 20 * MINUTE));
  const logged = t.mock.method(console, "error", () => undefined);
  await withSecrets({}, async () => {
    await assert.rejects(authorizeCredentials({ email: address, password: PASSWORD }, () => pool, now),
      (error: unknown) => error instanceof Error && error.message === "LOGIN_UNAVAILABLE");
    await assert.rejects(checkLogin(pool, address, PASSWORD, now), noSecret);
    // Refused before the attempt is counted, whatever the password (review 1).
    await assert.rejects(deleteAccount(pool, user.id, "wrong-password", now), noSecret);
    await assert.rejects(deleteAccount(pool, user.id, PASSWORD, now), noSecret);
  });
  assert.equal(await counter(expired), 1);
  await clearAttempts(pool, [expired]);
  assert.deepEqual(logged.mock.calls.map(call => call.arguments), [
    [JSON.stringify({ code: "LOGIN_CHECK_FAILED", reason: "AUTH_SECRET_REQUIRED" })],
  ]);
  const counted = await pool.query("SELECT COUNT(*)::int AS n FROM auth_attempts WHERE window_started_at = $1", [now]);
  assert.equal((counted.rows[0] as { n: number }).n, 0);
  assert.equal(await counter(deletionAttemptKey(user.id)), null);
  assert.equal(await accountExists(pool, user.id), true);
  // With the secret back, the same account deletes normally.
  await deleteAccount(pool, user.id, PASSWORD, now);
  assert.equal(await accountExists(pool, user.id), false);
});
