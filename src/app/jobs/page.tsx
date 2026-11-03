import type { Metadata } from "next";
import Link from "next/link";
import { parseCatalogQuery } from "../../domain/job.ts";
import { readCatalog } from "../../server/catalog-service.ts";
import { readSnapshotCards } from "../../server/snapshot-catalog-service.ts";
import { EXTERNAL_PAGE_SIZE, newestFirst, pageOf, parsePageParam } from "../../domain/catalog-page.ts";
import { searchCards } from "../../domain/catalog-search.ts";
import { JobCard } from "../../components/job-card.tsx";
import { SnapshotCard } from "../../components/snapshot-card.tsx";
import { Icon } from "../../components/icon.tsx";

export const metadata: Metadata = { title: "Вакансии" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
export default async function Jobs({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (value !== undefined) params.set(key, value);
  }
  let query: ReturnType<typeof parseCatalogQuery>;
  let page: number;
  try {
    // `page` pages the external section only (PERF-002); the catalog query, shared with
    // /api/v1/jobs, never sees it.
    page = parsePageParam(params);
    params.delete("page");
    query = parseCatalogQuery(params);
  } catch {
    return <section className="empty"><h1>Проверьте параметры поиска</h1>
      <p>Запрос — до 100 символов; параметры не должны повторяться.</p>
      <Link className="btn primary" href="/jobs">Сбросить поиск</Link></section>;
  }
  let result: Awaited<ReturnType<typeof readCatalog>>;
  try { result = await readCatalog(query); } catch {
    return <section className="empty"><h1>Каталог временно недоступен</h1>
      <p>Проверьте подключение к локальной базе, миграцию и seed. Демо-данные не подставляются вместо ошибки.</p>
      <Link className="btn secondary" href="/jobs">Повторить чтение</Link></section>;
  }
  // External source section: renders nothing while the source policy is
  // disabled; a storage failure degrades visibly without faking emptiness.
  const snapshots = await readSnapshotCards();
  // PERF-002: 24 cards a page, newest first — rendering all 3.5k took 26–35 s.
  // B60: the query filters the cards first, by the text each card shows.
  const external = pageOf(newestFirst(searchCards(snapshots.cards, query.q)), page, EXTERNAL_PAGE_SIZE);
  const pageHref = (target: number): string => {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    if (target > 1) next.set("page", String(target));
    const search = next.toString();
    return `/jobs${search ? `?${search}` : ""}#external`;
  };
  // One reference time for the whole render: age labels stay consistent with
  // each other and the page does not depend on how long it took to load.
  const now = new Date().toISOString();
  return <>
    <header className="page-head">
      <p className="overline">Открытый каталог / демо</p>
      <h1>Все вакансии</h1>
      <p>Полностью удалённые роли. Страны найма и неизвестные условия — сразу на карточке.</p>
    </header>
    <div className="mode-switch">
      <Link href="/matched">Для вас</Link>
      <Link href="/jobs" aria-current="page">Все вакансии</Link>
    </div>
    <form action="/jobs" method="get" className="search-row" aria-label="Поиск по каталогу">
      <div className="search-control">
        <Icon name="search" />
        <input id="q" name="q" type="search" maxLength={100} defaultValue={query.q}
          placeholder="Роль, компания или навык" aria-label="Роль, компания или навык" />
      </div>
      <button type="submit" className="btn primary">Найти</button>
      {query.q && <Link className="btn tertiary" href="/jobs">Сбросить</Link>}
    </form>
    <section aria-label="Список вакансий">
      <div className="results-meta">
        <span>{result.total} в демо-выборке</span>
        <span>Сначала новые</span>
      </div>
      {result.items.length === 0 ? <div className="empty">
        <h2>По этому запросу примеров нет</h2>
        <p>Попробуйте React, SQL или Designer. Страны и удалённый формат не изменяются автоматически.</p>
        <Link className="btn tertiary" href="/jobs">Показать весь демо-каталог</Link>
      </div> : <div className="job-list">
        {result.items.map(job => <JobCard key={job.id} job={job} />)}
      </div>}
      {snapshots.cards.length > 0 && <div id="external">
        <div className="section-head">
          <h3>Внешние источники</h3>
          {external.total > 0 && <span className="small secondary">
            {query.q ? <>По запросу «{query.q}» показаны</> : "Показаны"} {external.from}–{external.to} из {external.total} ·
            сначала новые · фрагменты с атрибуцией, без оценки совместимости</span>}
        </div>
        {query.q && <p className="small secondary" style={{ marginTop: -8, marginBottom: 12 }}>
          Поиск идёт по названию, компании и показанному фрагменту; полный текст вакансии — на источнике.</p>}
        {external.total === 0 ? <div className="empty">
          <h2>Во внешних источниках по этому запросу ничего нет</h2>
          <p>Попробуйте другое слово или более короткое: «design» найдёт и «Designer».</p>
          <Link className="btn tertiary" href="/jobs#external">Показать все внешние вакансии</Link>
        </div> : <div className="job-list">
          {external.items.map(card => <SnapshotCard key={card.id} card={card} now={now} />)}
        </div>}
        {external.pageCount > 1 && <nav className="pager" aria-label="Страницы внешних источников">
          {external.page > 1
            ? <Link href={pageHref(external.page - 1)} rel="prev">← Новее</Link>
            : <span />}
          <span className="mono">Страница {external.page} из {external.pageCount}</span>
          {external.page < external.pageCount
            ? <Link href={pageHref(external.page + 1)} rel="next">Старее →</Link>
            : <span />}
        </nav>}
      </div>}
      {snapshots.unavailable && <div className="empty">
        <h2>Раздел Himalayas временно недоступен</h2>
        <p>Локальная база снапшотов не ответила. Основной каталог выше не подменён этим состоянием.</p>
      </div>}
    </section>
  </>;
}
