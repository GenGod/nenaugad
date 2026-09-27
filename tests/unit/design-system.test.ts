import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { iconManifest } from "../../src/components/icon-registry.generated.ts";

// DS-001 coverage: the generated token layer, the icon pipeline and the
// stylesheet must stay inside the Nenaugad 1.3 system. These tests fail on
// drift that a screenshot cannot catch (a renamed token, a screen-local
// color, an executable glyph body).

const KIT_TOKEN_COUNT = 140;
const ICON_COUNT = 64;
const ICON_GROUPS = ["navigation", "actions", "conditions", "documents"] as const;

async function readTokenMap(): Promise<Map<string, string>> {
  const css = await readFile("src/app/tokens.css", "utf8");
  return new Map(
    [...css.matchAll(/^ {2}(--[\w-]+): (.+);$/gmu)].map(match => [match[1]!, match[2]!]),
  );
}

test("tokens.css carries the full Nenaugad set with kit values", async () => {
  const tokens = await readTokenMap();
  assert.equal(tokens.size, KIT_TOKEN_COUNT);
  const expected: Readonly<Record<string, string>> = {
    // Reference layer, verbatim from the kit showcase.
    "--ng-ref-paper": "#F7F5F0",
    "--ng-ref-blue600": "#3456D1",
    "--ng-ref-amber800": "#885619",
    // Semantic layer maps onto the same values (generator resolves refs).
    "--ng-color-bg-canvas": "#F7F5F0",
    "--ng-color-action-primary": "#3456D1",
    "--ng-color-status-review-text": "#885619",
    // Scales keep their authored units: px spaces, rem type, ms motion.
    "--ng-space-s24": "24px",
    "--ng-radius-card": "12px",
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
  assert.equal(
    tokens.get("--ng-component-button-primary-foreground"),
    tokens.get("--ng-color-text-inverse"),
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

test("globals.css introduces no colors beyond the kit's documented accents", async () => {
  const globals = await readFile("src/app/globals.css", "utf8");
  // Hexes inherited verbatim from the kit: soft borders of the context/
  // proof/banner variants and the fern company-mark, plus ink-based
  // dialog/toast shadows.
  const allowed = new Set([
    "#b8c5f2", "#c8d1f5", "#d0ae7c", "#9bbcad", "#d5a0a0", "#d1e3d7",
    "#20284033", "#20284070", "#20284020",
  ]);
  const found = [...globals.matchAll(/#[0-9a-f]{3,8}\b/giu)].map(match => match[0]!.toLowerCase());
  const foreign = [...new Set(found)].filter(hex => !allowed.has(hex));
  assert.deepEqual(foreign, [], "screen-local colors are forbidden without a system review");
});
