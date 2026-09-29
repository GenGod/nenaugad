import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALIAS_DELTA_V2_ENTRIES,
  canonicalSkillName,
  extractSkills,
  skillCategory,
  skillOverlap,
  SKILLS_DICTIONARY,
} from "../../src/domain/skills.ts";
import type { SkillCategory } from "../../src/domain/skills.ts";

// Sorted canonical names found in text, so assertions do not depend on
// the extractor's internal alias-iteration order.
function foundSorted(text: string): string[] {
  return [...extractSkills(text)].sort();
}

const CV_TEXT = `Senior Full-Stack Engineer with 6 years of experience.

Built customer dashboards with React and Redux, served by Node.js APIs
backed by PostgreSQL. Containerized services with Docker and orchestrated
Kubernetes deployments. Wrote automated tests with Jest.`;

const JOB_TEXT = `Backend Engineer (remote)

Requirements:
- Strong TypeScript skills and 3+ years with Node.js
- Solid experience with PostgreSQL and Redis
- Familiar with Docker and CI/CD pipelines
- Knowledge of GraphQL is a plus`;

test("extractSkills finds skills in a realistic CV text", () => {
  const found = extractSkills(CV_TEXT);
  for (const skill of ["React", "Node.js", "PostgreSQL", "Docker", "Kubernetes"]) {
    assert.ok(found.includes(skill), `expected CV extraction to include ${skill}`);
  }
  // Exact set: "Redux" and "Automated Testing" (via the "Jest" alias) are also found.
  assert.deepEqual(foundSorted(CV_TEXT), [
    "Automated Testing",
    "Docker",
    "Kubernetes",
    "Node.js",
    "PostgreSQL",
    "React",
    "Redux",
  ]);
});

test("extractSkills finds skills in a realistic job description", () => {
  const found = extractSkills(JOB_TEXT);
  for (const skill of ["TypeScript", "Node.js", "PostgreSQL", "Redis", "Docker", "GraphQL"]) {
    assert.ok(found.includes(skill), `expected job extraction to include ${skill}`);
  }
  assert.deepEqual(foundSorted(JOB_TEXT), [
    "CI/CD",
    "Docker",
    "GraphQL",
    "Node.js",
    "PostgreSQL",
    "Redis",
    "TypeScript",
  ]);
});

test("extractSkills maps aliases to canonical names", () => {
  assert.deepEqual(extractSkills("Experience with react.js in production."), ["React"]);
  assert.deepEqual(extractSkills("Managed a postgres cluster."), ["PostgreSQL"]);
  assert.deepEqual(extractSkills("Deployed to k8s."), ["Kubernetes"]);
});

test("extractSkills respects word boundaries: 'go' does not match inside 'google' or 'good'", () => {
  assert.deepEqual(extractSkills("Using google and good practices"), []);
  // Standalone "go" and the "golang" alias do match the Go entry.
  assert.deepEqual(extractSkills("I write Go services"), ["Go"]);
  assert.deepEqual(extractSkills("golang"), ["Go"]);
});

test("extractSkills is case-insensitive", () => {
  for (const text of ["REACT", "react", "React", "rEaCt"]) {
    assert.deepEqual(extractSkills(text), ["React"], `expected ${text} to extract React`);
  }
});

test("extractSkills returns an empty array for empty or blank text", () => {
  assert.deepEqual(extractSkills(""), []);
  assert.deepEqual(extractSkills("   "), []);
});

test("skillOverlap computes overlap fraction with matched and missing lists", () => {
  const result = skillOverlap(
    ["React", "Node.js", "Docker"],
    ["React", "Node.js", "PostgreSQL"],
  );
  assert.ok(Math.abs(result.overlap - 2 / 3) < 1e-9);
  assert.deepEqual(result.matched, ["React", "Node.js"]);
  assert.deepEqual(result.missing, ["Docker"]);
});

