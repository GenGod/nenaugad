// LLM field extraction from a POSTING's text (design item C1; purpose
// `extraction` approved by the owner on 2026-10-04, task C0-002).
//
// Job-only by CONSTRUCTION: the prompt is assembled in the service
// (src/server/ai/extraction-service.ts) through `buildJobOnlyPrompt`, the single
// constructor the personal-data boundary allows, whose input type (title,
// company, description) cannot carry a profile field — so this feature cannot
// leak candidate data even by mistake. The boundary records the review as
// `extraction: false` (src/server/ai/personal-data-boundary.ts).
//
// The honesty rules of the extraction, as the brief demands them:
//   * a field the posting does not state is the literal "unknown" — never null,
//     never an estimate, never a default;
//   * every non-"unknown" value must carry an `evidence` quote copied VERBATIM
//     from the posting, and the value itself must appear inside that quote —
//     a value the quote does not support is an invention by construction;
//   * "unknown" must carry an EMPTY quote (quoting an absence is a
//     contradiction);
//   * one violation rejects the WHOLE record: a model that invents one field
//     has not earned trust for the others, and a partially accepted record
//     would smuggle the invented part into the catalog.
//
// Versions: the prompt wording is a constant (EXTRACTION_PROMPT_VERSION) and it
// travels into the stored provenance next to the model version, so a record can
// always be traced to the exact pair that produced it. The instruction below is
// the domain half of the prompt; the service wraps it with the posting facts.
//
// Pure: text in, verdict out — no clock, no database, no network. The guarded
// call and the storage live in src/server/ai/extraction-service.ts.

/** Bump when the wording below changes: the version travels into provenance. */
export const EXTRACTION_PROMPT_VERSION = "extraction-p1";

/** The literal the model must return for a field the posting does not state. */
export const UNKNOWN_VALUE = "unknown";

/** A model that exceeds this is not extracting, it is enumerating. */
export const MAX_EXTRACTED_REQUIREMENTS = 25;

export type ExtractionCategory = "skill" | "experience" | "language" | "education" | "certification" | "other";
export type ExtractionStrength = "must" | "preferred" | "unclear";

export type ExtractedRequirement = Readonly<{
  category: ExtractionCategory;
  strength: ExtractionStrength;
  /** The requirement as the posting states it (never "unknown": a row exists only if it was read). */
  value: string;
  /** Verbatim quote from the posting the value was read from. */
  evidence: string;
}>;

export type ExtractedCompensation = Readonly<{
  /** The posting's own wording, or UNKNOWN_VALUE — never an estimate. */
  originalText: string;
  /** Verbatim quote, or "" when originalText is UNKNOWN_VALUE. */
  evidence: string;
}>;

export type ExtractedFields = Readonly<{
  requirements: readonly ExtractedRequirement[];
  compensation: ExtractedCompensation;
}>;

const CATEGORIES: ReadonlySet<string> = new Set<ExtractionCategory>([
  "skill", "experience", "language", "education", "certification", "other",
]);
const STRENGTHS: ReadonlySet<string> = new Set<ExtractionStrength>(["must", "preferred", "unclear"]);

/**
 * The instruction for the model. Kept as one auditable block; the output shape
 * it demands is exactly what `parseExtraction` validates — the two may not drift
 * apart, and a test pins the field names.
 */
export function extractionInstruction(): string {
  return [
    "Extract structured fields from the job posting below. Return JSON only, shaped exactly as:",
    '{"requirements":[{"category":"skill|experience|language|education|certification|other",'
      + '"strength":"must|preferred|unclear","value":"<the requirement as written>",'
      + '"evidence":"<verbatim quote from the posting>"}],'
      + '"compensation":{"originalText":"<the compensation as written>","evidence":"<verbatim quote>"}}',
    `Rules: (1) any field the posting does not state must be the exact string "${UNKNOWN_VALUE}";`,
    `(2) never infer, estimate or complete — an unstated salary is "${UNKNOWN_VALUE}", not a guess;`,
    "(3) every requirement and every stated compensation must include an \"evidence\" quote copied verbatim from the posting;",
    `(4) when a value is "${UNKNOWN_VALUE}", its evidence must be the empty string "";`,
    `(5) list at most ${MAX_EXTRACTED_REQUIREMENTS} requirements, strongest first; do not invent requirements the posting does not mention.`,
  ].join("\n");
}

export type ExtractionRejection = Readonly<{ code: string; detail: string }>;

export type ExtractionParseResult =
  | Readonly<{ ok: true; fields: ExtractedFields }>
  | Readonly<{ ok: false; reasons: readonly ExtractionRejection[] }>;

