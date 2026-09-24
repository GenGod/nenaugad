import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";

const violations = [];
async function walk(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await walk(filename));
    else result.push(filename);
  }
  return result;
}
const source = await walk("src");
for (const filename of source.filter(f => /\.(ts|tsx)$/.test(f))) {
  const text = await readFile(filename, "utf8");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(text))
    violations.push(`${filename}: no external transport is approved in S0`);
  if (/dangerouslySetInnerHTML/.test(text))
    violations.push(`${filename}: raw HTML insertion requires a separate reviewed task`);
  if (/\b(?:sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/.test(text))
    violations.push(`${filename}: possible credential`);
  if (/["']use client["']/.test(text) && /process\.env|server\//.test(text))
    violations.push(`${filename}: client/server boundary`);
}
const pkg = JSON.parse(await readFile("package.json","utf8"));
for (const forbidden of ["openai","@anthropic-ai/sdk","@google/genai","langchain","@langchain/langgraph"]) {
  if (pkg.dependencies?.[forbidden]) violations.push(`Unapproved paid/agent SDK: ${forbidden}`);
}
const env = await readFile(".env.example", "utf8");
for (const flag of ["LIVE_AI_ENABLED","LIVE_SOURCES_ENABLED","UPLOADS_ENABLED"]) {
  if (!env.includes(`${flag}=false`)) violations.push(`${flag} must be false in template`);
}
const required = ["AGENTS.md","START_HERE.md","IMPLEMENTATION_STATUS.md",
  "tasks/S0-001-install-and-verify.md","tasks/S1-001-first-source.md",
  "docs/solo/ATLAS_SOLO_PIPELINE.md","docs/solo/context/atlas.tokens.json"];
for (const filename of required) {
  try { await access(filename); } catch { violations.push(`Missing ${filename}`); }
}
if (violations.length) {
  console.error(violations.join("\n")); process.exitCode = 1;
} else console.log("Starter static guardrails passed. This is not an isolation or security audit.");