test("skillOverlap is case-insensitive and compares canonical sets", () => {
  const result = skillOverlap(["React", "typescript"], ["react", "TypeScript"]);
  assert.equal(result.overlap, 1);
  assert.deepEqual(result.matched, ["React", "typescript"]);
  assert.deepEqual(result.missing, []);
});

test("skillOverlap returns 0 for empty user skills", () => {
  const result = skillOverlap([], ["React", "Go"]);
  assert.equal(result.overlap, 0);
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.missing, []);
});

test("skillOverlap with empty job skills matches nothing", () => {
  const result = skillOverlap(["React", "Go"], []);
  assert.equal(result.overlap, 0);
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.missing, ["React", "Go"]);
});

test("skillCategory returns the correct category for known skills", () => {
  const cases: ReadonlyArray<readonly [string, SkillCategory]> = [
    ["React", "frontend"],
    ["Node.js", "backend"],
    ["PostgreSQL", "database"],
    ["Kubernetes", "devops"],
    ["Docker", "devops"],
    ["React Native", "mobile"],
    ["Machine Learning", "ai_ml"],
    ["Data Science", "data"],
    ["Cybersecurity", "security"],
    ["Automated Testing", "qa"],
    ["UI/UX Design", "design"],
    ["Product Management", "product"],
    ["Team Leadership", "management"],
    ["English", "languages"],
    ["Serverless", "cloud"],
  ];
  for (const [canonical, expected] of cases) {
    assert.equal(skillCategory(canonical), expected);
  }
});

test("skillCategory falls back to 'other' for unknown skills", () => {
  assert.equal(skillCategory("Definitely Not A Skill"), "other");
  assert.equal(skillCategory(""), "other");
});

test("SKILLS_DICTIONARY has more than 50 well-formed entries", () => {
  assert.ok(SKILLS_DICTIONARY.length > 50, `expected >50 entries, got ${SKILLS_DICTIONARY.length}`);

  const canonicals: string[] = [];
  for (const entry of SKILLS_DICTIONARY) {
    assert.equal(typeof entry.canonical, "string", `canonical must be a string: ${JSON.stringify(entry)}`);
    assert.ok(entry.canonical.length > 0, `canonical must be non-empty: ${JSON.stringify(entry)}`);
    assert.ok(Array.isArray(entry.aliases), `aliases must be an array: ${entry.canonical}`);
    assert.ok(entry.aliases.length > 0, `aliases must be non-empty: ${entry.canonical}`);
    for (const alias of entry.aliases) {
      assert.equal(typeof alias, "string", `alias must be a string: ${entry.canonical}`);
      assert.ok(alias.length > 0, `alias must be non-empty: ${entry.canonical}`);
    }
    canonicals.push(entry.canonical);
  }

  // Canonical names drive skillCategory and skillOverlap; they must be unique.
  assert.equal(new Set(canonicals).size, canonicals.length, "canonical names must be unique");

  const validCategories = new Set<SkillCategory>([
    "frontend", "backend", "database", "devops", "mobile",
    "data", "ai_ml", "security", "qa", "design",
    "product", "management", "languages", "cloud", "other",
  ]);
  for (const entry of SKILLS_DICTIONARY) {
    assert.ok(
      validCategories.has(entry.category),
      `unknown category ${entry.category} on ${entry.canonical}`,
    );
  }
});

// --- v2 (design item A3): alias matrix, ambiguity rule, RU aliases ---------

test("v2 alias matrix: js / JavaScript / ECMAScript and k8s / Kubernetes resolve to one canonical", () => {
  assert.deepEqual(extractSkills("JavaScript"), ["JavaScript"]);
  assert.deepEqual(extractSkills("ECMAScript"), ["JavaScript"]);
  assert.deepEqual(extractSkills("JS"), ["JavaScript"]); // capitalised short form
  assert.deepEqual(extractSkills("Kubernetes"), ["Kubernetes"]);
  assert.deepEqual(extractSkills("k8s"), ["Kubernetes"]);
  assert.deepEqual(extractSkills("K8s cluster"), ["Kubernetes"]);
  assert.equal(canonicalSkillName("js"), "JavaScript");
  assert.equal(canonicalSkillName("ECMAScript"), "JavaScript");
  assert.equal(canonicalSkillName("k8s"), "Kubernetes");
  assert.equal(canonicalSkillName("nonsense"), null);
});

