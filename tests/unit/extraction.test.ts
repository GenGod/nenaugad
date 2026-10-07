import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXTRACTION_PROMPT_VERSION, MAX_EXTRACTED_REQUIREMENTS, UNKNOWN_VALUE,
  extractionInstruction, parseExtraction,
} from "../../src/domain/extraction.ts";

// C1 (design item C1): the extraction schema, the unknown rules and the
// grounding validator. The verification cases of the brief are here verbatim:
// a posting without a salary yields "unknown" (not a guess), and a value the
// posting's text does not support rejects the WHOLE record — a model that
// invents one field has not earned trust for the others.

const POSTING = `Backend Engineer (Remote)

Requirements: must have Python and 3 years of backend experience.
Nice to have: Kubernetes.

We offer 80000 - 95000 EUR per year.`;

function payload(): string {
  return JSON.stringify({
    requirements: [
      { category: "skill", strength: "must", value: "Python", evidence: "must have Python" },
      { category: "experience", strength: "must", value: "3 years of backend experience", evidence: "3 years of backend experience" },
      { category: "skill", strength: "preferred", value: "Kubernetes", evidence: "Nice to have: Kubernetes" },
    ],
    compensation: { originalText: "80000 - 95000 EUR", evidence: "We offer 80000 - 95000 EUR per year" },
  });
}

test("a grounded payload is accepted with its fields intact", () => {
  const parsed = parseExtraction(payload(), POSTING);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.ok);
  assert.equal(parsed.fields.requirements.length, 3);
  assert.deepEqual(parsed.fields.requirements[0], {
    category: "skill", strength: "must", value: "Python", evidence: "must have Python",
  });
  assert.equal(parsed.fields.compensation.originalText, "80000 - 95000 EUR");
});

