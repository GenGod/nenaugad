// Requirement decomposition layer v1 (design item A2, deterministic part).
//
// Goal: turn a posting into a list of individual requirements with a per-pair
// verdict (covered / uncovered / unknown) instead of one opaque similarity
// number. This is the deterministic half of the research item "requirement
// decomposition + evidence"; the LLM half (must/nice by meaning, NLI
// contradiction checks) is phase C and replaces the marker heuristics here.
//
// Separation of concerns (design brief V2, holds by test):
//   * matcher (src/domain/matching.ts) decides ELIGIBILITY. Requirements NEVER
//     enter that decision — an uncovered must-have is not a gate failure, it is
//     a relevance signal with an honest explanation.
//   * this layer decides what the candidate is told and how strong a match is.
//
// Two sources of requirements:
//   1. Explicit: snapshot.requirements, carried by the source contract (today
//      empty for live imports; fixtures and later C1 extraction fill it).
//   2. Derived (heuristic, deterministic, no model): skills recognised by the
//      dictionary in a sentence, graded by marker words in the SAME sentence
//      (must / preferred / unclear). Sentence scope keeps "Nice to have: Go.
//      Must have Python." from mixing the two.
//
// Everything here is pure: same inputs, same output, no clock and no network.

import { canonicalSkillName, extractSkills } from "./skills.ts";
import type { ManualProfileInput } from "./profile.ts";
import type { JobSnapshot, RequirementExpression } from "./source-contracts.ts";

export const REQUIREMENT_LAYER_VERSION = "v1";

export type RequirementStrength = "must" | "preferred" | "unclear";
export type RequirementVerdict = "covered" | "uncovered" | "unknown";

export type NormalizedRequirement = Readonly<{
  id: string;
  category: "skill" | "experience" | "language" | "education" | "certification" | "other";
  strength: RequirementStrength;
  /** Canonical dictionary skill for skill requirements; null when the layer cannot map it. */
  skill: string | null;
  /** The text that produced the requirement — the evidence a reviewer can check. */
  evidenceText: string;
  source: "explicit" | "derived";
}>;

export type RequirementVerdictRow = Readonly<{
  requirement: NormalizedRequirement;
  verdict: RequirementVerdict;
  reason: string;
}>;

export type RequirementAssessment = Readonly<{
  rows: readonly RequirementVerdictRow[];
  mustTotal: number;
  mustCovered: number;
  mustUncovered: number;
  preferredTotal: number;
  preferredCovered: number;
  unknownCount: number;
  /** covered / (assessable), null when nothing was assessable — never a made-up number. */
  coverage: number | null;
  /** Canonical skills the profile does not confirm (for "чего не хватает"). */
  missingSkills: readonly string[];
}>;

// Marker words. Deliberately short lists: this is a heuristic bridge until C1
// (LLM extraction) provides real must/nice classification, and it must stay
// easy to audit. Longer lists would pretend to a precision they do not have.
//
// A marker only counts when it is STRUCTURAL — either inside the sentence's
// heading zone (the text before its first colon: "Requirements: …",
// "Требования: …", "Nice to have: …") or as an unambiguous verb/adverb phrase
// anywhere in the sentence. Plain prose that merely mentions "job requirements"
// must not turn every skill of that sentence into a must-have; the golden
// harness caught exactly that inflation on 2026-09-29 (the keyword-trap posting
// rocketed to the top of the data profile).
const MUST_HEADING_MARKERS = [
  "must have", "must-have", "required", "requirement", "requirements", "mandatory",
  "обязательно", "обязательный", "требуется", "требование", "требования",
];
const MUST_PHRASE_MARKERS = ["must have", "must-have", "обязательно", "требуется"];
const PREFERRED_HEADING_MARKERS = [
  "nice to have", "nice-to-have", "preferred", "plus", "bonus", "advantage",
  "будет плюсом", "плюсом", "желательно", "преимущество",
];
const PREFERRED_PHRASE_MARKERS = ["nice to have", "nice-to-have", "будет плюсом", "желательно"];

const WORD_CHAR = /[\p{L}\p{N}]/u;

// Word-boundary check without regex \b (which misfires on Cyrillic): the
// character before and after the match must not be a letter or digit, so
// "plus" does not match inside "surplus" and "docs" style substrings stay out.
function containsMarker(text: string, marker: string): boolean {
  const haystack = text.toLowerCase();
  let index = haystack.indexOf(marker);
  while (index !== -1) {
    const before = index === 0 ? " " : haystack[index - 1] ?? " ";
    const afterIndex = index + marker.length;
    const after = afterIndex >= haystack.length ? " " : haystack[afterIndex] ?? " ";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    index = haystack.indexOf(marker, index + 1);
  }
  return false;
}

function headingZone(sentence: string): string | null {
  const colon = sentence.indexOf(":");
  return colon === -1 ? null : sentence.slice(0, colon);
}

function strengthOf(sentence: string): RequirementStrength {
  const zone = headingZone(sentence);
  if (zone !== null && MUST_HEADING_MARKERS.some(marker => containsMarker(zone, marker))) return "must";
  if (MUST_PHRASE_MARKERS.some(marker => containsMarker(sentence, marker))) return "must";
  if (zone !== null && PREFERRED_HEADING_MARKERS.some(marker => containsMarker(zone, marker))) return "preferred";
  if (PREFERRED_PHRASE_MARKERS.some(marker => containsMarker(sentence, marker))) return "preferred";
  return "unclear";
}