test("v2 ambiguity rule: ordinary words match only in their capitalised form", () => {
  // The regression measured by the golden harness on 2026-09-29.
  assert.deepEqual(extractSkills("We go fast and ship daily"), []);
  assert.deepEqual(extractSkills("Read the docs carefully"), []);
  assert.deepEqual(extractSkills("Strong BI mindset"), ["Analytics"]); // capitalised short form
  assert.deepEqual(extractSkills("We use js daily"), []);
  // Capitalised forms and unambiguous long forms still match.
  assert.deepEqual(extractSkills("I write Go services"), ["Go"]);
  assert.deepEqual(extractSkills("golang"), ["Go"]);
  assert.deepEqual(foundSorted("Rust and Swift experience"), ["Rust", "iOS"]);
  assert.deepEqual(extractSkills("REST API design"), ["REST API"]);
});

test("v2 aliases: Russian-language skill names are recognised", () => {
  assert.deepEqual(extractSkills("машинное обучение"), ["Machine Learning"]);
  assert.deepEqual(extractSkills("Опыт: глубокое обучение и нейронные сети"), ["Deep Learning"]);
  assert.deepEqual(extractSkills("аналитика продукта"), ["Analytics"]);
  assert.deepEqual(extractSkills("кибербезопасность"), ["Cybersecurity"]);
  assert.deepEqual(extractSkills("управление проектами"), ["Project Management"]);
  assert.deepEqual(foundSorted("автотесты на Python"), ["Automated Testing", "Python"]);
  assert.deepEqual(extractSkills("базы данных"), ["SQL"]);
  // A Russian suffix must not match: the delimiter rule still applies.
  assert.deepEqual(extractSkills("аналитикам"), []);
  // Documented limitation, not an oversight: aliases match exact forms, so an
  // inflected Russian phrase ("базами данных") is currently NOT recognised.
  // Morphology is out of scope for v2 and belongs to the dictionary work that
  // follows the vocabulary worklist.
  assert.deepEqual(extractSkills("работа с базами данных"), []);
});

test("v2 consumption: every occurrence of a longer alias is consumed", () => {
  // Measured defect (2026-09-29): only the FIRST occurrence of an alias was
  // consumed, so a later one leaked a shorter alias ("Node.js" twice reported
  // JavaScript; "React Native" twice reported React).
  assert.deepEqual(extractSkills("React Native for mobile, built with React Native"), ["React Native"]);
  assert.deepEqual(extractSkills("Node.js and Node.js"), ["Node.js"]);
});

test("v2 alias delta keeps two invariants: targets exist, no alias is stolen", () => {
  // A typo in the delta would create an alias nobody can match, and a re-used
  // name would silently reroute a skill to another canonical — assert both here
  // instead of discovering them through a ranking change.
  const canonicals = new Set(SKILLS_DICTIONARY.map(entry => entry.canonical));
  for (const target of Object.keys(ALIAS_DELTA_V2_ENTRIES)) {
    assert.ok(canonicals.has(target), `alias delta target must exist in the dictionary: ${target}`);
  }
  for (const [canonical, aliases] of Object.entries(ALIAS_DELTA_V2_ENTRIES)) {
    for (const alias of aliases) {
      assert.equal(canonicalSkillName(alias), canonical, `delta alias ${alias} must resolve to ${canonical}`);
      for (const entry of SKILLS_DICTIONARY) {
        if (entry.canonical === canonical) continue;
        const baseAliases = new Set([
          entry.canonical.toLowerCase(),
          ...entry.aliases.map(item => item.toLowerCase()),
        ]);
        assert.ok(!baseAliases.has(alias.toLowerCase()),
          `delta alias ${alias} already belongs to ${entry.canonical}`);
      }
    }
  }
});
