// Unit tests for coding agents: the same run as `npm test`, minus the passing
// lines. A green run prints about ten lines instead of ~300, so repeated checks
// do not pile up in the agent's context. Failures, diagnostics and the summary
// print in full, and the exit code is the test runner's own.
import { spawnSync } from "node:child_process";

const run = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", "--test-reporter=spec", "tests/unit/*.test.ts"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
process.stdout.write(output.split("\n").filter(line => !/^\s*✔ /.test(line)).join("\n"));
process.exitCode = run.status ?? 1;
