import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const source = "docs/solo/context/nenaugad.tokens.json";
const target = "src/app/tokens.css";
const document = JSON.parse(await readFile(source, "utf8"));
function at(key) {
  let value = document;
  for (const part of key.split(".")) value = value[part];
  return value;
}
function resolve(token, seen = new Set()) {
  const value = token.$value;
  if (typeof value === "string" && /^\{[^}]+\}$/.test(value)) {
    const ref = value.slice(1, -1);
    if (seen.has(ref)) throw new Error(`Token cycle: ${ref}`);
    return resolve(at(ref), new Set([...seen, ref]));
  }
  switch (token.$type) {
    case "color": return value.hex;
    // DTCG dimensions carry their unit; rem values are authored as rem and
    // must not be divided again (the old generator scaled every value by 1/16).
    case "dimension": return `${value.value}${value.unit}`;
    case "duration": return `${value.value}${value.unit}`;
    case "fontFamily":
      return value.map(s => /\s/.test(s) ? `"${s}"` : s).join(", ");
    case "fontWeight":
    case "number": return `${value}`;
    case "cubicBezier": return `cubic-bezier(${value.join(", ")})`;
    default: return null;
  }
}
const lines = [];
function visit(value, names = []) {
  if (value && typeof value === "object" && "$value" in value) {
    const result = resolve(value);
    if (result !== null) lines.push(`  --ng-${names.join("-")}: ${result};`);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith("$")) visit(child, [...names, key]);
    }
  }
}
for (const group of Object.keys(document)) {
  if (!group.startsWith("$")) visit(document[group], [group]);
}
const output = `/* Generated from ${source}. Run npm run tokens; do not hand-edit. */\n:root {\n${lines.join("\n")}\n}\n`;
if (process.argv.includes("--check")) {
  let actual = "";
  try { actual = await readFile(target, "utf8"); } catch {}
  if (actual !== output) { console.error("TOKEN_DRIFT: run npm run tokens"); process.exitCode = 1; }
  else console.log(`Nenaugad token aliases match (${lines.length}).`);
} else {
  await writeFile(path.resolve(target), output);
  console.log(`Generated ${lines.length} CSS token aliases.`);
}
