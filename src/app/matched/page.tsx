import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { matchedForUser, type MatchedJob } from "../../server/matching-service.ts";
import type { RuleResult } from "../../domain/matching.ts";
import { HideButton } from "../../components/feedback-buttons.tsx";
import { ScoreBadge } from "../../components/relevance-buttons.tsx";
import { SaveButton } from "../../components/save-button.tsx";
import { Icon } from "../../components/icon.tsx";
import { tint } from "../../components/job-card.tsx";
import { getAllCachedScores } from "../../server/relevance-service.ts";
import { firstSeenLabel } from "../../domain/freshness.ts";
import { hiringCountriesText } from "../../domain/snapshot-projection.ts";
import { availabilityNoteFor } from "../../domain/survival.ts";
import { SEEN_TTL_DAYS } from "../../domain/seen-set.ts";
import { ImpressionReporter } from "../../components/impression-reporter.tsx";
import { TrackedJobLink } from "../../components/tracked-job-link.tsx";
import { resolveFeedTab, type FeedKey } from "../../domain/feed-order.ts";
import {
  COUNTRY_MISSING_NOTICE, EMPTY_MATCH_WITHOUT_COUNTRY, lacksCountry,
} from "../../domain/profile-gaps.ts";
import { latestProfile } from "../../server/profile-service.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import type { RelevanceScore } from "../../server/relevance-service.ts";

export const metadata: Metadata = { title: "Подбор" };
export const dynamic = "force-dynamic";

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
    : hiringCountriesText(job.card.geography) ?? "География не указана";
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

const STRENGTH_LABELS: Readonly<Record<string, string>> = {
  must: "обязательное", preferred: "желательное", unclear: "тип неясен",
};
const VERDICT_LABELS: Readonly<Record<string, string>> = {
  covered: "подтверждено профилем", uncovered: "профилем не подтверждено", unknown: "неизвестно",
};

// B5: the requirement decomposition A2 computes reaches the candidate here —
// inside «Основание», with the same honest verdicts the ranker uses. Unknown is
// never silently turned into "covered" or into a rejection.
function RequirementsList({ requirements }: { requirements: MatchedJob["requirements"] }) {
  if (requirements.rows.length === 0) {
    return <p className="small secondary">Структурные требования в опубликованном тексте не выделены.</p>;
  }
  return <>
    <ul>
      {requirements.rows.map((row, index) => (
        <li key={`${row.requirement.id}-${index}`}>
          <strong>{STRENGTH_LABELS[row.requirement.strength] ?? row.requirement.strength}</strong>
          {" · "}{row.requirement.evidenceText}
          {" — "}{VERDICT_LABELS[row.verdict] ?? row.verdict}
          <span className="secondary"> ({row.reason})</span>
        </li>
      ))}
    </ul>
    {requirements.mustUncovered > 0 && <p className="small secondary">
      Не хватает по обязательным: {requirements.missingSkills.length > 0
        ? requirements.missingSkills.join(", ")
        : `${requirements.mustUncovered} без подтверждения в профиле`}.
    </p>}
  </>;
}

