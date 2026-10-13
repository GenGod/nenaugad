import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../src/app/api/health/route.ts";
import { doctorReport } from "../../scripts/doctor.ts";
import { readConfig } from "../../src/server/config.ts";

// B14: both reports used to claim implemented features were missing.
test("health and doctor report the actual state of auth and uploads", async () => {
  const body = await (await GET()).json() as Record<string, unknown>;
  assert.equal(body.auth, "implemented");
  assert.equal(body.uploads, readConfig(process.env).uploads);

  const report = doctorReport({});
  assert.equal(report.auth, "implemented");
  assert.equal(report.uploads, false);
  assert.equal(report.realSources, "implemented");
  assert.equal(report.production, "blocked");
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
});
