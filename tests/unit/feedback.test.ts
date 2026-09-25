import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HIDE_REASONS, HIDE_REASON_CODES, isHideReason, hideReasonLabel,
} from "../../src/domain/feedback.ts";

test("hide reasons are a fixed code set with labels", () => {
  assert.ok(HIDE_REASONS.length >= 7);
  assert.deepEqual(HIDE_REASON_CODES, [...new Set(HIDE_REASON_CODES)]);
  assert.equal(isHideReason("salary_mismatch"), true);
  assert.equal(isHideReason("other"), true);
  assert.equal(isHideReason("free text"), false);
  assert.equal(isHideReason(42), false);
  assert.equal(isHideReason(null), false);
  assert.equal(hideReasonLabel("geography_mismatch"), "География найма не подходит");
  // Unknown codes render as-is (defensive display, storage enforces CHECK).
  assert.equal(hideReasonLabel("nope"), "nope");
});