function normalize(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict parser + grounding validator. Any violation (schema, enum, grounding,
 * unknown-consistency, count) rejects the whole record; the reasons are codes
 * with a path detail, never model text.
 */
export function parseExtraction(rawOutput: string, postingText: string): ExtractionParseResult {
  const reasons: ExtractionRejection[] = [];
  const reject = (code: string, detail: string): void => {
    if (reasons.length < 20) reasons.push({ code, detail });
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return { ok: false, reasons: [{ code: "INVALID_JSON", detail: "output is not valid JSON" }] };
  }
  if (!isRecord(parsed)) return { ok: false, reasons: [{ code: "SCHEMA_VIOLATION", detail: "root is not an object" }] };

  const normalizedPosting = normalize(postingText);
  const grounded = (quote: string): boolean =>
    quote.trim().length > 0 && normalizedPosting.includes(normalize(quote));

  const rawRequirements = parsed.requirements;
  const requirements: ExtractedRequirement[] = [];
  if (!Array.isArray(rawRequirements)) {
    reject("SCHEMA_VIOLATION", "requirements is not an array");
  } else if (rawRequirements.length > MAX_EXTRACTED_REQUIREMENTS) {
    reject("TOO_MANY_REQUIREMENTS", `requirements: ${rawRequirements.length}`);
  } else {
    rawRequirements.forEach((row, index) => {
      if (!isRecord(row)) { reject("SCHEMA_VIOLATION", `requirements[${index}] is not an object`); return; }
      const { category, strength, value, evidence } = row;
      if (typeof category !== "string" || !CATEGORIES.has(category)) {
        reject("UNKNOWN_CATEGORY", `requirements[${index}].category`);
      }
      if (typeof strength !== "string" || !STRENGTHS.has(strength)) {
        reject("UNKNOWN_STRENGTH", `requirements[${index}].strength`);
      }
      if (typeof value !== "string" || value.trim().length === 0) {
        reject("SCHEMA_VIOLATION", `requirements[${index}].value is empty`);
      } else if (normalize(value) === UNKNOWN_VALUE) {
        // A requirement row exists only if something was read; "unknown" here is
        // an empty row wearing a value.
        reject("UNKNOWN_REQUIREMENT_VALUE", `requirements[${index}]`);
      }
      if (typeof evidence !== "string") {
        reject("SCHEMA_VIOLATION", `requirements[${index}].evidence is not a string`);
      } else if (!grounded(evidence)) {
        reject("EVIDENCE_NOT_GROUNDED", `requirements[${index}].evidence`);
      } else if (typeof value === "string" && !normalize(evidence).includes(normalize(value))) {
        reject("VALUE_NOT_GROUNDED", `requirements[${index}].value`);
      }
      if (
        typeof category === "string" && CATEGORIES.has(category)
        && typeof strength === "string" && STRENGTHS.has(strength)
        && typeof value === "string" && value.trim().length > 0
        && typeof evidence === "string" && grounded(evidence)
        && normalize(evidence).includes(normalize(value))
        && normalize(value) !== UNKNOWN_VALUE
      ) {
        requirements.push({
          category: category as ExtractionCategory,
          strength: strength as ExtractionStrength,
          value,
          evidence,
        });
      }
    });
  }

  const rawCompensation = parsed.compensation;
  let compensation: ExtractedCompensation | null = null;
  if (!isRecord(rawCompensation)) {
    reject("SCHEMA_VIOLATION", "compensation is not an object");
  } else {
    const { originalText, evidence } = rawCompensation;
    if (typeof originalText !== "string" || originalText.trim().length === 0) {
      reject("SCHEMA_VIOLATION", "compensation.originalText is empty");
    } else if (typeof evidence !== "string") {
      reject("SCHEMA_VIOLATION", "compensation.evidence is not a string");
    } else if (normalize(originalText) === UNKNOWN_VALUE) {
      if (evidence.trim().length > 0) reject("UNKNOWN_WITH_EVIDENCE", "compensation");
      else compensation = { originalText: UNKNOWN_VALUE, evidence: "" };
    } else if (!grounded(evidence)) {
      reject("EVIDENCE_NOT_GROUNDED", "compensation.evidence");
    } else if (!normalize(evidence).includes(normalize(originalText))) {
      reject("VALUE_NOT_GROUNDED", "compensation.originalText");
    } else {
      compensation = { originalText, evidence };
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  if (compensation === null) {
    // Unreachable when reasons is empty, but the compiler cannot know it; fail
    // closed rather than assert a shape that was not built.
    return { ok: false, reasons: [{ code: "SCHEMA_VIOLATION", detail: "compensation missing" }] };
  }
  return { ok: true, fields: { requirements, compensation } };
}
