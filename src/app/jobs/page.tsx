import type { Metadata } from "next";
import Link from "next/link";
import { parseCatalogQuery } from "../../domain/job.ts";
import { readCatalog } from "../../server/catalog-service.ts";
import { readSnapshotCards } from "../../server/snapshot-catalog-service.ts";
import { JobCard } from "../../components/job-card.tsx";
import { SnapshotCard } from "../../components/snapshot-card.tsx";

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
  let query;
  try { query = parseCatalogQuery(params); } catch {
    return <section className="empty-state"><h1>Проверьте параметры поиска</h1>
      <p>Запрос — до 100 символов; параметры не должны повторяться.</p>
      <Link className="button primary" href="/jobs">Сбросить поиск</Link></section>;
  }
  let result;
  try { result = await readCatalog(query); } catch {
    return <section className="empty-state"><h1>Каталог временно недоступен</h1>
      <p>Проверьте подключение к локальной базе, миграцию и seed. Демо-данные не подставляются вместо ошибки.</p>
      <Link className="button secondary" href="/jobs">Повторить чтение</Link></section>;
  }
  // External source section: renders nothing while the source policy is
  // disabled; a storage failure degrades visibly without faking emptiness.
  const snapshots = await readSnapshotCards();
  return <>
    <section className="page-heading">
      <div><p className="eyebrow">Открытый каталог / демо</p><h1>Возможности уже здесь.</h1>
        <p>Полностью удалённые роли. Страны найма и неизвестные условия — сразу на карточке.</p></div>
      <span className="catalog-count">{result.total} примера в подборке</span>
    </section>
    <div className="catalog-layout">
      <aside className="sidebar">
        <p className="eyebrow">Контекст просмотра</p>
        <h2>Сначала условия</h2>
        <p>Это открытый каталог, а не персональная рекомендация.</p>
        <div className="context-field"><span>Формат</span><strong>Только полная удалёнка</strong></div>
        <div className="context-field"><span>Профиль</span><strong>Не подключён</strong></div>
        <div className="context-field"><span>Источники</span><strong>Синтетические фикстуры</strong></div>
        <p className="helper">Гибридные, закрытые и противоречивые примеры исключены правилами.</p>
        <Link className="text-link" href="/status">Следующий шаг разработки →</Link>
      </aside>
      <section aria-label="Список вакансий" className="results">
        <form action="/jobs" method="get" className="search-form">
          <label htmlFor="q">Роль, компания или навык</label>
          <div className="search-controls"><input id="q" name="q" type="search" maxLength={100}
            defaultValue={query.q} placeholder="Например, React или дизайнер" />
            <button type="submit" className="button primary">Найти</button></div>
          {query.q && <Link className="text-link reset-link" href="/jobs">Сбросить запрос</Link>}
        </form>
        <div className="result-header"><h2>Все вакансии</h2><span className="muted">Без оценки совместимости</span></div>
        {result.items.length === 0 ? <div className="empty-state">
          <h2>По этому запросу примеров нет</h2>
          <p>Попробуйте React, SQL или Designer. Страны и удалённый формат не изменяются автоматически.</p>
          <Link className="text-link" href="/jobs">Показать весь демо-каталог</Link>
        </div> : result.items.map(job => <JobCard key={job.id} job={job} />)}
        {snapshots.cards.length > 0 && <>
          <div className="result-header">
            <h2>Внешние источники</h2>
            <span className="muted">Фрагменты с атрибуцией · без оценки совместимости</span>
          </div>
          {snapshots.cards.map(card => <SnapshotCard key={card.id} card={card} />)}
        </>}
        {snapshots.unavailable && <div className="empty-state">
          <h2>Раздел Himalayas временно недоступен</h2>
          <p>Локальная база снапшотов не ответила. Основной каталог выше не подменён этим состоянием.</p>
        </div>}
      </section>
    </div>
  </>;
}
