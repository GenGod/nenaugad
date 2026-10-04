import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AMBIGUOUS_ALIASES,
  canonicalSkillName,
  extractSkills,
  SKILLS_DICTIONARY,
} from "../../src/domain/skills.ts";
import { ESCO_ALIAS_DELTA, ESCO_SKILL_CONCEPTS } from "../../src/domain/skills-esco.ts";

// ESCO-001 (owner decision E.6, 2026-10-02). These tests guard the
// dictionary-facing invariants of the mapping and the alias delta. The
// artifact-side facts (a concept exists, the recorded label is what the API
// serves, the artifact's bytes) are verified by `npm run esco:fetch -- --check`
// — the artifact is not committed, so that is the only side that can see it.

const CANONICALS = new Set(SKILLS_DICTIONARY.map(entry => entry.canonical));
const CONCEPT_URI =
  /^http:\/\/data\.europa\.eu\/esco\/skill\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function isAmbiguous(alias: string): boolean {
  return AMBIGUOUS_ALIASES.has(alias.trim().toLowerCase());
}

function capitalised(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

test("ESCO links point at existing canonicals with well-formed concept uris", () => {
  const seen = new Set<string>();
  for (const link of ESCO_SKILL_CONCEPTS) {
    assert.ok(CANONICALS.has(link.canonical), `link target must exist in the dictionary: ${link.canonical}`);
    assert.match(link.uri, CONCEPT_URI, `concept uri must be an ESCO skill uri: ${link.uri}`);
    assert.ok(link.preferredEn.trim().length > 0, `link must record the served label: ${link.uri}`);
    assert.ok(link.matchedVia.trim().length > 0, `link must record how it was established: ${link.uri}`);
    const key = `${link.canonical}\u0000${link.uri}`;
    assert.ok(!seen.has(key), `duplicate link: ${link.canonical} -> ${link.uri}`);
    seen.add(key);
  }
});

test("ESCO alias delta keeps the review rules from src/domain/skills-esco.ts", () => {
  const linked = new Set(ESCO_SKILL_CONCEPTS.map(link => link.canonical));
  for (const [canonical, aliases] of Object.entries(ESCO_ALIAS_DELTA)) {
    assert.ok(CANONICALS.has(canonical), `delta target must exist in the dictionary: ${canonical}`);
    assert.ok(linked.has(canonical), `delta aliases must come from a linked concept: ${canonical}`);
    assert.ok(aliases.length > 0, `empty delta entry for ${canonical} — a no-op line hides intent`);
    for (const alias of aliases) {
      assert.equal(canonicalSkillName(alias), canonical, `ESCO alias ${alias} must resolve to ${canonical}`);
      // Multi-word only: single-word additions are the false-positive class the
      // v2 ambiguity rule exists for, so an exception must go through
      // AMBIGUOUS_ALIASES (and then only match capitalised).
      const words = alias.trim().split(/\s+/u).length;
      if (words === 1) {
        assert.ok(isAmbiguous(alias), `single-word ESCO alias ${alias} must be listed in AMBIGUOUS_ALIASES`);
      }
      for (const entry of SKILLS_DICTIONARY) {
        if (entry.canonical === canonical) continue;
        const baseAliases = new Set([
          entry.canonical.toLowerCase(),
          ...entry.aliases.map(item => item.toLowerCase()),
        ]);
        assert.ok(!baseAliases.has(alias.toLowerCase()), `ESCO alias ${alias} already belongs to ${entry.canonical}`);
      }
    }
  }
});

test("every ESCO alias is recognised by the extractor in a sentence", () => {
  for (const [canonical, aliases] of Object.entries(ESCO_ALIAS_DELTA)) {
    for (const alias of aliases) {
      // Ambiguous aliases match only in their capitalised form (v2 rule).
      const probe = isAmbiguous(alias) ? capitalised(alias) : alias;
      assert.ok(
        extractSkills(`Опыт: ${probe} в продакшене`).includes(canonical),
        `expected extractSkills to recognise "${probe}" as ${canonical}`,
      );
      assert.ok(extractSkills(`Experience with ${probe}.`).includes(canonical),
        `expected extractSkills to recognise "${probe}" as ${canonical} in English text`);
    }
  }
});
