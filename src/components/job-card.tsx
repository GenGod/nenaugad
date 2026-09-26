import Link from "next/link";
import type { StarterJob } from "../domain/job.ts";
import { Icon } from "./icon.tsx";

const TINTS = ["fern", "river", "pearl"] as const;
export function tint(seed: string): (typeof TINTS)[number] {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 997;
  return TINTS[hash % TINTS.length]!;
}

export function JobCard({ job }: { job: StarterJob }) {
  return <article className="job-card">
    <div className="job-top">
      <span className={`company-mark ${tint(job.company)}`} aria-hidden="true">{job.company.slice(0, 1)}</span>
      <div className="job-title-area">
        <p className="company">{job.company} · {job.team}</p>
        <h2><Link href={`/jobs/${job.id}`}>{job.title}</Link></h2>
      </div>
    </div>
    <p className="salary money">{job.salaryLabel}</p>
    <div className="job-facts">
      <span><Icon name="globe" />{job.geographyLabel}</span>
      <span><Icon name="contract" />{job.contractLabel}</span>
    </div>
    <div className="job-bottom">
      <div>
        <span className={`badge ${job.geographyKnown ? "neutral" : "review"}`}>
          <Icon name={job.geographyKnown ? "check" : "help-circle"} size={16} />
          {job.geographyKnown ? "Полная удалёнка указана" : "Страны найма нужно уточнить"}
        </span>
        <p className="job-reason">Открытый каталог: совпадение с профилем не оценивалось.</p>
      </div>
      <div className="job-chips">
        {job.skills.slice(0, 3).map(skill => <span key={skill} className="chip">{skill}</span>)}
      </div>
    </div>
    <p className="source"><Icon name="source" size={16} />
      Источник: Nenaugad Fixtures · синтетическая запись от {job.publishedDate}</p>
  </article>;
}
