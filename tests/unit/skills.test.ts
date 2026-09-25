import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
