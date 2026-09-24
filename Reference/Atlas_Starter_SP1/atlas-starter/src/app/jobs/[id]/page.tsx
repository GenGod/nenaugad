import Link from "next/link";
import { notFound } from "next/navigation";
import { readJob } from "../../../server/catalog-service.ts";
export const dynamic = "force-dynamic";

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) notFound();
  return <>
    <Link className="back-link" href="/jobs">← К демо-каталогу</Link>
    <header className="detail-heading">
      <p className="eyebrow">{job.company} / {job.team}</p>
      <h1>{job.title}</h1>
      <p className="salary">{job.salaryLabel}</p>
      <p className="source-line">Источник: Atlas Fixtures · Синтетическая запись от {job.publishedDate}</p>
    </header>
    <div className="detail-layout">
      <div>
        <section className="panel">
          <p className="eyebrow">Факты отдельно от рекомендаций</p>
          <h2>Карта условий</h2>
          <p className="helper">Профиль не задан: персональная совместимость не оценена.</p>
          <dl className="condition-map">
            <div><dt>Формат работы</dt><dd>Постоянная полная удалёнка</dd></div>
            <div><dt>Страны найма</dt><dd>{job.geographyLabel}{!job.geographyKnown && <span className="badge review">Нужно уточнить у работодателя</span>}</dd></div>
            <div><dt>Форма сотрудничества</dt><dd>{job.contractLabel}</dd></div>
            <div><dt>Рабочие часы</dt><dd>Не опубликованы</dd></div>
          </dl>
          <details><summary>Основание по удалённому формату</summary>
            <blockquote>{job.remote.evidence}</blockquote>
            <p className="source-line">Синтетическая запись · версия {job.contentVersion}. Не реальная проверка работодателя.</p>
          </details>
        </section>
        <section className="reading-section"><h2>Описание примера</h2><p>{job.description}</p>
          <div className="chips">{job.skills.map(skill => <span className="chip" key={skill}>{skill}</span>)}</div>
        </section>
      </div>
      <aside className="panel action-panel">
        <h2>Следующий шаг</h2>
        <p>Это вымышленная вакансия. В шаблоне нет внешнего отклика, загрузки резюме и генерации письма.</p>
        <button className="button primary" type="button" disabled aria-describedby="apply-helper">Перейти к отклику</button>
        <p id="apply-helper" className="helper">Действие недоступно для синтетических данных.</p>
        <Link className="text-link" href="/status">Что предстоит подключить →</Link>
      </aside>
    </div>
  </>;
}
