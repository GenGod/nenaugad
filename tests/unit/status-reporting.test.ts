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
});
