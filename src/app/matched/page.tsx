import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { matchedForUser, type MatchedJob } from "../../server/matching-service.ts";
import type { RuleResult } from "../../domain/matching.ts";
import { HideButton } from "../../components/feedback-buttons.tsx";
import { RelevanceButton, BatchAnalyzeButton, ScoreBadge } from "../../components/relevance-buttons.tsx";
import { SaveButton } from "../../components/save-button.tsx";
import { Icon } from "../../components/icon.tsx";
import { tint } from "../../components/job-card.tsx";
import { getAllCachedScores } from "../../server/relevance-service.ts";
import { firstSeenLabel } from "../../domain/freshness.ts";
import { SEEN_TTL_DAYS } from "../../domain/seen-set.ts";
import { ImpressionReporter } from "../../components/impression-reporter.tsx";
import { latestProfile } from "../../server/profile-service.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import type { RelevanceScore } from "../../server/relevance-service.ts";

export const metadata: Metadata = { title: "Подбор" };
export const dynamic = "force-dynamic";

// The order this feed actually shows today: cached AI relevance first when it
// exists, catalog order otherwise (match tab), catalog order (review tab). No
// versioned ranker is wired into the read path yet (item A9), so the journal is
// given an explicit label of what produced the order rather than a made-up
// ranker version.
const FEED_ORDER_VERSION = {
  match: "v0-ai-score-then-catalog",
  review: "v0-review-catalog-order",
} as const;

const OUTCOME_LABELS: Readonly<Record<string, string>> = {
  pass: "совпадает", fail: "не подходит", unknown: "нужно уточнить", not_applicable: "не применимо",
};
const EMPLOYMENT_LABELS: Readonly<Record<string, string>> = {
  employment_full_time: "Полная занятость", employment_part_time: "Частичная занятость",
  contractor: "Подряд", freelance: "Фриланс", internship: "Стажировка", temporary: "Временная работа",
};

function geographyFact(job: MatchedJob): string {
  return job.card.geography.scope === "worldwide"
    ? "По всему миру (по контракту источника)"
    : job.card.geography.countries.length > 0
      ? job.card.geography.countries.join(", ")
      : "География не указана";
}

function RulesList({ rules }: { rules: readonly RuleResult[] }) {
  return <ul>
    {rules.map(rule => (
      <li key={`${rule.hiringOptionId ?? "job"}-${rule.ruleId}`}>
        <strong>{rule.ruleId} — {OUTCOME_LABELS[rule.outcome] ?? rule.outcome}</strong>
        {rule.reasonCodes.length > 0 && <span className="secondary"> ({rule.reasonCodes.join(", ")})</span>}
        <br />{rule.explanation}
      </li>
    ))}
  </ul>;
}

function MatchedCard({ job, score, tone, now }: {
  job: MatchedJob; score?: RelevanceScore | null; tone: "match" | "review"; now: string;
}) {
  const card = job.card;
  const primary = job.evaluation.rules.find(rule => rule.explanation.trim().length > 0);
  const published = card.publishedAt ? card.publishedAt.slice(0, 10) : null;
  // Item A5: when OUR pipeline first saw the posting, next to (not instead of)
  // the source's own publication date — the two are different facts.
  const foundAge = firstSeenLabel(card.firstSeenAt, now);
  return <article className="job-card">
    <div className="job-top">
      <span className={`company-mark ${tint(card.company)}`} aria-hidden="true">{card.company.slice(0, 1)}</span>
      <div className="job-title-area">
        <p className="company">{card.company}</p>
        <h3><a href={card.apply.url} rel="nofollow noreferrer" target="_blank">{card.title}</a></h3>
      </div>
      <SaveButton snapshotId={card.id} variant="icon" />
    </div>
    <p className="salary money">{card.salaryOriginalText ?? "Зарплата не опубликована"}</p>
    <div className="job-facts">
      <span><Icon name="globe" />{geographyFact(job)}</span>
      {published && <span><Icon name="calendar" />Листинг от {published}</span>}
      {foundAge !== null && <span><Icon name="clock" />{foundAge}</span>}
    </div>
    <div className="job-bottom">
      <div>
        <span className={`badge ${tone === "match" ? "pass" : "review"}`}>
          <Icon name={tone === "match" ? "check" : "help-circle"} size={16} />
          {tone === "match" ? "Условия совпадают" : "Нужно уточнить"}
        </span>
        <p className="job-reason">{primary?.explanation ?? "Правила оценили вакансию по опубликованным условиям."}</p>
        <details>
          <summary>Основание</summary>
          <div className="evidence"><RulesList rules={job.evaluation.rules} /></div>
        </details>
      </div>
      <div className="stack" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn secondary" href={`/letters/new?job=${card.id}`}>Составить письмо</Link>
          <HideButton snapshotId={card.id} />
        </div>
        {score
          ? <ScoreBadge score={score} />
          : <RelevanceButton snapshotId={card.id} />}
      </div>
    </div>
    <p className="source"><Icon name="source" size={16} />
      Источник: {card.source.displayName} · переход ведёт на листинг источника, отклик не отправляется</p>
  </article>;
}

