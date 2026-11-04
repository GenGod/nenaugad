import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnv } from "node:util";
import {
  ConfigurationError, PUBLIC_TEST_SECRETS, readConfig, secureCookies, signUpOpen,
} from "../../src/server/config.ts";
// Not in next-auth's exports map: read by path, to pin the installed version's default.
import { defaultCookies } from "../../node_modules/next-auth/core/lib/cookie.js";

// DEPLOY-002 (tasks/DEPLOY-002-production-mode.md): ATLAS_ENV=production runs only with
// PostgreSQL, a strong secret and a public https NEXTAUTH_URL; it has no sign-up; local and
// test accept only a loopback NEXTAUTH_URL.
const SECRET = randomBytes(32).toString("hex");
const PUBLIC_URL = "https://nenaugad.example";
// Every flag stated: the route test copies this into process.env, which `npm run
// test:coverage` fills from the developer's .env (uploads or live AI may be on there).
const PRODUCTION = Object.freeze({
  ATLAS_ENV: "production", DATA_BACKEND: "postgres", AUTH_SECRET: SECRET, NEXTAUTH_URL: PUBLIC_URL,
  LIVE_AI_ENABLED: "false", LIVE_SOURCES_ENABLED: "false", UPLOADS_ENABLED: "false",
});
type Env = Record<string, string | undefined>;

function refuses(env: Env, code: string, label = code) {
  assert.throws(() => readConfig(env),
    (error: unknown) => error instanceof ConfigurationError && error.message === code, label);
}

test("production starts with postgres, a strong secret and a public https address", () => {
  assert.deepEqual(readConfig(PRODUCTION), {
    environment: "production", backend: "postgres", liveAi: false, liveSources: false, uploads: false,
  });
  // The secret as next-auth reads it: NEXTAUTH_SECRET first.
  assert.equal(readConfig({ ...PRODUCTION, AUTH_SECRET: undefined, NEXTAUTH_SECRET: SECRET }).environment, "production");
  // A port and a base path are the owner's choice.
  assert.equal(readConfig({ ...PRODUCTION, NEXTAUTH_URL: "https://nenaugad.example:8443/app" }).environment, "production");
  // Live AI stays the owner's switch on the server (D6).
  assert.equal(readConfig({ ...PRODUCTION, LIVE_AI_ENABLED: "true" }).liveAi, true);
  for (const value of ["1", "", "yes"]) refuses({ ...PRODUCTION, LIVE_AI_ENABLED: value }, "LIVE_AI_ENABLED_INVALID");
  refuses({ ...PRODUCTION, LIVE_SOURCES_ENABLED: "true" }, "LIVE_SOURCES_ENABLED_NOT_IMPLEMENTED");
});

test("production refuses any backend but postgres", () => {
  refuses({ ...PRODUCTION, DATA_BACKEND: undefined }, "PRODUCTION_REQUIRES_POSTGRES", "unset");
  refuses({ ...PRODUCTION, DATA_BACKEND: "fixture" }, "PRODUCTION_REQUIRES_POSTGRES", "fixture");
  refuses({ ...PRODUCTION, DATA_BACKEND: "automatic" }, "INVALID_DATA_BACKEND");
});

