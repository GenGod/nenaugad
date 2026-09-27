"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Score = { snapshotId: string; score: number;
  matchedSkills: readonly string[]; missingSkills: readonly string[]; explanation: string };

export function RelevanceButton({ snapshotId }: { snapshotId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <button type="button" className="btn secondary" disabled={busy}
      onClick={async () => {
        setBusy(true); setError(null);
        try {
          const res = await fetch("/api/v1/relevance", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ snapshotId }),
          });
          if (res.ok) router.refresh();
          else setError(res.status === 402 ? "Бюджет исчерпан." : "Не удалось.");
        } finally { setBusy(false); }
      }}>
      {busy ? "Анализ…" : "AI-рейтинг"}
    </button>
    {error && <span className="small secondary" role="alert">{error}</span>}
  </>;
}

export function BatchAnalyzeButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return <span className="row">
    <button type="button" className="btn primary" disabled={busy || count === 0}
      onClick={async () => {
        setBusy(true); setError(null); setResult(null);
        try {
          const res = await fetch("/api/v1/relevance", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ batch: true }),
          });
          const body = (await res.json().catch(() => ({}))) as {
            analyzed?: number; cached?: number; totalCostMicroCents?: string; error?: string };
          if (!res.ok) {
            setError(body.error === "BUDGET_EXCEEDED" ? "Бюджет исчерпан." : "Ошибка анализа.");
            return;
          }
          setResult(`Проанализировано: ${body.analyzed ?? 0}, из кэша: ${body.cached ?? 0}. ` +
            `Стоимость: ${body.totalCostMicroCents ?? "0"} micro-cents.`);
          router.refresh();
        } finally { setBusy(false); }
      }}>
      {busy ? "Анализируем…" : `AI-анализ всех (${count})`}
    </button>
    {result && <output className="small secondary" aria-live="polite">{result}</output>}
    {error && <span className="small secondary" role="alert">{error}</span>}
  </span>;
}

export function ScoreBadge({ score }: { score: Score }) {
  const tone = score.score >= 40 ? "neutral" : "review";
  return <div className="stack" style={{ gap: 4 }}>
    <span className={`badge ${tone}`} title={score.explanation}>
      AI-рейтинг: {score.score}/100
    </span>
    {score.matchedSkills.length > 0 &&
      <span className="small secondary">Совпало: {score.matchedSkills.slice(0, 3).join(", ")}</span>}
    {score.missingSkills.length > 0 &&
      <span className="small secondary">Не хватает: {score.missingSkills.slice(0, 3).join(", ")}</span>}
  </div>;
}