function MatchedCard({ job, score, tone, now, feed, position }: {
  job: MatchedJob; score?: RelevanceScore | null; tone: "match" | "review"; now: string;
  feed: FeedKey; position: number;
}) {
  const card = job.card;
  const primary = job.evaluation.rules.find(rule => rule.explanation.trim().length > 0);
  const published = card.publishedAt ? card.publishedAt.slice(0, 10) : null;
  // Item A5: when OUR pipeline first saw the posting, next to (not instead of)
  // the source's own publication date — the two are different facts.
  const foundAge = firstSeenLabel(card.firstSeenAt, now);
  // Items A10/B6: a posting whose availability we could not confirm is still
  // shown — one failed check is a suspicion, not proof — and a posting that has
  // been in the catalog for months carries the soft age caution. One honest
  // source of the line (src/domain/survival.ts).
  const availabilityNote = availabilityNoteFor(card.firstSeenAt, now, job.closure);
  return <article className="job-card">
    <div className="job-top">
      <span className={`company-mark ${tint(card.company)}`} aria-hidden="true">{card.company.slice(0, 1)}</span>
      <div className="job-title-area">
        <p className="company">{card.company}</p>
        <h3><TrackedJobLink snapshotId={card.id} feed={feed} position={position}
          href={card.apply.url}>{card.title}</TrackedJobLink></h3>
      </div>
      <SaveButton snapshotId={card.id} variant="icon" />
    </div>
    <p className="salary money">{card.salaryOriginalText ?? "Зарплата не опубликована"}</p>
    <div className="job-facts">
      <span><Icon name="globe" />{geographyFact(job)}</span>
      {published && <span><Icon name="calendar" />Листинг от {published}</span>}
      {foundAge !== null && <span><Icon name="clock" />{foundAge}</span>}
    </div>
    {availabilityNote !== null && <p className="small secondary" style={{ marginTop: 4 }}>
      <Icon name="help-circle" size={16} /> {availabilityNote}
    </p>}
    <div className="job-bottom">
      <div>
        <span className={`badge ${tone === "match" ? "pass" : "review"}`}>
          <Icon name={tone === "match" ? "check" : "help-circle"} size={16} />
          {tone === "match" ? "Условия совпадают" : "Нужно уточнить"}
        </span>
        <p className="job-reason">{primary?.explanation ?? "Правила оценили вакансию по опубликованным условиям."}</p>
        <details>
          <summary>Основание</summary>
          <div className="evidence">
            <RulesList rules={job.evaluation.rules} />
            <p className="overline" style={{ marginTop: 8 }}>Требования вакансии</p>
            <RequirementsList requirements={job.requirements} />
          </div>
        </details>
      </div>
      <div className="stack" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn secondary" href={`/letters/new?job=${card.id}`}>Составить письмо</Link>
          <HideButton snapshotId={card.id} />
        </div>
        {score && <ScoreBadge score={score} />}
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
  // B23: the order arrives from the matching service, which ranks both tabs with
  // the shipped deterministic ranker. AI scores are reference only — scoring is
  // closed by the personal-data boundary until a local model serves it (AI-007 +
  // MODEL-001 measured), so no button offers what the boundary refuses.
  const input = profile?.input;
  const noCountry = lacksCountry(input);
  const hours = input?.availabilityWindows[0];
  const contract = (input?.employmentTypes ?? [])
    .map(type => EMPLOYMENT_LABELS[type] ?? type).join(", ");
  const contextInfo = [
    input?.residenceCountry || "Не задано",
    hours ? `${hours.start}–${hours.end}` : "Не задано",
    contract || "Не задано",
  ].join(" · ");
  const roles = (input?.targetRoles ?? []).join(", ");
  // The profile flag «Показывать вкладку „Нужно уточнить“» decides whether that
  // tab exists (B4): with it off, a review request renders the match tab and no
  // review link is offered anywhere on the page.
  const showReviewTab = input?.showNeedsReview ?? true;
  const activeTab = resolveFeedTab(tab, showReviewTab);
  const suppressedHere = activeTab === "review" ? result.seenSuppressed.needsReview : result.seenSuppressed.eligible;
  // One normalised list: the rendered slice is also what the impression report
  // describes, so the positions in the journal match what the candidate saw.
  const list: readonly { job: MatchedJob; score: RelevanceScore | null }[] = activeTab === "review"
    ? result.needsReview.slice(0, 50).map(job => ({ job, score: null }))
    : result.eligible.slice(0, 50).map(withScore);
  return <>
    <header className="page-head">
      <p className="overline">Подбор с основаниями</p>
      <h1>Вакансии для вас</h1>
      <p>Правила v{result.rulesetVersion} по опубликованным условиям; порядок выдаёт
        детерминированный ранкер, AI-рейтинг релевантности показывается справочно.</p>
    </header>
    {noCountry && <div className="banner review" style={{ marginBottom: 16 }}>
      <div>
        <p>{COUNTRY_MISSING_NOTICE}</p>
        <Link className="text-link" href="/profile">Указать страну в профиле</Link>
      </div>
    </div>}
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
          <Link href="/matched" aria-current={activeTab === "match" ? "page" : undefined}>
            Условия совпадают<span className="tabcount">{result.eligible.length}</span></Link>
          {showReviewTab && <Link href="/matched?tab=review" aria-current={activeTab === "review" ? "page" : undefined}>
            Нужно уточнить<span className="tabcount">{result.needsReview.length}</span></Link>}
        </nav>
        <div className="results-meta">
          <span>{activeTab === "match" ? result.eligible.length : result.needsReview.length} в выборке</span>
          <span>Порядок — детерминированный ранкер по условиям, роли и свежести</span>
        </div>
        {activeTab === "match" && <p className="small secondary" style={{ marginBottom: 16 }}>
          AI-оценки показываются справочно (сохранены с прошлых прогонов): новые не считаются —
          скоринг закрыт до локальной модели, персональные данные не покидают контур.
        </p>}
        {list.length === 0
          ? <div className="empty">
            {suppressedHere > 0
              ? <>
                <h2>Новых {activeTab === "match" ? "совпадений" : "уточнений"} нет</h2>
                <p>Вакансии, которые вы уже видели, не показываются заново — скрыто
                  {" "}{suppressedHere}. Они вернутся, если вакансия изменится, или через
                  {" "}{SEEN_TTL_DAYS} дней.</p>
                <Link className="btn tertiary" href={activeTab === "match" ? "/matched?tab=review" : "/matched"}>
                  {activeTab === "match" ? "Нужно уточнить" : "Условия совпадают"}</Link>
              </>
              : activeTab === "match" && noCountry
                ? <>
                  <h2>{EMPTY_MATCH_WITHOUT_COUNTRY.heading}</h2>
                  <p>{EMPTY_MATCH_WITHOUT_COUNTRY.body}</p>
                  <Link className="btn primary" href="/profile">Указать страну</Link>
                  {showReviewTab && <Link className="btn tertiary" href="/matched?tab=review">Нужно уточнить</Link>}
                </>
              : activeTab === "match"
                ? <>
                  <h2>Совпадений пока нет</h2>
                  <p>Правила не нашли полностью совместимых вакансий — это честный результат, а не ошибка.
                    {showReviewTab ? " Проверьте вкладку «Нужно уточнить»." : ""}</p>
                  {showReviewTab && <Link className="btn tertiary" href="/matched?tab=review">Нужно уточнить</Link>}
                </>
                : <>
                  <h2>Уточнений нет</h2>
                  <p>Все вакансии либо совпадают по опубликованным условиям, либо несовместимы и скрыты.</p>
                  <Link className="btn tertiary" href="/matched">Условия совпадают</Link>
                </>}
          </div>
          : <div className="job-list">
            {list.map(({ job, score }, index) =>
              <MatchedCard key={job.card.id} job={job} score={score}
                tone={activeTab === "review" ? "review" : "match"} now={now} feed={activeTab} position={index} />)}
          </div>}
        {list.length > 0 && suppressedHere > 0 && <p className="small secondary" style={{ marginTop: 8 }}>
          Скрыто как уже показанное: {suppressedHere} — вернутся, если вакансия изменится,
          или через {SEEN_TTL_DAYS} дней.
        </p>}
        <p className="small secondary" style={{ marginTop: 16 }}>
          Несовместимые вакансии скрыты; вне оценки (гейты remote/права/жизненный цикл):
          {" "}{result.notEvaluatedCount}.
        </p>
        <ImpressionReporter feed={activeTab}
          items={list.map(({ job }, index) => ({ snapshotId: job.card.id, position: index }))} />
      </section>
    </div>
  </>;
}
