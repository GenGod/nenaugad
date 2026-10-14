// The cover-letter prompt (S4-001, S4-003), in one place so the generation route and
// the local-model measurement (MODEL-002, owner approval 2026-10-13) send the same
// words. Moved out of the route unchanged; tests/unit/letter-prompt.test.ts pins it.

/** The job excerpt a targeted letter sees: the card's excerpt, else the description's start; 500 characters. */
export function letterJobExcerpt(excerpt: string | null | undefined, descriptionText: string): string {
  return (excerpt || descriptionText.slice(0, 500)).slice(0, 500);
}

/**
 * A targeted letter names the job; a general one (`job: null`, CL §3) names no employer.
 * The candidate is described by the target roles and the country only.
 */
export function buildLetterPrompt(params: Readonly<{
  targetRoles: readonly string[];
  country: string | null;
  job: Readonly<{ title: string; company: string; excerpt: string }> | null;
}>): string {
  const roles = params.targetRoles.join(", ");
  const country = params.country ?? "не указана";
  if (params.job) {
    const { title, company, excerpt } = params.job;
    return `Write a professional cover letter for the position "${title}" at "${company}". Candidate target roles: ${roles}. Country: ${country}. Job excerpt: ${excerpt}. Write in a neutral professional tone, 150-250 words. Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}`;
  }
  return `Write a general cover letter draft (no specific employer). Candidate target roles: ${roles}. Country: ${country}. Highlight transferable skills and professional interests. Do NOT mention any specific employer, company, product, mission, or position. Write in a neutral professional tone, 150-250 words. Add at the end: "Адаптируйте под конкретную вакансию." Do NOT invent achievements, metrics, or skills not mentioned. Output JSON: {"cover_letter": "..."}`;
}
