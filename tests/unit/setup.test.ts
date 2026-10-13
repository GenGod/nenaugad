import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// B54 (owner decision 2026-10-13): login needs the server secret, so `npm run setup` fills
// AUTH_SECRET in for a new .env, and never overwrites an existing one.
test("setup writes a random AUTH_SECRET into a new .env and leaves an existing one alone", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nenaugad-setup-"));
  try {
    await copyFile(resolve("scripts/setup.mjs"), join(directory, "setup.mjs"));
    await copyFile(resolve(".env.example"), join(directory, ".env.example"));
    const run = () => spawnSync(process.execPath, ["setup.mjs"], { cwd: directory, encoding: "utf8" });

    const first = run();
    assert.equal(first.status, 0);
    assert.doesNotMatch(first.stdout + first.stderr, /[0-9a-f]{32}/u, "setup prints no secret");
    const created = await readFile(join(directory, ".env"), "utf8");
    const secrets = created.match(/^AUTH_SECRET=(.*?)\r?$/gmu) ?? [];
    assert.equal(secrets.length, 1);
    assert.match(secrets[0]!, /^AUTH_SECRET=[0-9a-f]{64}\r?$/u);
    assert.match(created, /^POSTGRES_PASSWORD=[0-9a-f]{48}\r?$/mu);

    assert.equal(run().status, 0);
    assert.equal(await readFile(join(directory, ".env"), "utf8"), created);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
