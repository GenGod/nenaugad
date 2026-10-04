"use client";

type Score = { snapshotId: string; score: number;
  matchedSkills: readonly string[]; missingSkills: readonly string[]; explanation: string };

/**
 * The AI scoring actions (bulk analyse, per-posting analyse) were removed on
 * 2026-10-02: scoring is closed by the personal-data boundary until a local
 * model serves it (AI-007 + MODEL-001 measured), so both buttons only ever
 * answered 503. The cached scores stay visible as reference via ScoreBadge;
 * the guarded API route (/api/v1/relevance) stays in place for the day a local
 * model serves it again.
 */

export function ScoreBadge({ score }: { score: Score }) {
  const tone = score.score >= 40 ? "neutral" : "review";
  return <div className="stack" style={{ gap: 4 }}>
    <span className={`badge ${tone}`} title={score.explanation}>
      AI-оценка (справочно): {score.score}/100
    </span>
    {score.matchedSkills.length > 0 &&
      <span className="small secondary">Совпало: {score.matchedSkills.slice(0, 3).join(", ")}</span>}
    {score.missingSkills.length > 0 &&
      <span className="small secondary">Не хватает: {score.missingSkills.slice(0, 3).join(", ")}</span>}
  </div>;
}