test("V4: a posting without a salary yields \"unknown\" — never a guess", () => {
  const parsed = parseExtraction(JSON.stringify({
    requirements: [],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.ok(parsed.ok);
  assert.equal(parsed.fields.compensation.originalText, UNKNOWN_VALUE);
  assert.equal(parsed.fields.compensation.evidence, "");
});

test("V4: an invented salary rejects the whole record", () => {
  // The quote is grounded, but the value it cites is not in it — the model
  // completed the number from nothing.
  const parsed = parseExtraction(JSON.stringify({
    requirements: [],
    compensation: { originalText: "120000 EUR", evidence: "We offer 80000 - 95000 EUR per year" },
  }), POSTING);
  assert.equal(parsed.ok, false);
  assert.ok(!parsed.ok);
  assert.ok(parsed.reasons.some(reason => reason.code === "VALUE_NOT_GROUNDED"),
    JSON.stringify(parsed.reasons));
});

test("an ungrounded quote rejects the whole record — even when another row is fine", () => {
  const parsed = parseExtraction(JSON.stringify({
    requirements: [
      { category: "skill", strength: "must", value: "Python", evidence: "must have Python" },
      { category: "skill", strength: "must", value: "Rust", evidence: "must have Rust" },
    ],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.equal(parsed.ok, false);
  assert.ok(!parsed.ok);
  assert.ok(parsed.reasons.some(reason => reason.code === "EVIDENCE_NOT_GROUNDED"));
});

test("unknown with a quote is a contradiction and is rejected", () => {
  const parsed = parseExtraction(JSON.stringify({
    requirements: [],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "We offer 80000 - 95000 EUR per year" },
  }), POSTING);
  assert.equal(parsed.ok, false);
  assert.ok(!parsed.ok);
  assert.ok(parsed.reasons.some(reason => reason.code === "UNKNOWN_WITH_EVIDENCE"));
});

test("a requirement row may not carry the unknown sentinel", () => {
  const parsed = parseExtraction(JSON.stringify({
    requirements: [{ category: "skill", strength: "must", value: UNKNOWN_VALUE, evidence: "must have Python" }],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.equal(parsed.ok, false);
  assert.ok(!parsed.ok);
  assert.ok(parsed.reasons.some(reason => reason.code === "UNKNOWN_REQUIREMENT_VALUE"));
});

test("schema violations are named: enums, shape, count, JSON", () => {
  const withBadCategory = parseExtraction(JSON.stringify({
    requirements: [{ category: "vibes", strength: "must", value: "Python", evidence: "must have Python" }],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.ok(!withBadCategory.ok);
  assert.ok(withBadCategory.reasons.some(reason => reason.code === "UNKNOWN_CATEGORY"));

  const withBadStrength = parseExtraction(JSON.stringify({
    requirements: [{ category: "skill", strength: "mandatory", value: "Python", evidence: "must have Python" }],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.ok(!withBadStrength.ok);
  assert.ok(withBadStrength.reasons.some(reason => reason.code === "UNKNOWN_STRENGTH"));

  const missingCompensation = parseExtraction(JSON.stringify({ requirements: [] }), POSTING);
  assert.ok(!missingCompensation.ok);
  assert.ok(missingCompensation.reasons.some(reason => reason.code === "SCHEMA_VIOLATION"));

  const tooMany = parseExtraction(JSON.stringify({
    requirements: Array.from({ length: MAX_EXTRACTED_REQUIREMENTS + 1 }, () => ({
      category: "skill", strength: "must", value: "Python", evidence: "must have Python",
    })),
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.ok(!tooMany.ok);
  assert.ok(tooMany.reasons.some(reason => reason.code === "TOO_MANY_REQUIREMENTS"));

  const notJson = parseExtraction("I could not extract anything, sorry.", POSTING);
  assert.ok(!notJson.ok);
  assert.deepEqual(notJson.reasons[0]?.code, "INVALID_JSON");
});

test("grounding survives whitespace and line breaks in the quote", () => {
  const parsed = parseExtraction(JSON.stringify({
    requirements: [{
      category: "experience", strength: "must",
      value: "3 years of backend experience",
      evidence: "must have Python and\n    3 years of backend experience",
    }],
    compensation: { originalText: UNKNOWN_VALUE, evidence: "" },
  }), POSTING);
  assert.ok(parsed.ok);
});

test("the instruction pins the output shape and the unknown rules", () => {
  const instruction = extractionInstruction();
  assert.ok(instruction.includes(UNKNOWN_VALUE));
  assert.ok(instruction.includes("evidence"));
  assert.ok(instruction.includes("requirements"));
  assert.ok(instruction.includes("compensation"));
  assert.equal(EXTRACTION_PROMPT_VERSION, "extraction-p2");
});

test("prompt p2 states the three rules the first live run asked for (B39)", () => {
  const instruction = extractionInstruction();
  // A phrase without an amount is not a stated compensation.
  assert.match(instruction, /compensation is stated only when the posting gives an amount/u);
  // A spoken or written language is a language, never a skill.
  assert.match(instruction, /language is always category "language"/u);
  // Personal qualities and general soft skills are "other".
  assert.match(instruction, /personal qualities and general soft skills .* are category "other"/u);
});

test("a compensation without an amount is stored as unknown, not as stated (B39)", () => {
  const posting = "Competitive compensation packages (depending on experience, location). Must have Python.";
  const parsed = parseExtraction(JSON.stringify({
    requirements: [{ category: "skill", strength: "must", value: "Python", evidence: "Must have Python" }],
    compensation: {
      originalText: "Competitive compensation packages (depending on experience, location)",
      evidence: "Competitive compensation packages (depending on experience, location)",
    },
  }), posting);
  assert.ok(parsed.ok, "a paid call is not thrown away over a vague phrase");
  assert.deepEqual(parsed.fields.compensation, { originalText: UNKNOWN_VALUE, evidence: "" });
  assert.equal(parsed.fields.requirements.length, 1);

  // An amount is kept as written, in any script's digits.
  const stated = parseExtraction(payload(), POSTING);
  assert.ok(stated.ok);
  assert.equal(stated.fields.compensation.originalText, "80000 - 95000 EUR");
  const arabicIndic = parseExtraction(JSON.stringify({
    requirements: [], compensation: { originalText: "٥٠٠٠ AED", evidence: "٥٠٠٠ AED" },
  }), "Salary ٥٠٠٠ AED monthly");
  assert.ok(arabicIndic.ok);
  assert.equal(arabicIndic.fields.compensation.originalText, "٥٠٠٠ AED");

  // A vague phrase that is not in the posting is still an invention: the record is rejected.
  const invented = parseExtraction(JSON.stringify({
    requirements: [], compensation: { originalText: "Generous pay", evidence: "Generous pay" },
  }), posting);
  assert.equal(invented.ok, false);
});

test("parsing is deterministic: same output, same text, same verdict", () => {
  const first = parseExtraction(payload(), POSTING);
  const second = parseExtraction(payload(), POSTING);
  assert.deepEqual(first, second);
});
