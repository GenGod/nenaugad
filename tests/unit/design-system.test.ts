import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { iconManifest } from "../../src/components/icon-registry.generated.ts";

// DS-001 coverage, moved to Signal 2.0 by DS-002 (owner decision 2026-11-02):
// the generated token layer, the icon pipeline and the stylesheet must stay
// inside the system. These tests fail on drift that a screenshot cannot catch
// (a renamed token, a screen-local color, an executable glyph body).

const KIT_TOKEN_COUNT = 147;
const ICON_COUNT = 64;
const ICON_GROUPS = ["navigation", "actions", "conditions", "documents"] as const;

async function readTokenMap(): Promise<Map<string, string>> {
  const css = await readFile("src/app/tokens.css", "utf8");
  return new Map(
    [...css.matchAll(/^ {2}(--[\w-]+): (.+);$/gmu)].map(match => [match[1]!, match[2]!]),
  );
}

test("tokens.css carries the full Nenaugad set with Signal values", async () => {
  const tokens = await readTokenMap();
  assert.equal(tokens.size, KIT_TOKEN_COUNT);
  const expected: Readonly<Record<string, string>> = {
    // Reference layer, verbatim from docs/solo/context/NENAUGAD_SIGNAL.md.
    "--ng-ref-paper": "#F1F8F9",
    "--ng-ref-ink": "#04191F",
    "--ng-ref-cyan400": "#22DEE6",
    "--ng-ref-petrol600": "#005F75",
    // Semantic layer maps onto the same values (generator resolves refs).
    "--ng-color-bg-canvas": "#F1F8F9",
    "--ng-color-action-primary": "#22DEE6",
    "--ng-color-text-link": "#005F75",
    "--ng-color-focus-ring": "#04191F",
    // "Unknown" is ink on white with a hatch, not amber.
    "--ng-color-status-review-text": "#04191F",
    "--ng-color-status-review-bg": "#FFFFFF",
    "--ng-color-status-success-solid": "#229944",
    "--ng-color-status-danger-solid": "#DB2C2B",
    "--ng-font-ui": "Geologica, system-ui, Arial, sans-serif",
    "--ng-font-display": "Tektur, \"Arial Narrow\", system-ui, sans-serif",
    "--ng-font-mono": "\"Martian Mono\", ui-monospace, monospace",
    "--ng-weight-bold": "800",
    // Scales keep their authored units: px spaces, rem type, ms motion.
    "--ng-space-s24": "24px",
    "--ng-radius-card": "2px",
    "--ng-radius-control": "6px",
    "--ng-radius-pill": "999px",
    "--ng-layout-container": "1248px",
    "--ng-layout-target": "44px",
    "--ng-size-display": "4rem",
    "--ng-size-overline": "0.75rem",
    "--ng-leading-display": "4.25rem",
    "--ng-motion-fast": "120ms",
    "--ng-motion-standard": "180ms",
    "--ng-motion-ease": "cubic-bezier(0.2, 0, 0, 1)",
    "--ng-layer-modal": "100",
    "--ng-weight-semibold": "600",
    // Brand parameters added by Nenaugad 1.3.
    "--ng-brand-headerWidth": "208px",
    "--ng-brand-headerWidthMobile": "176px",
    "--ng-brand-iconStroke": "1.75",
  };
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(tokens.get(name), value, name);
  }
});

test("component aliases mirror the semantic palette", async () => {
  const tokens = await readTokenMap();
  assert.equal(
    tokens.get("--ng-component-button-primary-background"),
    tokens.get("--ng-color-action-primary"),
  );
  // Signal: ink on the cyan button; white on cyan is 1.66:1 and forbidden.
  assert.equal(
    tokens.get("--ng-component-button-primary-foreground"),
    tokens.get("--ng-color-text-primary"),
  );
  assert.equal(
    tokens.get("--ng-component-card-padding"),
    tokens.get("--ng-space-s24"),
  );
  assert.equal(
    tokens.get("--ng-component-condition-pass-foreground"),
    tokens.get("--ng-color-status-success-text"),
  );
  assert.equal(
    tokens.get("--ng-component-condition-unknown-foreground"),
    tokens.get("--ng-color-status-review-text"),
  );
  assert.equal(
    tokens.get("--ng-component-condition-fail-foreground"),
    tokens.get("--ng-color-status-danger-text"),
  );
});

