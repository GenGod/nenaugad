import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSkills, AMBIGUOUS_ALIASES, ALIAS_DELTA_V2_ENTRIES, SKILLS_DICTIONARY } from "../../src/domain/skills.ts";
import { ESCO_ALIAS_DELTA } from "../../src/domain/skills-esco.ts";

// B41: extractSkills was made fast (one sorted alias list, a prefilter, a cache).
// This file pins that the speed-up changed no result: the oracle below is the
// scan the function used to run — every alias, longest first, over the text.

const ALIASES = new Map<string, string>([
  ...SKILLS_DICTIONARY.flatMap(entry =>
    [entry.canonical.toLowerCase(), ...entry.aliases.map(a => a.toLowerCase())]
      .map(alias => [alias, entry.canonical] as const)),
  ...Object.entries(ALIAS_DELTA_V2_ENTRIES).flatMap(([canonical, aliases]) =>
    aliases.map(alias => [alias.toLowerCase(), canonical] as const)),
  ...Object.entries(ESCO_ALIAS_DELTA).flatMap(([canonical, aliases]) =>
    aliases.map(alias => [alias.toLowerCase(), canonical] as const)),
]);

const DELIMITERS = new Set([" ", "\t", "\n", "\r", ",", ";", ":", "(", ")", "[", "]", "{", "}", '"', "'", "/", ".", "!", "?", "-", "_", "+", "=", "|", "&", "@", "#", "$", "%", "^", "*", "~", "`", "<", ">"]);

function oracle(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const original = ` ${text} `;
  const found: string[] = [];
  const seen = new Set<string>();
  const consumed: [number, number][] = [];
  const free = (start: number, end: number) => !consumed.some(([cs, ce]) => start < ce && end > cs);
  const sorted = [...ALIASES.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of sorted) {
    if (seen.has(canonical)) continue;
    let index = lower.indexOf(alias);
    while (index !== -1) {
      const before = lower[index - 1] ?? " ";
      const after = lower[index + alias.length] ?? " ";
      const end = index + alias.length;
      const first = original[index];
      const caseOk = !AMBIGUOUS_ALIASES.has(alias) || (first !== undefined && /\p{Lu}/u.test(first));
      if (caseOk && DELIMITERS.has(before) && DELIMITERS.has(after) && free(index, end)) {
        if (!seen.has(canonical)) { found.push(canonical); seen.add(canonical); }
        consumed.push([index, end]);
      }
      index = lower.indexOf(alias, index + 1);
    }
  }
  return found;
}

function title(alias: string): string {
  return alias.charAt(0).toUpperCase() + alias.slice(1);
}

// A small deterministic generator, so a failure names a reproducible text.
function lcg(seed: number): () => number {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

test("every alias, alone and in context, extracts what the plain scan extracts", () => {
  for (const alias of ALIASES.keys()) {
    for (const text of [
      alias, title(alias), alias.toUpperCase(), `We use ${title(alias)} daily.`, `x${alias}`, `${alias}y`,
      `(${title(alias)}), ${alias}.`, `${title(alias)}/${alias}-${alias}`, `, ${alias}`,
    ]) {
      assert.deepEqual(extractSkills(text), oracle(text), `text: ${JSON.stringify(text)}`);
    }
  }
});

test("random mixes of aliases, words and delimiters extract what the plain scan extracts", () => {
  const random = lcg(41);
  const aliases = [...ALIASES.keys()];
  const words = ["and", "with", "we", "go", "fast", "experience", "of", "the", "team", "remote", "2024"];
  const delimiters = [" ", " ", " ", ", ", ". ", "; ", "\n", "/", " - ", "(", ")", "+", "#"];
  for (let i = 0; i < 400; i += 1) {
    const parts: string[] = [];
    const length = 3 + Math.floor(random() * 40);
    for (let j = 0; j < length; j += 1) {
      const pick = random() < 0.5 ? aliases[Math.floor(random() * aliases.length)] as string
        : words[Math.floor(random() * words.length)] as string;
      parts.push(random() < 0.4 ? title(pick) : pick, delimiters[Math.floor(random() * delimiters.length)] as string);
    }
    const text = parts.join("");
    assert.deepEqual(extractSkills(text), oracle(text), `text: ${JSON.stringify(text)}`);
  }
});

test("a long text gives the same answer on every call, and callers cannot change it", () => {
  const text = `${"Backend engineer. ".repeat(60)}We use React, Node.js and PostgreSQL. Go and Rust help.`;
  const first = extractSkills(text);
  assert.deepEqual(first, oracle(text));
  assert.ok(Object.isFrozen(first), "a shared result must be frozen");
  assert.throws(() => (first as string[]).push("Injected"), TypeError);
  assert.deepEqual(extractSkills(text), oracle(text));
  assert.equal(extractSkills(`${text}`).includes("Injected"), false);
});

test("many calls stay cheap: the alias list is not rebuilt per call", () => {
  const sentences = ["We are looking for a senior engineer", "Experience with React and TypeScript required",
    "You will own the payment platform", "Nice to have: Kubernetes, Terraform", "Fully remote team across Europe"];
  extractSkills(sentences[0] as string);
  const started = performance.now();
  for (let i = 0; i < 4000; i += 1) extractSkills(`${sentences[i % sentences.length]} ${i}`);
  const elapsed = performance.now() - started;
  // The old scan took ~0.1 ms per short call (≥ 400 ms here); the prefilter takes
  // a few microseconds. The bound is loose enough for a slow CI host.
  assert.ok(elapsed < 250, `4000 short calls took ${elapsed.toFixed(0)} ms`);
});

test("a repeated long text is scanned once", () => {
  const text = `${"Responsibilities include delivery and support. ".repeat(120)} React Node.js`;
  extractSkills(text);
  const started = performance.now();
  for (let i = 0; i < 300; i += 1) extractSkills(`${text}`);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 150, `300 repeated calls took ${elapsed.toFixed(0)} ms`);
});
