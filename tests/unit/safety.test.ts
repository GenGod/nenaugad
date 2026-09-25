import test from "node:test";
import assert from "node:assert/strict";
import { readConfig, localDatabaseUrl } from "../../src/server/config.ts";
import { sourceAllowed } from "../../src/server/policy.ts";
import { generateCoverLetter } from "../../src/server/ai/disabled.ts";

test("starter defaults to fixture/local with all live features disabled", () => {
  assert.deepEqual(readConfig({}), {
    environment: "local", backend: "fixture", liveAi:false, liveSources:false, uploads:false
  });
});
test("production cannot be enabled through one environment switch", () => {
  assert.throws(() => readConfig({ ATLAS_ENV: "production" }), /PRODUCTION_NOT_IMPLEMENTED/u);
});
test("live AI and live sources fail closed, including malformed flags", () => {
  for (const key of ["LIVE_AI_ENABLED","LIVE_SOURCES_ENABLED"]) {
    for (const value of ["true","1","FALSE","", "enabled"]) {
      assert.throws(() => readConfig({ [key]:value }), /NOT_IMPLEMENTED/u);
    }
  }
});
test("uploads stay disabled by default and reject malformed flags; explicit local opt-in only", () => {
  assert.equal(readConfig({}).uploads, false);
  assert.equal(readConfig({ UPLOADS_ENABLED: "false" }).uploads, false);
  for (const value of ["1","FALSE","","enabled"]) {
    assert.throws(() => readConfig({ UPLOADS_ENABLED: value }), /NOT_IMPLEMENTED/u);
  }
  assert.equal(readConfig({ UPLOADS_ENABLED: "true" }).uploads, true);
});
test("postgres can be selected, but never as a silent fallback", () => {
  assert.equal(readConfig({ DATA_BACKEND:"postgres" }).backend, "postgres");
  assert.throws(() => readConfig({ DATA_BACKEND:"automatic" }), /INVALID_DATA_BACKEND/u);
});
test("SP-T03 only synthetic catalog display is permitted", () => {
  const config = readConfig({});
  assert.equal(sourceAllowed("atlas-fixtures", "catalog", config), true);
  for (const operation of ["external_ai","export","live_fetch"] as const) {
    assert.equal(sourceAllowed("atlas-fixtures",operation,config),false);
  }
  assert.equal(sourceAllowed("himalayas", "catalog", config), false);
});
test("generation refuses without making a paid or fake call", async () => {
  await assert.rejects(generateCoverLetter, /AI_NOT_IMPLEMENTED/u);
});
test("database scripts reject remote hosts and unsafe options", () => {
  for (const url of [
    "postgresql://a:b@db.example/atlas_starter",
    "postgresql://a:b@169.254.169.254/atlas_starter",
    "postgresql://a:b@127.0.0.1/customer_data",
    "postgresql://a:b@127.0.0.1/atlas_starter?host=db.example",
    "https://a:b@127.0.0.1/atlas_starter",
    "postgresql://a@127.0.0.1/atlas_starter"
  ]) assert.throws(() => localDatabaseUrl(url));
});
test("integration tests require a dedicated exact test database", () => {
  assert.throws(() => localDatabaseUrl("postgresql://a:b@127.0.0.1/atlas_starter",true), /ISOLATED_DATABASE_REQUIRED/u);
  assert.equal(localDatabaseUrl("postgresql://a:b@127.0.0.1/atlas_starter_test",true),
    "postgresql://a:b@127.0.0.1/atlas_starter_test");
});
test("errors do not disclose connection strings or passwords", () => {
  const secret = "sensitive-example-not-a-real-password";
  try { localDatabaseUrl(`postgresql://u:${secret}@remote.example/customer`); assert.fail("must reject"); }
  catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes("postgresql://"), false);
  }
});
