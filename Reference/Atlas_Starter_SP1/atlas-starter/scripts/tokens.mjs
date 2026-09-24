import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = "docs/solo/context/atlas.tokens.json";
const target = "src/app/tokens.css";
const document = JSON.parse(await readFile(source, "utf8"));
function at(key) {
  let value = document;
  for (const part of key.split(".")) value = value[part];
  return value;
}
function resolve(token, seen = new Set()) {
  let value = token.$value;
  if (typeof value === "string" && /^\{[^}]+\}$/.test(value)) {
    const ref = value.slice(1, -1);
    if (seen.has(ref)) throw new Error(`Token cycle: ${ref}`);
    return resolve(at(ref), new Set([...seen, ref]));
  }
  if (token.$type === "color") return value.hex;
  if (token.$type === "dimension") return `${value.value / 16}rem`;
  if (token.$type === "fontFamily") {
    return value.map(s => /\s/.test(s) ? `"${s}"` : s).join(", ");
  }
  return null;
}
const lines = [];
function visit(value, names = []) {
  if (value && typeof value === "object" && "$value" in value) {
    const result = resolve(value);
    if (result !== null) lines.push(`  --${names.join("-")}: ${result};`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith("$") && key !== "ref") visit(child, [...names, key]);
    }
  }
}
visit(document);
const output = `/* Generated from ${source}. Run npm run tokens; do not hand-edit. */\n:root {\n${lines.join("\n")}\n}\n`;
if (process.argv.includes("--check")) {
  let actual = "";
  try { actual = await readFile(target, "utf8"); } catch {}
  if (actual !== output) { console.error("TOKEN_DRIFT: run npm run tokens"); process.exitCode = 1; }
  else console.log(`Atlas token aliases match (${lines.length}).`);
} else {
  await writeFile(path.resolve(target), output);
  console.log(`Generated ${lines.length} CSS token aliases.`);
}