test("production refuses a missing secret, one under 32 bytes, and the repository's test secrets", () => {
  refuses({ ...PRODUCTION, AUTH_SECRET: undefined }, "PRODUCTION_SECRET_REQUIRED", "unset");
  refuses({ ...PRODUCTION, AUTH_SECRET: "" }, "PRODUCTION_SECRET_REQUIRED", "empty");
  // next-auth takes an empty NEXTAUTH_SECRET over AUTH_SECRET: that is no secret.
  refuses({ ...PRODUCTION, NEXTAUTH_SECRET: "" }, "PRODUCTION_SECRET_REQUIRED", "empty NEXTAUTH_SECRET");
  // ...and a short NEXTAUTH_SECRET is the one in use, whatever AUTH_SECRET holds.
  refuses({ ...PRODUCTION, NEXTAUTH_SECRET: "x".repeat(31) }, "PRODUCTION_SECRET_TOO_SHORT", "short NEXTAUTH_SECRET");
  refuses({ ...PRODUCTION, AUTH_SECRET: "x".repeat(31) }, "PRODUCTION_SECRET_TOO_SHORT", "31 bytes");
  refuses({ ...PRODUCTION, AUTH_SECRET: "GENERATE_WITH_SETUP" }, "PRODUCTION_SECRET_TOO_SHORT", "placeholder");
  assert.equal(readConfig({ ...PRODUCTION, AUTH_SECRET: "x".repeat(32) }).environment, "production");
  // Bytes, not characters: "é" is two bytes in UTF-8.
  refuses({ ...PRODUCTION, AUTH_SECRET: "é".repeat(15) + "x" }, "PRODUCTION_SECRET_TOO_SHORT", "31 UTF-8 bytes");
  assert.equal(readConfig({ ...PRODUCTION, AUTH_SECRET: "é".repeat(16) }).environment, "production");

  // The repository is public: every secret committed for CI, the e2e server or a test is
  // known to anyone. They are read out of the files, so a new one is hard to miss: any
  // quoted string of 32 bytes or more without whitespace (titles and messages have spaces)
  // on a line that names a *SECRET, and the YAML values of AUTH_SECRET / NEXTAUTH_SECRET.
  const files = [
    "playwright.config.ts", "next.config.ts",
    ...["tests", "scripts", ".github"].flatMap(dir =>
      readdirSync(dir, { recursive: true, encoding: "utf8" }).map(name => join(dir, name))),
  ].filter(name => /\.(?:[cm]?[jt]s|ya?ml)$/u.test(name) && statSync(name).isFile());
  const committed = new Set<string>();
  for (const name of files) {
    for (const line of readFileSync(name, "utf8").split(/\r?\n/u)) {
      if (!/SECRET/u.test(line)) continue;
      for (const match of line.matchAll(/(["'`])([^"'`\s]+)\1/gu)) {
        if (new TextEncoder().encode(match[2] ?? "").length >= 32) committed.add(match[2] ?? "");
      }
      const yaml = /^\s*(?:NEXTAUTH_SECRET|AUTH_SECRET):\s*([^\s"'`]+)\s*$/u.exec(line);
      if (yaml?.[1]) committed.add(yaml[1]);
    }
  }
  // CI's, the e2e server's and the two integration tests' (B11, B54).
  assert.ok(committed.size >= 4, `found ${committed.size} committed secrets`);
  for (const secret of committed) {
    assert.ok(PUBLIC_TEST_SECRETS.includes(secret), "listed as public");
    refuses({ ...PRODUCTION, AUTH_SECRET: secret }, "PRODUCTION_SECRET_PUBLIC", "committed secret");
    refuses({ ...PRODUCTION, AUTH_SECRET: undefined, NEXTAUTH_SECRET: secret }, "PRODUCTION_SECRET_PUBLIC", "as NEXTAUTH_SECRET");
  }
});

test("production refuses a NEXTAUTH_URL that is missing, malformed or not https", () => {
  refuses({ ...PRODUCTION, NEXTAUTH_URL: undefined }, "PRODUCTION_URL_REQUIRED", "unset");
  refuses({ ...PRODUCTION, NEXTAUTH_URL: "" }, "PRODUCTION_URL_REQUIRED", "empty");
  // A scheme-less `name:port` parses with no host at all.
  for (const raw of ["not a url", "nenaugad.example", "https://", "https://exa mple.com", "nenaugad.example:443"]) {
    refuses({ ...PRODUCTION, NEXTAUTH_URL: raw }, "PRODUCTION_URL_INVALID", raw);
  }
  // next-auth's own parser checks the literal prefix, so an upper-case scheme is refused too.
  for (const raw of ["http://nenaugad.example", "HTTPS://nenaugad.example", "ftp://nenaugad.example", "ws://nenaugad.example"]) {
    refuses({ ...PRODUCTION, NEXTAUTH_URL: raw }, "PRODUCTION_URL_NOT_HTTPS", raw);
  }
});

test("production refuses a loopback or unspecified host in every form the URL parser accepts", () => {
  for (const raw of [
    "https://localhost", "https://localhost:3000", "https://LOCALHOST", "https://localhost.",
    "https://app.localhost", "https://app.localhost.", "https://127.0.0.1", "https://127.1",
    "https://127.0.0.1.", "https://127.255.255.254", "https://2130706433", "https://0x7f000001",
    "https://[::1]", "https://[0:0:0:0:0:0:0:1]", "https://[::ffff:127.0.0.1]",
    "https://[::127.0.0.1]", "https://[::7f00:1]",
    "https://localhost.localdomain", "https://ip6-localhost", "https://ip6-loopback",
    "https://0.0.0.0", "https://0", "https://[::]", "https://[::ffff:0.0.0.0]", "https://[::ffff:0:0]",
    "https://[::ffff:0.10.0.1]",
  ]) refuses({ ...PRODUCTION, NEXTAUTH_URL: raw }, "PRODUCTION_URL_LOOPBACK", raw);
  // Names that only look local are ordinary hosts.
  for (const raw of [
    "https://localhost.example", "https://127.example", "https://203.0.113.10", "https://[2001:db8::1]",
    "https://[::ffff:203.0.113.10]",
  ]) assert.equal(readConfig({ ...PRODUCTION, NEXTAUTH_URL: raw }).environment, "production", raw);
});

test("production keeps uploads off until the owner opens them (D6)", () => {
  refuses({ ...PRODUCTION, UPLOADS_ENABLED: "true" }, "PRODUCTION_UPLOADS_NOT_APPROVED");
  assert.equal(readConfig({ ...PRODUCTION, UPLOADS_ENABLED: "false" }).uploads, false);
  refuses({ ...PRODUCTION, UPLOADS_ENABLED: "1" }, "UPLOADS_ENABLED_NOT_IMPLEMENTED");
});

test("any other ATLAS_ENV is refused, not guessed", () => {
  for (const value of ["", "prod", "PRODUCTION", "Production", "staging", "development"]) {
    refuses({ ...PRODUCTION, ATLAS_ENV: value }, "INVALID_ATLAS_ENV", JSON.stringify(value));
  }
});

test("a refusal names its code and nothing of the configuration", () => {
  const marker = "marker-7f3a";
  const cases: Env[] = [
    { ...PRODUCTION, AUTH_SECRET: `short-${marker}` },
    { ...PRODUCTION, AUTH_SECRET: PUBLIC_TEST_SECRETS[0] },
    { ...PRODUCTION, NEXTAUTH_URL: `http://${marker}.example` },
    { ...PRODUCTION, NEXTAUTH_URL: `https://127.0.0.1/${marker}` },
    { ...PRODUCTION, NEXTAUTH_URL: `${marker} not a url` },
    { ATLAS_ENV: "local", NEXTAUTH_URL: `https://${marker}.example` },
    { ATLAS_ENV: "local", NEXTAUTH_URL: `${marker} not a url` },
    { ...PRODUCTION, ATLAS_ENV: `${marker}` },
  ];
  for (const env of cases) {
    try {
      readConfig(env);
      assert.fail("must refuse");
    } catch (error) {
      assert.ok(error instanceof ConfigurationError);
      assert.match(error.message, /^[A-Z_]+$/u);
      assert.equal(error.message.includes(marker), false);
      assert.equal(error.message.includes(SECRET), false);
    }
  }
});

test("local and test accept an unset NEXTAUTH_URL, and a set one only on loopback", () => {
  for (const environment of ["local", "test"]) {
    assert.equal(readConfig({ ATLAS_ENV: environment }).environment, environment);
    assert.equal(readConfig({ ATLAS_ENV: environment, NEXTAUTH_URL: "" }).environment, environment);
    for (const raw of ["http://127.0.0.1:3000", "http://localhost:3100", "http://[::1]:3000", "https://localhost"]) {
      assert.equal(readConfig({ ATLAS_ENV: environment, NEXTAUTH_URL: raw }).environment, environment, raw);
    }
    for (const raw of [PUBLIC_URL, "http://192.168.1.10:3000", "http://0.0.0.0:3000", "http://[::]:3000", "http://203.0.113.10"]) {
      refuses({ ATLAS_ENV: environment, NEXTAUTH_URL: raw }, "NEXTAUTH_URL_NOT_LOOPBACK", raw);
    }
    // next-auth would read a scheme-less value as https://; it is refused as malformed.
    for (const raw of ["not a url", "localhost:3000", "127.0.0.1:3000"]) {
      refuses({ ATLAS_ENV: environment, NEXTAUTH_URL: raw }, "NEXTAUTH_URL_INVALID", raw);
    }
  }
  // Unset ATLAS_ENV is local.
  refuses({ NEXTAUTH_URL: PUBLIC_URL }, "NEXTAUTH_URL_NOT_LOOPBACK");
});

test("the committed local configurations stay valid under the loopback rule", () => {
  // .env.example is what `npm run setup` copies into a new .env.
  assert.equal(readConfig(parseEnv(readFileSync(".env.example", "utf8"))).environment, "local");
  const launch = JSON.parse(readFileSync(".claude/launch.json", "utf8")) as
    { configurations: { env?: Env }[] };
  for (const configuration of launch.configurations) readConfig(configuration.env ?? {});
  // CI and the e2e server set no NEXTAUTH_URL at all (they rely on next-auth's default).
  assert.doesNotMatch(readFileSync(".github/workflows/ci.yml", "utf8"), /NEXTAUTH_URL/u);
  assert.doesNotMatch(readFileSync("playwright.config.ts", "utf8"), /NEXTAUTH_URL/u);
});

test("next start refuses a refused configuration when it loads next.config.ts; dev and build do not check there", async () => {
  // The phase Next passes for `next start` (spelled out in next.config.ts).
  const require = createRequire(import.meta.url);
  assert.equal((require("next/constants") as { PHASE_PRODUCTION_SERVER: string }).PHASE_PRODUCTION_SERVER, "phase-production-server");
  const { default: config } = await import("../../next.config.ts");
  const saved = { ...process.env };
  try {
    Object.assign(process.env, PRODUCTION, { UPLOADS_ENABLED: "true" });
    delete process.env.NEXTAUTH_SECRET; // next-auth would take it over AUTH_SECRET
    assert.throws(() => config("phase-production-server"),
      (error: unknown) => error instanceof ConfigurationError && error.message === "PRODUCTION_UPLOADS_NOT_APPROVED");
    for (const phase of ["phase-production-build", "phase-development-server"]) {
      assert.equal(typeof config(phase).headers, "function", phase);
    }
    process.env.UPLOADS_ENABLED = "false";
    assert.equal(typeof config("phase-production-server").headers, "function");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("sign-up is closed in production only", () => {
  assert.equal(signUpOpen(readConfig(PRODUCTION)), false);
  assert.equal(signUpOpen(readConfig({})), true);
  assert.equal(signUpOpen(readConfig({ ATLAS_ENV: "test" })), true);
});

test("production cookies are Secure and prefixed; local and test keep next-auth's default", () => {
  assert.equal(secureCookies(PRODUCTION), true);
  assert.equal(secureCookies({}), undefined);
  assert.equal(secureCookies({ ATLAS_ENV: "test" }), undefined);

  // What next-auth 4.24.15 does with `useSecureCookies: true` (core/lib/cookie.js), pinned so
  // an upgrade that changes it fails here.
  const secure = defaultCookies(true);
  assert.equal(secure.sessionToken.name, "__Secure-next-auth.session-token");
  assert.deepEqual(secure.sessionToken.options, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  assert.equal(secure.callbackUrl.name, "__Secure-next-auth.callback-url");
  assert.equal(secure.callbackUrl.options.secure, true);
  assert.equal(secure.csrfToken.name, "__Host-next-auth.csrf-token");
  assert.equal(secure.csrfToken.options.secure, true);
  assert.equal(defaultCookies(false).sessionToken.name, "next-auth.session-token");
  assert.equal(defaultCookies(false).sessionToken.options.secure, false);

  // The wiring. `src/server/auth.ts` loads only under Next's bundler (its default import of
  // the CommonJS credentials provider), so its options are checked here by their source, and
  // the Set-Cookie of a production build is checked by hand (the task file's manual path).
  assert.match(readFileSync("src/server/auth.ts", "utf8"), /^\s*useSecureCookies: secureCookies\(process\.env\),\r?$/mu);
});

test("production refuses every registration before it reads the body or opens a pool", async () => {
  const saved = { ...process.env };
  const holder = globalThis as { nenaugadSnapshotPool?: unknown };
  try {
    Object.assign(process.env, PRODUCTION);
    delete process.env.NEXTAUTH_SECRET; // next-auth would take it over AUTH_SECRET
    // Were the route to reach the database, the pool would refuse with DATABASE_URL_REQUIRED.
    delete process.env.DATABASE_URL;
    const { POST } = await import("../../src/app/api/v1/auth/register/route.ts");
    for (const body of [JSON.stringify({ email: "deploy002@example.invalid", password: "long-enough-password" }), "{not json", ""]) {
      const request = new Request("http://127.0.0.1:3000/api/v1/auth/register", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      });
      const response = await POST(request);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "REGISTRATION_CLOSED" });
      assert.equal(request.bodyUsed, false);
    }
    assert.equal(holder.nenaugadSnapshotPool, undefined);

    // A refused configuration refuses registration too, by its code only, before the body.
    process.env.UPLOADS_ENABLED = "true";
    const logged: string[] = [];
    const error = console.error;
    console.error = (line: unknown) => { logged.push(String(line)); };
    try {
      const request = new Request("http://127.0.0.1:3000/api/v1/auth/register", { method: "POST", body: "{}" });
      const refused = await POST(request);
      assert.equal(refused.status, 500);
      assert.deepEqual(await refused.json(), { error: "REGISTRATION_FAILED" });
      assert.equal(request.bodyUsed, false);
    } finally {
      console.error = error;
    }
    assert.deepEqual(logged.map(line => JSON.parse(line)), [{ code: "REGISTRATION_FAILED", reason: "PRODUCTION_UPLOADS_NOT_APPROVED" }]);
    assert.equal(holder.nenaugadSnapshotPool, undefined);
    process.env.UPLOADS_ENABLED = "false";

    // Local registration is untouched: a malformed body gets its usual answer.
    process.env.ATLAS_ENV = "local";
    delete process.env.NEXTAUTH_URL;
    const local = await POST(new Request("http://127.0.0.1:3000/api/v1/auth/register", { method: "POST", body: "{not json" }));
    assert.equal(local.status, 400);
    assert.deepEqual(await local.json(), { error: "INVALID_JSON" });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
