import test from "node:test";
import assert from "node:assert/strict";
import { uploadsDisabledResponse } from "../../src/server/cv/gate.ts";

// B22: the flag is a kill switch for the whole CV surface, not only intake.
test("uploads gate: enabled passes, disabled and absent refuse with 503", async () => {
  assert.equal(uploadsDisabledResponse({ UPLOADS_ENABLED: "true" }), null);

  const absent = uploadsDisabledResponse({});
  assert.ok(absent, "an absent flag must refuse");
  assert.equal(absent.status, 503);
  assert.deepEqual(await absent.json(), { error: "UPLOADS_DISABLED" });

  assert.equal(uploadsDisabledResponse({ UPLOADS_ENABLED: "false" })?.status, 503);

  // Malformed values fail closed, not open (same rule as readConfig).
  assert.throws(() => uploadsDisabledResponse({ UPLOADS_ENABLED: "yes" }));
});