export default async function Matched({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const tab = raw.tab === "review" ? "review" : "match";
  const user = await currentUser();
  if (!user) {
    return <section className="empty">
      <p className="overline">Подбор</p><h1>Подбор доступен после входа</h1>
      <p>Совместимость считается от вашего подтверждённого профиля.</p>
      <Link className="btn primary" href="/login">Войти</Link>
    </section>;
  }
  const result = await matchedForUser(user.id);
  if (result.status === "no_profile") {
    return <section className="empty">
      <p className="overline">Подбор</p><h1>Сначала профиль</h1>
      <p>Детерминированные правила работают от ваших подтверждённых условий.</p>
      <Link className="btn primary" href="/profile">Заполнить профиль</Link>
    </section>;
  }
  if (result.status === "fixture_backend") {
    return <section className="empty">
      <p className="overline">Подбор</p><h1>Нет данных источника</h1>
      <p>Локальный режим fixture не содержит снапшотов Himalayas — подбор честно пуст, без моков.</p>
      <p className="small secondary">Переключите DATA_BACKEND=postgres и выполните импорт источника.</p>
    </section>;
  }
  return <MatchedResults userId={user.id} result={result} tab={tab} />;
}

async function MatchedResults({ userId, result, tab }: {
  userId: string;
  result: NonNullable<Awaited<ReturnType<typeof matchedForUser>>>;
  tab: "match" | "review";
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
  // One reference time for the whole render: age labels (item A5) stay
  // consistent with each other and do not depend on load duration.
  const now = new Date().toISOString();
  // Sort eligible by AI score (desc), then by no-score, preserving stable order.
  const eligibleSorted = result.eligible.map(withScore).sort((a, b) => {
    if (a.score && b.score) return b.score.score - a.score.score;
    if (a.score) return -1;
    if (b.score) return 1;
    return 0;
  });
  const analyzedCount = result.eligible.filter(job => relevanceMap.has(job.card.id)).length;
  const input = profile?.input;
  const hours = input?.availabilityWindows[0];
  const contract = (input?.employmentTypes ?? [])
    .map(type => EMPLOYMENT_LABELS[type] ?? type).join(", ");
  const contextInfo = [
    input?.residenceCountry || "Не задано",
    hours ? `${hours.start}–${hours.end}` : "Не задано",
    contract || "Не задано",
  ].join(" · ");
  const roles = (input?.targetRoles ?? []).join(", ");
  const suppressedHere = tab === "review" ? result.seenSuppressed.needsReview : result.seenSuppressed.eligible;
  // One normalised list: the rendered slice is also what the impression report
  // describes, so the positions in the journal match what the candidate saw.
  const list: readonly { job: MatchedJob; score: RelevanceScore | null }[] = tab === "review"
    ? result.needsReview.slice(0, 50).map(job => ({ job, score: null }))
    : eligibleSorted.slice(0, 50);
  return <>
    <header className="page-head">
      <p className="overline">Подбор с основаниями</p>
      <h1>Вакансии для вас</h1>
      <p>Правила v{result.rulesetVersion} по опубликованным условиям; AI-рейтинг релевантности
        кэшируется до смены профиля.</p>
    </header>
    <div className="mode-switch">
      <Link href="/matched" aria-current="page">Для вас</Link>
      <Link href="/jobs">Все вакансии</Link>
      <Link href="/whats-new">Что нового</Link>
    </div>
    <div className="results-layout">
      <aside className="results-sidebar" aria-label="Ваши условия">
        <p className="overline side-label">Ваши условия</p>
        <div className="side-block"><h3>Страна работы</h3>
          <p>{input?.residenceCountry || "Не задано"}</p></div>
        <div className="side-block"><h3>Рабочие часы</h3>
          <p>{hours ? `${hours.start}–${hours.end}${input?.timezone ? ` · ${input.timezone}` : ""}` : "Не задано"}</p></div>
        <div className="side-block"><h3>Сотрудничество</h3>
          <p>{contract || "Не задано"}</p></div>
        <div className="side-block"><h3>Всегда включено</h3>
          <p>Полностью удалённо. Без обязательного офиса.</p></div>
        <Link className="btn tertiary" href="/profile">Изменить профиль</Link>
      </aside>
      <section aria-label="Результаты подбора">
        <div className="context">
          <div>
            <p className="context-title">{roles || "Профиль"} · подтверждённый профиль</p>
            <p className="context-info">{contextInfo}</p>
          </div>
          <Link className="btn secondary" href="/profile">Изменить</Link>
        </div>
        <nav className="tablist" aria-label="Результаты совместимости">
          <Link href="/matched" aria-current={tab === "match" ? "page" : undefined}>
            Условия совпадают<span className="tabcount">{result.eligible.length}</span></Link>
          <Link href="/matched?tab=review" aria-current={tab === "review" ? "page" : undefined}>
            Нужно уточнить<span className="tabcount">{result.needsReview.length}</span></Link>
        </nav>
        <div className="results-meta">
          <span>{tab === "match" ? result.eligible.length : result.needsReview.length} в выборке</span>
          {analyzedCount > 0 && tab === "match" && <span>Сначала релевантные</span>}
        </div>
        {tab === "match" && <div className="row" style={{ marginBottom: 16 }}>
          <BatchAnalyzeButton count={result.eligible.length - analyzedCount} />
        </div>}
        {list.length === 0
          ? <div className="empty">
            {suppressedHere > 0
              ? <>
                <h2>Новых {tab === "match" ? "совпадений" : "уточнений"} нет</h2>
                <p>Вакансии, которые вы уже видели, не показываются заново — скрыто
                  {" "}{suppressedHere}. Они вернутся, если вакансия изменится, или через
                  {" "}{SEEN_TTL_DAYS} дней.</p>
                <Link className="btn tertiary" href={tab === "match" ? "/matched?tab=review" : "/matched"}>
                  {tab === "match" ? "Нужно уточнить" : "Условия совпадают"}</Link>
              </>
              : tab === "match"
                ? <>
                  <h2>Совпадений пока нет</h2>
                  <p>Правила не нашли полностью совместимых вакансий — это честный результат, а не ошибка.
                    Проверьте вкладку «Нужно уточнить».</p>
                  <Link className="btn tertiary" href="/matched?tab=review">Нужно уточнить</Link>
                </>
                : <>
                  <h2>Уточнений нет</h2>
                  <p>Все вакансии либо совпадают по опубликованным условиям, либо несовместимы и скрыты.</p>
                  <Link className="btn tertiary" href="/matched">Условия совпадают</Link>
                </>}
          </div>
          : <div className="job-list">
            {list.map(({ job, score }) =>
              <MatchedCard key={job.card.id} job={job} score={score}
                tone={tab === "review" ? "review" : "match"} now={now} />)}
          </div>}
        {list.length > 0 && suppressedHere > 0 && <p className="small secondary" style={{ marginTop: 8 }}>
          Скрыто как уже показанное: {suppressedHere} — вернутся, если вакансия изменится,
          или через {SEEN_TTL_DAYS} дней.
        </p>}
        <p className="small secondary" style={{ marginTop: 16 }}>
          Несовместимые вакансии скрыты; вне оценки (гейты remote/права/жизненный цикл):
          {" "}{result.notEvaluatedCount}.
        </p>
        <ImpressionReporter rankerVersion={FEED_ORDER_VERSION[tab]}
          items={list.map(({ job }, index) => ({ snapshotId: job.card.id, position: index }))} />
      </section>
    </div>
  </>;
}
