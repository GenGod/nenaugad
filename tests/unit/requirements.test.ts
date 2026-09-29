// Requirement decomposition layer (design item A2) — contract tests.
//
// These tests pin the two things that make the layer trustworthy:
//   1. the marker heuristic is STRUCTURAL (a heading or an unambiguous phrase),
//      so ordinary prose cannot inflate a posting's must-haves — a regression
//      the golden harness caught on 2026-09-29;
//   2. the layer is a RELEVANCE layer, never a gate: eligibility output must be
//      byte-identical with and without requirements, and honest "unknown"
//      replaces guessing whenever the profile cannot answer a requirement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GOLDEN_PROFILES, GOLDEN_SET } from "../../src/data/matching-golden.ts";
import { evaluateJob } from "../../src/domain/matching.ts";
import type { ManualProfileInput } from "../../src/domain/profile.ts";
import {
  assessRequirements, assessSnapshotRequirements, deriveRequirements, normalizeRequirements,
  type NormalizedRequirement,
} from "../../src/domain/requirements.ts";

function strengthsOf(text: string): ReadonlyMap<string, string> {
  return new Map(deriveRequirements(text).map(requirement => [requirement.skill ?? "?", requirement.strength]));
}

function profileOf(id: string): ManualProfileInput {
  const golden = GOLDEN_PROFILES.find(item => item.id === id);
  assert.ok(golden, `golden profile ${id} must exist`);
  return golden.profile;
}

const mustRequirement = (skill: string): NormalizedRequirement => ({
  id: `req-${skill}`, category: "skill", strength: "must", skill,
  evidenceText: `must have ${skill}`, source: "derived",
});

test("derivation: heading-zone markers mark a must-have, prose does not", () => {
  const english = strengthsOf("Requirements: must have Kubernetes. We use Node.js.");
  assert.equal(english.get("Kubernetes"), "must");
  assert.equal(english.get("Node.js"), "unclear");

  const russian = strengthsOf("Требования: обязательно Python. Работаем с SQL.");
  assert.equal(russian.get("Python"), "must");
  assert.equal(russian.get("SQL"), "unclear");

  // Regression caught by the golden harness: a sentence that merely mentions
  // "job requirements" must not turn every skill in it into a must-have.
  const prose = strengthsOf(
    "Sourcing for data teams: you will read Python, SQL and Machine Learning job requirements daily.",
  );
  assert.equal(prose.get("Python"), "unclear");
  assert.equal(prose.get("Machine Learning"), "unclear");
});

test("derivation: unambiguous phrases work without a colon, nice-to-have stays separate", () => {
  const strengths = strengthsOf("You must have Go for this role. Nice to have: Rust.");
  assert.equal(strengths.get("Go"), "must");
  assert.equal(strengths.get("Rust"), "preferred");
});

test("derivation: the strongest mention wins and duplicates collapse", () => {
  const text = "We work with Docker. Требования: обязательно Docker.";
  const derived = deriveRequirements(text);
  assert.equal(derived.length, 1);
  assert.equal(derived[0]?.strength, "must");
  assert.match(derived[0]?.evidenceText ?? "", /обязательно/u);
});

test("normalisation: explicit requirements win and skills are canonicalised", () => {
  const job = GOLDEN_SET.jobs.find(item => item.snapshot.id === "golden-j31");
  assert.ok(job);
  const withExplicit = {
    ...job.snapshot,
    requirements: [{
      id: "req-k8s",
      category: "skill" as const,
      strength: "must" as const,
      expression: { op: "atom" as const, attribute: "skill", operator: "present" as const, value: "k8s" },
      original_text: "Kubernetes required",
      evidence_ids: [],
    }],
  };
  const normalized = normalizeRequirements(withExplicit);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.skill, "Kubernetes"); // alias -> canonical dictionary name
  assert.equal(normalized[0]?.strength, "must");
  assert.equal(normalized[0]?.source, "explicit");
});

test("assessment: covered, uncovered and unknown are reported with honest wording", () => {
  const backend = profileOf("p-backend-eu");
  const assessment = assessRequirements([
    mustRequirement("Node.js"),
    mustRequirement("Kubernetes"),
    { ...mustRequirement("English"), category: "language", skill: null },
  ], backend);
  assert.equal(assessment.mustTotal, 3);
  assert.equal(assessment.mustCovered, 1);
  assert.equal(assessment.mustUncovered, 1);
  assert.equal(assessment.unknownCount, 1);
  assert.deepEqual(assessment.missingSkills, ["Kubernetes"]);
  assert.equal(assessment.coverage, 0.5);
  const uncovered = assessment.rows.find(row => row.requirement.skill === "Kubernetes");
  assert.match(uncovered?.reason ?? "", /не указан/u);
  const unknown = assessment.rows.find(row => row.requirement.category === "language");
  assert.match(unknown?.reason ?? "", /статус не определён/u);
});

test("assessment: an empty profile yields unknowns, never uncovered accusations", () => {
  const emptyProfile = { ...profileOf("p-backend-eu"), skills: [] };
  const assessment = assessRequirements([mustRequirement("Node.js"), mustRequirement("Kubernetes")], emptyProfile);
  assert.equal(assessment.mustUncovered, 0);
  assert.equal(assessment.unknownCount, 2);
  assert.equal(assessment.coverage, null);
});

test("gate invariant: requirements never change eligibility (unknown stays unknown)", () => {
  const base = GOLDEN_SET.jobs.find(item => item.snapshot.id === "golden-j01");
  assert.ok(base);
  const explicitMust = {
    id: "req-k8s", category: "skill" as const, strength: "must" as const,
    expression: { op: "atom" as const, attribute: "skill", operator: "present" as const, value: "Kubernetes" },
    original_text: "must have Kubernetes", evidence_ids: [],
  };
  // Unspecified hiring geography -> GEO-01 unknown -> needs_review, not a fail.
  const unspecified = {
    ...base.snapshot,
    hiring_options: base.snapshot.hiring_options.map(option => ({
      ...option,
      geography: { ...option.geography, scope: "unspecified" as const, allowed_countries: [], excluded_countries: [] },
    })),
  };
  const backend = profileOf("p-backend-eu");
  const withoutRequirements = evaluateJob(unspecified, backend);
  assert.equal(withoutRequirements.status, "needs_review");
  const withMust = { ...unspecified, requirements: [explicitMust] };
  assert.deepEqual(evaluateJob(withMust, backend), withoutRequirements,
    "the requirement layer must not touch the gate");
  // ...while the relevance layer still reports the honest gap.
  const assessment = assessSnapshotRequirements(withMust, backend);
  assert.equal(assessment.mustUncovered, 1);
  assert.deepEqual(assessment.missingSkills, ["Kubernetes"]);
});

test("gate invariant: injected must-haves leave every golden pair's gate output unchanged", () => {
  for (const golden of GOLDEN_PROFILES) {
    for (const job of GOLDEN_SET.jobs) {
      const injected = { ...job.snapshot, requirements: [{
        id: "req-injected-must", category: "skill" as const, strength: "must" as const,
        expression: { op: "atom" as const, attribute: "skill", operator: "present" as const, value: "Kubernetes" },
        original_text: "must have Kubernetes", evidence_ids: [],
      }] };
      assert.deepEqual(
        evaluateJob(injected, golden.profile),
        evaluateJob(job.snapshot, golden.profile),
        `${golden.id}/${job.snapshot.id}: requirements must never move the gate`,
      );
    }
  }
});
