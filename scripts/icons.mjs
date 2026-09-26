import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = "docs/solo/context/nenaugad.icons.json";
const spriteTarget = "public/icons/nenaugad.sprite.svg";
const registryTarget = "src/components/icon-registry.generated.ts";
const manifest = JSON.parse(await readFile(source, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("ICON_MANIFEST_EMPTY");
const names = new Set();
for (const icon of manifest) {
  if (!/^[a-z][a-z0-9-]*$/u.test(icon.name) || names.has(icon.name)) {
    throw new Error(`ICON_NAME_INVALID: ${icon.name}`);
  }
  if (typeof icon.svg_inner !== "string" || icon.svg_inner.trim() === "") {
    throw new Error(`ICON_BODY_MISSING: ${icon.name}`);
  }
  names.add(icon.name);
}
const symbols = manifest
  .map(icon => `  <symbol id="ng-${icon.name}" viewBox="0 0 24 24">${icon.svg_inner}</symbol>`)
  .join("\n");
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${symbols}\n</svg>\n`;
const registry = manifest
  .map(({ name, label_ru: label, group, usage }) => ({ name, label, group, usage }));
const output = `/* Generated from ${source}. Run npm run icons; do not hand-edit. */\n` +
  `export const iconManifest = ${JSON.stringify(registry, null, 2)} as const;\n` +
  `export type IconName = (typeof iconManifest)[number]["name"];\n` +
  `export type IconGroup = (typeof iconManifest)[number]["group"];\n`;

if (process.argv.includes("--check")) {
  const [actualSprite, actualRegistry] = await Promise.all([
    readFile(spriteTarget, "utf8").catch(() => ""),
    readFile(registryTarget, "utf8").catch(() => ""),
  ]);
  if (actualSprite !== sprite || actualRegistry !== output) {
    console.error("ICON_DRIFT: run npm run icons");
    process.exitCode = 1;
  } else {
    console.log(`Nenaugad icon sprite and registry match (${manifest.length} glyphs).`);
  }
} else {
  await mkdir("public/icons", { recursive: true });
  await mkdir("src/components", { recursive: true });
  await writeFile(spriteTarget, sprite);
  await writeFile(registryTarget, output);
  console.log(`Generated sprite (${manifest.length} glyphs) and icon registry.`);
}
