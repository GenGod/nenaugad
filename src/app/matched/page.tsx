import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { matchedForUser, type MatchedJob } from "../../server/matching-service.ts";
import type { RuleResult } from "../../domain/matching.ts";
import { HideButton } from "../../components/feedback-buttons.tsx";
import { RelevanceButton, BatchAnalyzeButton, ScoreBadge } from "../../components/relevance-buttons.tsx";
import { getAllCachedScores } from "../../server/relevance-service.ts";
import { latestProfile } from "../../server/profile-service.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import type { RelevanceScore } from "../../server/relevance-service.ts";

export const metadata: Metadata = { title: "Подбор" };
export const dynamic = "force-dynamic";

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  pass: "совпадает", fail: "не подходит", unknown: "нужно уточнить", not_applicable: "не применимо",
};

function RulesList({ rules }: { rules: readonly RuleResult[] }) {
  return <ul className="roadmap" style={{ margin: "8px 0 16px" }}>
    {rules.map(rule => (
      <li key={`${rule.hiringOptionId ?? "job"}-${rule.ruleId}`}>
        <strong>{rule.ruleId} — {OUTCOME_LABELS[rule.outcome] ?? rule.outcome}</strong>
        {rule.reasonCodes.length > 0 && <span className="muted"> ({rule.reasonCodes.join(", ")})</span>}
        <br />{rule.explanation}
      </li>
    ))}
  </ul>;
}

function MatchedCard({ job, score }: { job: MatchedJob; score?: RelevanceScore | null }) {
  return <article className="job-card">
    <div className="card-top">
      <div className="company-monogram" aria-hidden="true">{job.card.company.slice(0, 1)}</div>
      <div className="card-heading">
        <p className="company">{job.card.company}</p>
        <h2><a href={job.card.apply.url} rel="nofollow noreferrer" target="_blank">{job.card.title}</a></h2>
      </div>
      <span className="badge neutral">{job.card.salaryOriginalText ?? "Зарплата не указана"}</span>
    </div>
    <RulesList rules={job.evaluation.rules} />
    <div className="card-bottom">
      <span className="badge neutral">{job.card.geography.scope === "worldwide"
        ? "По всему миру (по контракту источника)"
        : job.card.geography.countries.length > 0
          ? job.card.geography.countries.join(", ")
          : "География не указана"}</span>
      <a className="text-link" href={job.card.apply.url} rel="nofollow noreferrer" target="_blank">
        Открыть на {job.card.source.displayName} <span aria-hidden="true">↗</span>
      </a>
      <HideButton snapshotId={job.card.id} />
      <Link className="button secondary compact" href={`/letters/new?job=${job.card.id}`}>
        Составить письмо
      </Link>
      {score
        ? <ScoreBadge score={score} />
        : <RelevanceButton snapshotId={job.card.id} />}
    </div>
  </article>;
}

export default async function Matched() {
  const user = await currentUser();
  if (!user) {
    return <section className="status-page">
      <p className="eyebrow">Подбор</p><h1>Подбор доступен после входа</h1>
      <Link className="button primary" href="/login">Войти</Link>
    </section>;
  }
  const result = await matchedForUser(user.id);
  if (result.status === "no_profile") {
    return <section className="status-page">
      <p className="eyebrow">Подбор</p><h1>Сначала профиль</h1>
      <p className="hero-lead">Детерминированные правила работают от ваших подтверждённых условий.</p>
      <Link className="button primary" href="/profile">Заполнить профиль</Link>
    </section>;
  }
  if (result.status === "fixture_backend") {
    return <section className="status-page">
      <p className="eyebrow">Подбор</p><h1>Нет данных источника</h1>
      <p className="hero-lead">Локальный режим fixture не содержит снапшотов Himalayas — подбор честно пуст, без моков.</p>
      <p className="helper">Переключите DATA_BACKEND=postgres и выполните импорт источника.</p>
    </section>;
  }
  return <>
    <MatchedResults userId={user.id} result={result} />
  </>;
}

async function MatchedResults({ userId, result }: {
  userId: string;
  result: NonNullable<Awaited<ReturnType<typeof matchedForUser>>>;
}) {
  // Load cached AI relevance scores for this profile version.
  const pool = snapshotPool();
  const profile = await latestProfile(pool, userId);
  const relevanceMap = profile
    ? await getAllCachedScores({ pool, userId, profileVersion: profile.version })
    : new Map<string, RelevanceScore>();
  const withScore = (job: MatchedJob): { job: MatchedJob; score: RelevanceScore | null } => ({
    job, score: relevanceMap.get(job.card.id) ?? null,
  });
  // Sort eligible by AI score (desc), then by no-score, preserving stable order.
  const eligibleSorted = result.eligible.map(withScore).sort((a, b) => {
    if (a.score && b.score) return b.score.score - a.score.score;
    if (a.score) return -1;
    if (b.score) return 1;
    return 0;
  });
  const analyzedCount = result.eligible.filter(job => relevanceMap.has(job.card.id)).length;
  return <>
    <section className="page-heading">
      <div><p className="eyebrow">Подбор / правила v{result.rulesetVersion} + AI</p>
        <h1>Совместимо по опубликованным условиям.</h1>
        <p>Детерминированные правила без LLM + AI-рейтинг релевантности (кэшируется до смены профиля).</p></div>
      <span className="catalog-count">{result.eligible.length} совместимо · {result.needsReview.length} уточнить{analyzedCount > 0 ? ` · ${analyzedCount} с AI-рейтингом` : ""}</span>
    </section>
    <div style={{ marginBottom: 16 }}>
      <BatchAnalyzeButton count={result.eligible.length - analyzedCount} />
    </div>
    <section aria-label="Совместимые вакансии" className="results">
      {eligibleSorted.length === 0
        ? <div className="empty-state"><h2>Совпадений пока нет</h2>
          <p>Правила не нашли полностью совместимых вакансий — это честный результат, а не ошибка.</p></div>
        : eligibleSorted.slice(0, 50).map(({ job, score }) =>
          <MatchedCard key={job.card.id} job={job} score={score} />)}
    </section>
    {result.needsReview.length > 0 && <>
      <section className="result-header"><h2>Нужно уточнить</h2>
        <span className="muted">Неизвестные условия не превращаются ни в «да», ни в «нет»</span></section>
      <section aria-label="Вакансии, требующие уточнения" className="results">
        {result.needsReview.slice(0, 50).map(job => <MatchedCard key={job.card.id} job={job} />)}
      </section>
    </>}
    <p className="helper">Несовместимые вакансии скрыты; вне оценки (гейты remote/права/жизненный цикл): {result.notEvaluatedCount}.</p>
  </>;
}