const STRENGTH_RANK: Readonly<Record<RequirementStrength, number>> = {
  must: 3, preferred: 2, unclear: 1,
};

function splitSentences(text: string): readonly string[] {
  return text.split(/[.!?;\n]+/u).map(sentence => sentence.trim()).filter(sentence => sentence.length > 0);
}

function requirementId(skill: string): string {
  return `req-skill-${skill.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
}

// Heuristic derivation: dictionary skills in each sentence, graded by markers in
// that sentence; the strongest mention wins, and the first sentence that stated
// it becomes the evidence.
export function deriveRequirements(text: string): readonly NormalizedRequirement[] {
  const byStrength = new Map<string, RequirementStrength>();
  const evidence = new Map<string, string>();
  for (const sentence of splitSentences(text)) {
    const strength = strengthOf(sentence);
    for (const skill of extractSkills(sentence)) {
      const current = byStrength.get(skill);
      if (current === undefined || STRENGTH_RANK[strength] > STRENGTH_RANK[current]) {
        byStrength.set(skill, strength);
        evidence.set(skill, sentence);
      }
    }
  }
  return [...byStrength.entries()].map(([skill, strength]) => ({
    id: requirementId(skill),
    category: "skill" as const,
    strength,
    skill,
    evidenceText: evidence.get(skill) ?? "",
    source: "derived" as const,
  }));
}

// A skill requirement is understood only for the simple "skill present" shape;
// anything else (ranges, negations, compound expressions) stays unmapped on
// purpose — an unmapped requirement becomes "unknown", never a silent pass.
function skillFromExpression(expression: RequirementExpression): string | null {
  if (expression.op !== "atom") return null;
  if (expression.attribute !== "skill") return null;
  if (expression.operator !== "present" && expression.operator !== "one_of") return null;
  const value = expression.value;
  if (typeof value === "string") return canonicalSkillName(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string") continue;
      const canonical = canonicalSkillName(item);
      if (canonical !== null) return canonical;
    }
  }
  return null;
}

export function normalizeRequirements(snapshot: JobSnapshot): readonly NormalizedRequirement[] {
  if (snapshot.requirements.length > 0) {
    return snapshot.requirements.map(requirement => ({
      id: requirement.id,
      category: requirement.category,
      strength: requirement.strength,
      skill: skillFromExpression(requirement.expression),
      evidenceText: requirement.original_text,
      source: "explicit" as const,
    }));
  }
  return deriveRequirements(`${snapshot.title}. ${snapshot.description_text}`);
}

function verdictFor(requirement: NormalizedRequirement, profile: ManualProfileInput): RequirementVerdictRow {
  // Honesty rules, in order: we never blame the candidate for data the profile
  // model does not have, and we never claim a check we could not run.
  if (requirement.category !== "skill" || requirement.skill === null) {
    return { requirement, verdict: "unknown",
      reason: "В профиле пока нет данных для проверки этого требования — статус не определён." };
  }
  if (profile.skills.length === 0) {
    return { requirement, verdict: "unknown",
      reason: "В профиле не указаны навыки — сравнивать не с чем." };
  }
  const covered = profile.skills.some(skill => skill.trim().toLowerCase() === requirement.skill?.toLowerCase());
  if (covered) {
    return { requirement, verdict: "covered",
      reason: `Профиль подтверждает навык «${requirement.skill}».` };
  }
  // Wording matters: the profile is evidence of what the candidate confirmed,
  // not proof of what they lack.
  return { requirement, verdict: "uncovered",
    reason: `В профиле не указан навык «${requirement.skill}» (требование вакансии).` };
}

export function assessRequirements(
  requirements: readonly NormalizedRequirement[],
  profile: ManualProfileInput,
): RequirementAssessment {
  const rows = requirements.map(requirement => verdictFor(requirement, profile));
  const must = rows.filter(row => row.requirement.strength === "must");
  const preferred = rows.filter(row => row.requirement.strength === "preferred");
  const assessable = rows.filter(row => row.verdict !== "unknown");
  const covered = rows.filter(row => row.verdict === "covered");
  const mustCovered = must.filter(row => row.verdict === "covered").length;
  return {
    rows,
    mustTotal: must.length,
    mustCovered,
    mustUncovered: must.filter(row => row.verdict === "uncovered").length,
    preferredTotal: preferred.length,
    preferredCovered: preferred.filter(row => row.verdict === "covered").length,
    unknownCount: rows.length - assessable.length,
    coverage: assessable.length === 0 ? null : covered.length / assessable.length,
    missingSkills: rows
      .filter(row => row.verdict === "uncovered" && row.requirement.skill !== null)
      .map(row => row.requirement.skill as string),
  };
}

// Convenience for callers that only have a snapshot (the ranker, the harness).
export function assessSnapshotRequirements(
  snapshot: JobSnapshot,
  profile: ManualProfileInput,
): RequirementAssessment {
  return assessRequirements(normalizeRequirements(snapshot), profile);
}
