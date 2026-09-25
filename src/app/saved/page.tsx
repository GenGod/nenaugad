import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { listSavedJobsWithApplied } from "../../server/feedback-service.ts";
import { listHiddenJobs } from "../../server/feedback-service.ts";
import { hideReasonLabel } from "../../domain/feedback.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import { SaveButton } from "../../components/save-button.tsx";
import { AppliedToggle, UnhideButton } from "../../components/feedback-buttons.tsx";
import { isJobSnapshot } from "../../domain/source-contracts.ts";
import { projectCard } from "../../domain/snapshot-projection.ts";
import { getSourcePolicy } from "../../server/source-policies.ts";

export const metadata: Metadata = { title: "Сохранённое" };
export const dynamic = "force-dynamic";

function policyForSnapshotId(snapshotId: string) {
  const separator = snapshotId.indexOf(":");
  return getSourcePolicy(separator === -1 ? snapshotId : snapshotId.slice(0, separator));
}

export default async function Saved() {
  const user = await currentUser();
  if (!user) {
    return <section className="status-page">
      <p className="eyebrow">Сохранённое</p><h1>Доступно после входа</h1>
      <Link className="button primary" href="/login">Войти</Link>
    </section>;
  }
  const pool = snapshotPool();
  const rows = await listSavedJobsWithApplied(pool, user.id);
  const hidden = await listHiddenJobs(pool, user.id);
  return <section className="status-page">
    <p className="eyebrow">Сохранённое / только ваше</p><h1>Сохранённые вакансии.</h1>
    <p className="hero-lead">{rows.length === 0
      ? "Пока ничего не сохранено."
      : `Сохранено записей: ${rows.length}. Пометка отклика ставится только вручную — переход по ссылке её не создаёт.`}</p>
    <div className="results">
      {rows.map(row => {
        if (!isJobSnapshot(row.snapshot)) return null;
        const policy = policyForSnapshotId(row.snapshotId);
        if (!policy) return null;
        const card = projectCard({
          sourceId: policy.source_id, snapshot: row.snapshot,
          contentHash: "", firstSeenAt: row.savedAt, fullPassMisses: 0,
        }, policy);
        return <article key={row.snapshotId} className="job-card">
          <div className="card-top">
            <div className="company-monogram" aria-hidden="true">{card.company.slice(0, 1)}</div>
            <div className="card-heading">
              <p className="company">{card.company}</p>
              <h2><a href={card.apply.url} rel="nofollow noreferrer" target="_blank">{card.title}</a></h2>
            </div>
            <span className="badge neutral">{card.salaryOriginalText ?? "Зарплата не указана"}</span>
            {row.snapshot.lifecycle === "closed" &&
              <span className="badge review">Закрыта (источник)</span>}
          </div>
          {row.excerpt && <p className="conditions">{row.excerpt}</p>}
          <div className="card-bottom">
            <span className="helper">Сохранено {row.savedAt.slice(0, 10)}</span>
            <AppliedToggle snapshotId={row.snapshotId} markedAppliedAt={row.markedAppliedAt} />
            <SaveButton snapshotId={row.snapshotId} initiallySaved />
          </div>
        </article>;
      })}
    </div>
    {hidden.length > 0 && <>
      <div className="result-header"><h2>Скрытые</h2>
        <span className="muted">Исключены из подбора с указанной причиной</span></div>
      <div className="results">
        {hidden.map(row => {
          const snapshot = isJobSnapshot(row.snapshot) ? row.snapshot : null;
          const policy = policyForSnapshotId(row.snapshotId);
          return <article key={row.snapshotId} className="job-card">
            <div className="card-top">
              <div className="company-monogram" aria-hidden="true">?</div>
              <div className="card-heading">
                <p className="company">{snapshot?.company_name ?? row.snapshotId}</p>
                <h2>{snapshot?.title ?? "Вакансия недоступна"}</h2>
              </div>
              <span className="badge review">Скрыто: {hideReasonLabel(row.reasonCode)}</span>
            </div>
            {row.excerpt && <p className="conditions">{row.excerpt}</p>}
            <div className="card-bottom">
              <span className="helper">Скрыто {row.createdAt.slice(0, 10)}</span>
              {snapshot && policy && <a className="text-link" href={snapshot.source_url}
                rel="nofollow noreferrer" target="_blank">Открыть источник ↗</a>}
              <UnhideButton snapshotId={row.snapshotId} />
            </div>
          </article>;
        })}
      </div>
    </>}
    <Link className="button primary" href="/matched">К подбору</Link>
  </section>;
}
