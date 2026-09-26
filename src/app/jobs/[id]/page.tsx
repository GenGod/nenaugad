import Link from "next/link";
import { notFound } from "next/navigation";
import { readJob } from "../../../server/catalog-service.ts";
import { Icon } from "../../../components/icon.tsx";
export const dynamic = "force-dynamic";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) notFound();
  return <>
    <Link className="back-link" href="/jobs"><Icon name="arrow-left" size={16} />К демо-каталогу</Link>
    <header className="detail-head">
      <p className="overline">{job.company} / {job.team}</p>
      <h1>{job.title}</h1>
      <p className="salary money">{job.salaryLabel}</p>
      <p className="source"><Icon name="source" size={16} />
        Источник: Nenaugad Fixtures · синтетическая запись от {job.publishedDate}</p>
    </header>
    <div className="detail-layout">
      <div>
        <section aria-label="Карта условий">
          <h2>Карта условий</h2>
          <p className="small secondary" style={{ marginTop: 8 }}>
            Профиль не задан: персональная совместимость не оценена.</p>
          <div className="conditions">
            <div className="condition-row">
              <div className="condition-top">
                <span className="condition-icon" aria-hidden="true"><Icon name="check" size={16} /></span>
                <div>
                  <strong>Формат работы</strong>
                  <p>Постоянная полная удалёнка; обязательное присутствие не заявлено.</p>
                </div>
              </div>
              <details><summary>Основание по удалённому формату</summary>
                <figure className="evidence">
                  <blockquote>{job.remote.evidence}</blockquote>
                  <figcaption className="figcaption">Синтетическая запись · версия {job.contentVersion}.
                    Не реальная проверка работодателя.</figcaption>
                </figure>
              </details>
            </div>
            <div className="condition-row">
              <div className="condition-top">
                <span className={`condition-icon ${job.geographyKnown ? "" : "review"}`} aria-hidden="true">
                  <Icon name={job.geographyKnown ? "check" : "help-circle"} size={16} />
                </span>
                <div>
                  <strong>Страны найма</strong>
                  <p>{job.geographyLabel}</p>
                  {!job.geographyKnown &&
                    <span className="badge review"><Icon name="help-circle" size={16} />
                      Нужно уточнить у работодателя</span>}
                </div>
              </div>
            </div>
            <div className="condition-row">
              <div className="condition-top">
                <span className="condition-icon neutral" aria-hidden="true"><Icon name="contract" size={16} /></span>
                <div>
                  <strong>Форма сотрудничества</strong>
                  <p>{job.contractLabel}</p>
                </div>
              </div>
            </div>
            <div className="condition-row">
              <div className="condition-top">
                <span className="condition-icon neutral" aria-hidden="true"><Icon name="clock" size={16} /></span>
                <div>
                  <strong>Рабочие часы</strong>
                  <p>Не опубликованы — сравнение расписаний появится после подтверждения профиля.</p>
                </div>
              </div>
            </div>
            <div className="condition-row">
              <div className="condition-top">
                <span className="condition-icon neutral" aria-hidden="true"><Icon name="salary" size={16} /></span>
                <div>
                  <strong>Компенсация</strong>
                  <p className="money">{job.salaryLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="prose" style={{ marginTop: 32 }}>
          <h2>Описание примера</h2>
          <p>{job.description}</p>
          <div className="job-chips">
            {job.skills.map(skill => <span className="chip" key={skill}>{skill}</span>)}
          </div>
        </section>
      </div>
      <aside className="detail-aside">
        <div className="aside-card action-card">
          <h3>Следующий шаг</h3>
          <p className="small secondary">Это вымышленная вакансия. В шаблоне нет внешнего отклика,
            загрузки резюме и генерации письма.</p>
          <button className="btn primary wide" type="button" disabled aria-describedby="apply-helper">
            Перейти к отклику</button>
          <p id="apply-helper" className="small secondary">Действие недоступно для синтетических данных.</p>
          <Link className="back-link" href="/status">Что предстоит подключить →</Link>
        </div>
        <div className="aside-card">
          <h3>Источник и свежесть</h3>
          <p className="small secondary">Nenaugad Fixtures · синтетический каталог.
            Запись добавлена {job.publishedDate}; жизненный цикл: {job.lifecycle === "active"
            ? "актуальная" : job.lifecycle === "stale" ? "давно не подтверждалась" : "закрыта"}.</p>
        </div>
      </aside>
    </div>
    <div className="mobile-apply">
      <button className="btn primary" type="button" disabled>Перейти к отклику</button>
    </div>
  </>;
}
