// Relevance scoring: caching, prompt building, response parsing.
// The AI call itself lives in the API route (avoids importing the openai
// SDK in server components — Turbopack resolution issues).
import type { Pool } from "pg";

export const RELEVANCE_BATCH_SIZE = 10;

export type RelevanceScore = Readonly<{
  snapshotId: string;
  score: number;
  matchedSkills: readonly string[];
  missingSkills: readonly string[];
  explanation: string;
}>;

export class RelevanceError extends Error {
  constructor(code: "PROFILE_REQUIRED" | "NO_ELIGIBLE_JOBS" | "ANALYSIS_FAILED" | "BUDGET_EXCEEDED") {
    super(code);
  }
}

// --- Cache ---------------------------------------------------------------
export async function getCachedScore(params: Readonly<{
  pool: Pool; userId: string; snapshotId: string; profileVersion: number;
}>): Promise<RelevanceScore | null> {
  const result = await params.pool.query(
    "SELECT snapshot_id, score, matched_skills, missing_skills, explanation FROM job_relevance_scores WHERE user_id = $1 AND snapshot_id = $2 AND profile_version = $3",
    [params.userId, params.snapshotId, params.profileVersion],
  );
  return toScore(result.rows[0] as Record<string, unknown> | undefined);
}

export async function getAllCachedScores(params: Readonly<{
  pool: Pool; userId: string; profileVersion: number;
}>): Promise<ReadonlyMap<string, RelevanceScore>> {
  const result = await params.pool.query(
    "SELECT snapshot_id, score, matched_skills, missing_skills, explanation FROM job_relevance_scores WHERE user_id = $1 AND profile_version = $2",
    [params.userId, params.profileVersion],
  );
  const map = new Map<string, RelevanceScore>();
  for (const row of result.rows) {
    const score = toScore(row as Record<string, unknown>);
    if (score) map.set(score.snapshotId, score);
  }
  return map;
}

function toScore(row: Record<string, unknown> | undefined): RelevanceScore | null {
  if (!row) return null;
  return {
    snapshotId: String(row.snapshot_id),
    score: Number(row.score),
    matchedSkills: Array.isArray(row.matched_skills) ? (row.matched_skills as string[]) : [],
    missingSkills: Array.isArray(row.missing_skills) ? (row.missing_skills as string[]) : [],
    explanation: String(row.explanation ?? ""),
  };
}

export async function storeScore(params: Readonly<{
  pool: Pool; userId: string; profileVersion: number; score: RelevanceScore; modelId: string;
}>): Promise<void> {
  await params.pool.query(
    "INSERT INTO job_relevance_scores (user_id, snapshot_id, profile_version, score, matched_skills, missing_skills, explanation, model_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, snapshot_id, profile_version) DO UPDATE SET score = EXCLUDED.score, matched_skills = EXCLUDED.matched_skills, missing_skills = EXCLUDED.missing_skills, explanation = EXCLUDED.explanation, model_id = EXCLUDED.model_id",
    [params.userId, params.score.snapshotId, params.profileVersion,
      params.score.score, JSON.stringify(params.score.matchedSkills),
      JSON.stringify(params.score.missingSkills), params.score.explanation, params.modelId],
  );
}

// --- Prompt building -----------------------------------------------------
export function buildSinglePrompt(job: { title: string; company: string; description: string },
  profile: { targetRoles: readonly string[]; country: string }): string {
  return `Analyze the relevance of this job for the candidate.

Candidate target roles: ${profile.targetRoles.join(", ")}
Candidate country: ${profile.country}

Job title: ${job.title}
Company: ${job.company}
Job description (excerpt): ${job.description.slice(0, 800)}

Rate relevance 0-100 and identify matched/missing skills.
Return JSON: {"score": <0-100>, "matched_skills": [...], "missing_skills": [...], "explanation": "..."}`;
}

export function buildBatchPrompt(jobs: { id: string; title: string; company: string; description: string }[],
  profile: { targetRoles: readonly string[]; country: string }): string {
  const jobList = jobs.map((job, index) =>
    `[${index + 1}] ID: ${job.id}\nTitle: ${job.title} at ${job.company}\nDescription: ${job.description.slice(0, 400)}`,
  ).join("\n\n");
  return `Analyze relevance of ${jobs.length} jobs for this candidate.

Candidate target roles: ${profile.targetRoles.join(", ")}
Candidate country: ${profile.country}

Jobs:
${jobList}

Rate each job 0-100 and identify top matched/missing skills.
Return JSON array, one object per job:
[{"id": "<job ID>", "score": <0-100>, "matched_skills": [...], "missing_skills": [...], "explanation": "..."}]`;
}

// --- Response parsing ----------------------------------------------------
export function parseRelevanceResponse(raw: string): Omit<RelevanceScore, "snapshotId"> | null {
  try {
    const parsed = JSON.parse(raw) as { score?: unknown; matched_skills?: unknown;
      missing_skills?: unknown; explanation?: unknown };
    if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) return null;
    return {
      score: Math.round(parsed.score),
      matchedSkills: Array.isArray(parsed.matched_skills) ? (parsed.matched_skills as string[]) : [],
      missingSkills: Array.isArray(parsed.missing_skills) ? (parsed.missing_skills as string[]) : [],
      explanation: typeof parsed.explanation === "string" ? parsed.explanation.slice(0, 500) : "",
    };
  } catch { return null; }
}

export function parseBatchResponse(raw: string): RelevanceScore[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return null;
    const scores: RelevanceScore[] = [];
    for (const item of parsed) {
      const entry = item as { id?: unknown; score?: unknown; matched_skills?: unknown;
        missing_skills?: unknown; explanation?: unknown };
      if (typeof entry.id !== "string" || typeof entry.score !== "number") continue;
      if (entry.score < 0 || entry.score > 100) continue;
      scores.push({
        snapshotId: entry.id,
        score: Math.round(entry.score),
        matchedSkills: Array.isArray(entry.matched_skills) ? (entry.matched_skills as string[]) : [],
        missingSkills: Array.isArray(entry.missing_skills) ? (entry.missing_skills as string[]) : [],
        explanation: typeof entry.explanation === "string" ? entry.explanation.slice(0, 500) : "",
      });
    }
    return scores.length > 0 ? scores : null;
  } catch { return null; }
}
