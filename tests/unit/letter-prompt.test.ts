import test from "node:test";
import assert from "node:assert/strict";
import { buildLetterPrompt, letterJobExcerpt } from "../../src/server/letters/prompt.ts";

// MODEL-002: the prompt moved out of the generation route unchanged. These are the
// route's two templates as they were (commit a0c6e10), filled with the same values.
test("the letter prompt is the route's, word for word, in both modes", () => {
  assert.equal(
    buildLetterPrompt({
      targetRoles: ["ML engineer", "data scientist"], country: "KZ",
      job: { title: "Senior ML Engineer", company: "Acme", excerpt: "We build models." },
    }),
    'Write a professional cover letter for the position "Senior ML Engineer" at "Acme". Candidate target roles: ML engineer, data scientist. Country: KZ. Job excerpt: We build models.. Write in a neutral professional tone, 150-250 words. Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}',
  );
  assert.equal(
    buildLetterPrompt({ targetRoles: ["QA engineer"], country: null, job: null }),
    'Write a general cover letter draft (no specific employer). Candidate target roles: QA engineer. Country: не указана. Highlight transferable skills and professional interests. Do NOT mention any specific employer, company, product, mission, or position. Write in a neutral professional tone, 150-250 words. Add at the end: "Адаптируйте под конкретную вакансию." Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}',
  );
});

test("the job excerpt is the card's, else the description's start, at most 500 characters", () => {
  assert.equal(letterJobExcerpt("Card excerpt.", "Description."), "Card excerpt.");
  assert.equal(letterJobExcerpt("", "Description."), "Description.");
  assert.equal(letterJobExcerpt(null, "x".repeat(600)).length, 500);
  assert.equal(letterJobExcerpt("y".repeat(700), "Description.").length, 500);
});
