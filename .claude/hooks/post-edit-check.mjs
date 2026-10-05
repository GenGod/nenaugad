// Claude Code PostToolUse hook: after an Edit/Write to a TS/JS file under src/,
// scripts/ or tests/, run the static guardrails and Biome on that file. Silent
// on success; on findings it prints them to stderr and exits 2, which Claude Code
// shows to Claude right away. This restores the per-edit static scan the previous
// coding host ran. `npm run check` remains the gate before a handoff.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
let input = "";
for await (const chunk of process.stdin) input += chunk;
let filePath;
try { filePath = JSON.parse(input).tool_input?.file_path; } catch { process.exit(0); }
if (typeof filePath !== "string") process.exit(0);

const relative = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");
if (!/^(src|scripts|tests)\/.+\.(ts|tsx|mjs|cjs|js)$/.test(relative)) process.exit(0);

const findings = [];
function run(label, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  if (result.status === 0) return;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n");
  findings.push(`[${label}]\n${output.slice(0, 40).join("\n")}`);
}
run("guardrails", ["scripts/guardrails.mjs"]);
// Without installed dependencies only the guardrails can run; do not block edits on that.
const biome = "node_modules/@biomejs/biome/bin/biome";
if (existsSync(path.join(root, biome))) run("biome", [biome, "lint", "--colors=off", relative]);

if (findings.length) {
  process.stderr.write(`Post-edit check failed after editing ${relative}:\n${findings.join("\n")}\nFix this before moving on.\n`);
  process.exit(2);
}
