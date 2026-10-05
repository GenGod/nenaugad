import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFailedLog } from "../../scripts/ci-status.ts";

test("ci-status groups a failed log by step and strips timestamps and colour codes", () => {
  const log = [
    "check\tRun npm run check\t2026-10-05T10:00:00.0000000Z > nenaugad@0.1.0 check",
    "check\tRun npm run check\t2026-10-05T10:00:01.0000000Z \u001b[31m✖ fails with detail\u001b[0m",
    "check\tRun npm run test:db\t2026-10-05T10:01:00.0000000Z Error: connect ECONNREFUSED 127.0.0.1:5432",
    "",
  ].join("\n");
  const summary = summarizeFailedLog(log);
  assert.match(summary, /── check › Run npm run check \(last 2 of 2 lines\)/u);
  assert.match(summary, /^✖ fails with detail$/mu);
  assert.doesNotMatch(summary, /2026-10-05T/u);
  assert.ok(!summary.includes("\u001b"), "colour codes are stripped");
  assert.match(summary, /── check › Run npm run test:db \(last 1 of 1 lines\)\nError: connect ECONNREFUSED/u);
});

test("ci-status keeps only the tail of a long failed step", () => {
  const log = Array.from({ length: 100 }, (_, index) =>
    `check\tRun npm run test:e2e\t2026-10-05T10:00:00.0000000Z line ${index}`).join("\n");
  assert.match(summarizeFailedLog(log, 3), /\(last 3 of 100 lines\)\nline 97\nline 98\nline 99$/u);
});
