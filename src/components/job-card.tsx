import Link from "next/link";
import type { StarterJob } from "../domain/job.ts";

export function JobCard({ job }: { job: StarterJob }) {
  return <article className="job-card">
    <div className="card-top">
      <div className="company-monogram" aria-hidden="true">{job.company.slice(0, 1)}</div>
      <div className="card-heading">
        <p className="company">{job.company}<span className="muted"> · {job.team}</span></p>
        <h2><Link href={`/jobs/${job.id}`}>{job.title}</Link></h2>
      </div>
      <span className="badge neutral">Пример</span>
    </div>
    <p className="salary">{job.salaryLabel}</p>
    <p className="conditions">{job.geographyLabel} <span aria-hidden="true">·</span> {job.contractLabel}</p>
    <div className="chips">{job.skills.slice(0, 3).map(skill => <span key={skill} className="chip">{skill}</span>)}</div>
    <div className="card-bottom">
      <span className={`badge ${job.geographyKnown ? "neutral" : "review"}`}>
        {job.geographyKnown ? "Полная удалёнка указана" : "Страны найма нужно уточнить"}
      </span>
      <Link className="text-link" href={`/jobs/${job.id}`}>Подробнее <span aria-hidden="true">↗</span></Link>
    </div>
    <p className="source-line">Источник: Atlas Fixtures · Синтетическая запись от {job.publishedDate}</p>
  </article>;
}
