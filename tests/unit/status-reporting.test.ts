import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { GET } from "../../src/app/api/health/route.ts";
import { doctorFailure, doctorReport } from "../../scripts/doctor.ts";
import { ConfigurationError, readConfig } from "../../src/server/config.ts";

// B14: both reports used to claim implemented features were missing.
test("health and doctor report the actual state of auth and uploads", async () => {
  const body = await (await GET()).json() as Record<string, unknown>;
  assert.equal(body.auth, "implemented");
  assert.equal(body.uploads, readConfig(process.env).uploads);

  const report = doctorReport({});
  assert.equal(report.auth, "implemented");
  assert.equal(report.uploads, false);
  assert.equal(report.realSources, "implemented");
  // DEPLOY-002: the mode exists; backups, restore and the production CSP do not.
  assert.equal(report.production, "mode_only");
  assert.equal(report.signUp, "open");
  assert.equal(doctorReport({ UPLOADS_ENABLED: "true" }).uploads, true);

  // Neither report may echo configuration values (secrets rule for doctor).
  assert.ok(!JSON.stringify(report).includes("postgres"));

  // B54: login needs the server secret; doctor says whether it is set, never its value,
  // reading it as next-auth does (NEXTAUTH_SECRET first, empty is missing).
  assert.equal(report.authSecret, "missing");
  const withSecret = doctorReport({ AUTH_SECRET: "doctor-test-secret-value" });
  assert.equal(withSecret.authSecret, "set");
  assert.ok(!JSON.stringify(withSecret).includes("doctor-test-secret-value"));
  assert.equal(doctorReport({ AUTH_SECRET: "" }).authSecret, "missing");
  assert.equal(doctorReport({ NEXTAUTH_SECRET: "", AUTH_SECRET: "doctor-test-secret-value" }).authSecret, "missing");
  assert.equal(doctorReport({ NEXTAUTH_SECRET: "doctor-test-secret-value" }).authSecret, "set");

  // B55: the service-wide registration limit, or "invalid" (registration then refuses).
  assert.equal(report.registrationLimit, 10);
  assert.equal(doctorReport({ REGISTRATION_LIMIT: "25" }).registrationLimit, 25);
  assert.equal(doctorReport({ REGISTRATION_LIMIT: "abc" }).registrationLimit, "invalid");
});

// DEPLOY-002: both reports name production, and neither prints its secret, address or
// database URL.
test("health and doctor report production without its secret, address or database URL", async () => {
  const secret = randomBytes(32).toString("hex");
  const host = `host-${randomBytes(4).toString("hex")}.example`;
  const dbPassword = `db-${randomBytes(6).toString("hex")}`;
  const production = {
    ATLAS_ENV: "production", DATA_BACKEND: "postgres", AUTH_SECRET: secret,
    NEXTAUTH_URL: `https://${host}`,
    DATABASE_URL: `postgresql://atlas:${dbPassword}@127.0.0.1:5432/atlas_starter`,
    // Stated, because GET reads process.env, which test:coverage fills from the local .env.
    LIVE_AI_ENABLED: "false", LIVE_SOURCES_ENABLED: "false", UPLOADS_ENABLED: "false",
  };
  const markers = [secret, host, dbPassword, "postgresql://"];

  const report = doctorReport(production);
  assert.equal(report.environment, "production");
  assert.equal(report.signUp, "closed");
  assert.equal(report.authSecret, "set");
  for (const marker of markers) assert.ok(!JSON.stringify(report).includes(marker), "doctor");

  const saved = { ...process.env };
  try {
    Object.assign(process.env, production);
    delete process.env.NEXTAUTH_SECRET; // next-auth would take it over AUTH_SECRET
    const text = await (await GET()).text();
    assert.equal((JSON.parse(text) as Record<string, unknown>).environment, "production");
    for (const marker of markers) assert.ok(!text.includes(marker), "health");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }

  // A refused configuration prints its code, nothing of the value.
  try {
    doctorReport({ ...production, AUTH_SECRET: `short-${host}` });
    assert.fail("must refuse");
  } catch (error) {
    assert.equal(doctorFailure(error), "CONFIGURATION_REJECTED: PRODUCTION_SECRET_TOO_SHORT");
  }
  assert.equal(doctorFailure(new ConfigurationError("NEXTAUTH_URL_NOT_LOOPBACK")), "CONFIGURATION_REJECTED: NEXTAUTH_URL_NOT_LOOPBACK");
  // Anything that is not a configuration refusal is not echoed at all.
  assert.equal(doctorFailure(new Error(`postgresql://atlas:${dbPassword}@db.example/x`)), "CONFIGURATION_REJECTED");
});
