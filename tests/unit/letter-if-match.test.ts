import assert from "node:assert/strict";
import { test } from "node:test";
import { versionFromIfMatch } from "../../src/server/letters/service.ts";

// B10: the header names a version, or nothing. Weak and malformed tags are
// refused instead of silently falling back to an unconditional write.
test("B10: If-Match parses strong ETags and refuses everything else", () => {
  assert.equal(versionFromIfMatch('"3"'), 3);
  assert.equal(versionFromIfMatch(' "12" '), 12);
  assert.equal(versionFromIfMatch('"0"'), 0);
  assert.equal(versionFromIfMatch("*"), "*");
  assert.equal(versionFromIfMatch("3"), null, "a bare number is not a strong ETag");
  assert.equal(versionFromIfMatch('W/"3"'), null, "weak tags are invalid for If-Match");
  assert.equal(versionFromIfMatch('"3a"'), null);
  assert.equal(versionFromIfMatch(""), null);
});
