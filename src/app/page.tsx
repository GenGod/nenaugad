import Link from "next/link";
import { parseCatalogQuery, type StarterJob } from "../domain/job.ts";
import { readCatalog } from "../server/catalog-service.ts";
import { JobCard } from "../components/job-card.tsx";
import { Icon } from "../components/icon.tsx";

// Signal home (DS-002d): the search and real catalog rows, and how to read the three
// outcomes. No floating example card, no icon strip.
export const dynamic = "force-dynamic";

async function latestJobs(): Promise<readonly StarterJob[] | null> {
  try {
    return (await readCatalog(parseCatalogQuery(new URLSearchParams()))).items.slice(0, 3);
  } catch {
    // The catalog's own page reports the failure; here the rows are simply absent,
    // never replaced by invented ones.
    return null;
  }
}

export default async function Home() {
  const latest = await latestJobs();
  return <>
    <section className="hero" aria-labelledby="home-title">
      <p className="overline">Подбор с основаниями</p>
      <h1 id="home-title">Выбирать работу.<br /><em>Не наугад.</em></h1>
      <p className="lead">Удалённая работа с понятными условиями: страна найма, рабочие часы
        и обязательные требования стоят рядом с каждым выводом, а неизвестное не выдаётся
        за совпадение.</p>
      <form action="/jobs" method="get" className="search-row home-search" aria-label="Поиск по каталогу">
        <div className="search-control">
          <Icon name="search" />
          <input name="q" type="search" maxLength={100}
            placeholder="Роль, компания или навык" aria-label="Роль, компания или навык" />
        </div>
        <button type="submit" className="btn primary large">Найти</button>
      </form>
      <div className="actions">
        <Link className="btn secondary large" href="/profile">Подобрать по резюме</Link>
        <Link className="btn tertiary large" href="/jobs">Смотреть вакансии</Link>
      </div>
      <p className="privacy"><Icon name="lock" size={16} />
        Вы подтвердите профиль перед подбором. Резюме не отправляется работодателям
        автоматически.</p>
    </section>

    <section className="home-latest" aria-labelledby="latest-title">
      <div className="section-head">
        <h2 id="latest-title">Свежее в демо-каталоге</h2>
        <Link href="/jobs">Все вакансии →</Link>
      </div>
      {latest === null
        ? <p className="small secondary">Каталог сейчас не отвечает: <Link href="/jobs">откройте его</Link>,
          там будет причина.</p>
        : <div className="job-list">{latest.map(job => <JobCard key={job.id} job={job} />)}</div>}
    </section>

    <section className="home-legend" aria-labelledby="legend-title">
      <h2 id="legend-title">Как читать условия</h2>
      <ul>
        <li className="signal-cell pass">
          <span className="signal-mark"><Icon name="check" size={14} /></span>
          <p><strong>Подходит.</strong> Условие опубликовано и совпадает с вашим подтверждённым
            профилем.</p>
        </li>
        <li className="signal-cell unknown">
          <span className="signal-mark"><Icon name="help-circle" size={14} /></span>
          <p><strong>Нужно уточнить.</strong> Источник молчит или говорит неоднозначно. Это вопрос
            работодателю, а не отказ.</p>
        </li>
        <li className="signal-cell fail">
          <span className="signal-mark"><Icon name="close" size={14} /></span>
          <p><strong>Не подходит.</strong> Опубликованное условие расходится с вашим профилем.</p>
        </li>
      </ul>
      <p className="small secondary">Процента совпадения нет. Полная удалёнка не означает, что
        нанимают из любой страны, а откликаетесь вы сами — на сайте работодателя.</p>
    </section>
  </>;
}
