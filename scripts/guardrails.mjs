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
// The only reviewed external-transport module (S1-002 owner approval).
// Client components may call our own API with literal same-origin relative
// paths only; absolute URLs, variables, XHR and WebSocket stay banned.
const transportAllowlist = new Set(["src/server/import/fetcher.ts"]);
// Only the owner-reviewed provider transport may use the provider SDK. The batch
// client used to build its own OpenAI client and spend outside every budget guard
// (docs/OPEN_GAPS.md A3); that import was removed, and this keeps it removed.
const providerSdkAllowlist = new Set(["src/server/ai/openai-transport.ts"]);
const source = await walk("src");
for (const filename of source.filter(f => /\.(ts|tsx)$/.test(f))) {
  const relative = filename.split(path.sep).join("/");
  const text = await readFile(filename, "utf8");
  const withoutSameOriginFetches = text.replace(/fetch\(\s*(["'`])\//gu, "SAFE_SAME_ORIGIN_FETCH(");
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(withoutSameOriginFetches) && !transportAllowlist.has(relative))
    violations.push(`${filename}: external transport is only allowed in ${[...transportAllowlist].join(", ")}`);
  if (/(?:from\s*["']openai["']|require\(\s*["']openai["'])/.test(text) && !providerSdkAllowlist.has(relative))
    violations.push(`${filename}: the provider SDK is only allowed in ${[...providerSdkAllowlist].join(", ")}`);
  if (/dangerouslySetInnerHTML/.test(text))
    violations.push(`${filename}: raw HTML insertion requires a separate reviewed task`);
  if (/\b(?:sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/.test(text))
    violations.push(`${filename}: possible credential`);
  if (/["']use client["']/.test(text) && /process\.env|server\//.test(text))
    violations.push(`${filename}: client/server boundary`);
  // Model weights are fetched by scripts/models-fetch.ts and verified against
  // pinned hashes there. Turning remote loading back on inside src/ would put an
  // unverified download into a request path (B1, docs/EMBEDDING_PLAYBOOK.md).
  if (/allowRemoteModels\s*=\s*true/.test(text))
    violations.push(`${filename}: remote model downloads must stay off; weights come from npm run models:fetch`);
  // The uploads flag gates the WHOLE CV surface, not only intake (S3-001
  // acceptance 5; docs/OPEN_GAPS.md B22). Every route handler needs the gate.
  if (/src[\\/]app[\\/]api[\\/]v1[\\/]cv[\\/].*route\.ts$/.test(filename)
      && /export async function (GET|POST|DELETE)/.test(text)
      && !/uploadsDisabledResponse\s*\(/.test(text))
    violations.push(`${filename}: every CV route must pass the uploads gate (docs/OPEN_GAPS.md B22)`);
}
const pkg = JSON.parse(await readFile("package.json","utf8"));
// "openai" was owner-approved on 2026-09-25 (AI-002); all others remain banned.
for (const forbidden of ["@anthropic-ai/sdk","@google/genai","langchain","@langchain/langgraph"]) {
  if (pkg.dependencies?.[forbidden]) violations.push(`Unapproved paid/agent SDK: ${forbidden}`);
}
// "@huggingface/transformers" runs the local embedding model and was approved by
// the owner on 2026-09-30 (brief §7.2, task B1). Pinned exactly: a range would
// let the runtime of a fixed model artifact move on its own.
const pinnedDependencies = { "@huggingface/transformers": "4.3.0" };
for (const [name, version] of Object.entries(pinnedDependencies)) {
  const declared = pkg.dependencies?.[name];
  if (declared !== undefined && declared !== version)
    violations.push(`${name} must stay pinned to exactly ${version} (declared: ${declared})`);
}
// After an import, extraction goes through runExtractionPassAfterImport, which never
// throws: a direct call let one stuck posting fail and pause a healthy import
// (docs/OPEN_GAPS.md B31). The extract:fields CLI runs the pass on its own and may.
const importCallers = ["scripts/worker.ts", ...(await readdir("scripts"))
  .filter(name => /^import-.*\.ts$/.test(name)).map(name => `scripts/${name}`)];
for (const filename of importCallers) {
  if (/\brunExtractionPass\s*\(/.test(await readFile(filename, "utf8")))
    violations.push(`${filename}: after an import, call runExtractionPassAfterImport (docs/OPEN_GAPS.md B31)`);
}
// A pass checks each posting's source permission at the time its clock gives; a
// frozen time let a lapsed policy keep sending text until the pass ended
// (docs/OPEN_GAPS.md B49). Every caller hands the wall clock over in a literal
// argument, and a hold hint compares with a fresh time. A call this check cannot
// read (a variable argument, nested braces, a computed time) is refused, not trusted.
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const clockCallers = [
  ...(await readdir("scripts")).filter(name => name.endsWith(".ts")).map(name => `scripts/${name}`),
  ...(await walk("src")).map(name => name.split(path.sep).join("/")).filter(name => name.endsWith(".ts")),
].filter(name => name !== "src/server/ai/extraction-pass.ts");
for (const filename of clockCallers) {
  const text = withoutComments(await readFile(filename, "utf8"));
  const count = pattern => (text.match(pattern) ?? []).length;
  const passCalls = count(/\brunExtractionPass(?:AfterImport)?\s*\(/g);
  const hints = count(/\bholdHint\s*\(/g);
  if (passCalls + hints === 0) continue;
  const clockedCalls = count(
    /\brunExtractionPass(?:AfterImport)?\s*\(\s*\{[^{}]*\bclock:\s*systemClock\b(?=\s*[,}])[^{}]*\}\s*\)/g);
  const freshHints = count(/\bholdHint\s*\(\s*[\w.]+\s*,\s*systemClock\(\)\s*,?\s*\)/g);
  if (clockedCalls !== passCalls)
    violations.push(`${filename}: the extraction pass takes clock: systemClock in a literal argument (docs/OPEN_GAPS.md B49)`);
  if (freshHints !== hints)
    violations.push(`${filename}: holdHint compares with systemClock() (docs/OPEN_GAPS.md B49)`);
  const imported = /\bimport\s*\{[^}]*(?<!\bas\s+)\bsystemClock\b(?!\s+as\b)[^}]*\}\s*from\s*"[^"]*\/extraction-pass\.ts"/.test(text);
  const shadowed = /\b(?:const|let|var|function|class)\s+systemClock\b|\bsystemClock\s*=(?![=>])/.test(text);
  if (!imported || shadowed)
    violations.push(`${filename}: systemClock comes from extraction-pass.ts and is not redefined (docs/OPEN_GAPS.md B49)`);
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