test("icon registry: 64 canonical glyphs in four documented groups", () => {
  assert.equal(iconManifest.length, ICON_COUNT);
  const names = iconManifest.map(icon => icon.name);
  assert.equal(new Set(names).size, ICON_COUNT);
  for (const icon of iconManifest) {
    assert.match(icon.name, /^[a-z][a-z0-9-]*$/u);
    assert.ok(icon.label.trim().length > 0, icon.name);
    assert.ok((ICON_GROUPS as readonly string[]).includes(icon.group), icon.group);
    assert.ok(icon.usage.trim().length > 0, icon.name);
  }
});

test("sprite serves every manifest glyph and nothing executable", async () => {
  const sprite = await readFile("public/icons/nenaugad.sprite.svg", "utf8");
  assert.match(sprite, /^<svg [^>]*aria-hidden="true"/u);
  assert.equal([...sprite.matchAll(/<symbol id="ng-/gu)].length, ICON_COUNT);
  for (const icon of iconManifest) {
    assert.ok(sprite.includes(`<symbol id="ng-${icon.name}"`), icon.name);
  }
  assert.doesNotMatch(sprite, /<script/iu);
  assert.doesNotMatch(sprite, /\son[a-z]+\s*=/iu);
});

test("globals.css references only defined custom properties", async () => {
  const [globals, tokens] = await Promise.all([
    readFile("src/app/globals.css", "utf8"),
    readFile("src/app/tokens.css", "utf8"),
  ]);
  const defined = new Set<string>();
  for (const match of tokens.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]!);
  for (const match of globals.matchAll(/(^|[{;\s])(--[\w-]+)\s*:/g)) defined.add(match[2]!);
  const used = new Set([...globals.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]!));
  const missing = [...used].filter(name => !defined.has(name));
  assert.deepEqual(missing, [], "undefined custom properties referenced in globals.css");
});

test("globals.css introduces no colors of its own", async () => {
  const globals = await readFile("src/app/globals.css", "utf8");
  // Signal 2.0 has no shadows and no screen-local accents: every color is a
  // token or derived from one (the dialog backdrop is color-mix over ink).
  const found = [...globals.matchAll(/#[0-9a-f]{3,8}\b/giu)].map(match => match[0]!.toLowerCase());
  assert.deepEqual([...new Set(found)], [], "screen-local colors are forbidden without a system review");
  assert.doesNotMatch(globals, /rgba?\(/u, "raw rgb() colors bypass the token layer");
});

test("Signal text pairs meet WCAG 2.2 AA", async () => {
  const tokens = await readTokenMap();
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string): number => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high! + 0.05) / (low! + 0.05);
  };
  const pairs: ReadonlyArray<readonly [string, string, number]> = [
    ["--ng-color-text-primary", "--ng-color-bg-canvas", 4.5],
    ["--ng-color-text-secondary", "--ng-color-bg-canvas", 4.5],
    ["--ng-color-text-secondary", "--ng-color-bg-subtle", 4.5],
    ["--ng-color-text-muted", "--ng-color-bg-canvas", 4.5],
    ["--ng-color-text-muted", "--ng-color-bg-subtle", 4.5],
    ["--ng-color-text-link", "--ng-color-bg-canvas", 4.5],
    ["--ng-color-text-link", "--ng-color-action-subtle", 4.5],
    ["--ng-component-button-primary-foreground", "--ng-color-action-primary", 4.5],
    ["--ng-component-button-primary-foreground", "--ng-color-action-pressed", 4.5],
    ["--ng-color-text-inverse", "--ng-color-bg-inverse", 4.5],
    ["--ng-color-status-success-text", "--ng-color-status-success-bg", 4.5],
    ["--ng-color-status-review-text", "--ng-color-status-review-bg", 4.5],
    ["--ng-color-status-danger-text", "--ng-color-status-danger-bg", 4.5],
    ["--ng-color-status-neutral-text", "--ng-color-status-neutral-bg", 4.5],
    // Glyphs on solid status fills are graphics: 3:1.
    ["--ng-color-text-inverse", "--ng-color-status-success-solid", 3],
    ["--ng-color-text-inverse", "--ng-color-status-danger-solid", 3],
  ];
  for (const [text, background, minimum] of pairs) {
    const value = ratio(tokens.get(text)!, tokens.get(background)!);
    assert.ok(value >= minimum, `${text} on ${background}: ${value.toFixed(2)} < ${minimum}`);
  }
});
