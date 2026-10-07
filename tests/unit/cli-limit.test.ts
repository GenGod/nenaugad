import test from "node:test";
import assert from "node:assert/strict";
import { limitArg } from "../../scripts/cli-limit.ts";

test("cli limit: absent means no limit, a positive integer is the limit", () => {
  assert.deepEqual(limitArg([]), { ok: true });
  assert.deepEqual(limitArg(["--source=himalayas"]), { ok: true });
  assert.deepEqual(limitArg(["--limit=5"]), { ok: true, limit: 5 });
  assert.deepEqual(limitArg(["--source=himalayas", "--limit=25"]), { ok: true, limit: 25 });
});

test("cli limit: a limit that is present but malformed is refused, never read as no limit (B32)", () => {
  for (const argv of [
    ["--limit", "5"], ["--limit"], ["--limit="], ["--limit=0"], ["--limit=-1"], ["--limit=5x"],
    ["--limit=1.5"], ["--limit= 5"], ["--limit=05"], ["--limit=1234567"], ["--limit=5", "--limit=7"],
  ]) {
    assert.deepEqual(limitArg(argv), { ok: false }, argv.join(" "));
  }
});
