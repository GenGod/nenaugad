import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { listSavedJobsWithApplied, listHiddenJobs } from "../../server/feedback-service.ts";
import { hideReasonLabel } from "../../domain/feedback.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import { SaveButton } from "../../components/save-button.tsx";
import { AppliedToggle, UnhideButton } from "../../components/feedback-buttons.tsx";
import { Icon } from "../../components/icon.tsx";
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
    return <section className="empty">
      <p className="overline">Сохранённое</p><h1>Доступно после входа</h1>
      <p>Сохранённые вакансии — личный список; он виден только владельцу сессии.</p>
      <Link className="btn primary" href="/login">Войти</Link>
    </section>;
  }
  const pool = snapshotPool();
  const rows = await listSavedJobsWithApplied(pool, user.id);
  const hidden = await listHiddenJobs(pool, user.id);
  return <>
    <header className="page-head">
      <p className="overline">Сохранённое / только ваше</p>
      <h1>Сохранённые вакансии</h1>
      <p>{rows.length === 0
        ? "Пока ничего не сохранено."
        : `Сохранено записей: ${rows.length}. Пометка отклика ставится только вручную — переход по ссылке её не создаёт.`}</p>
    </header>
    <section aria-label="Сохранённые вакансии">
      {rows.map(row => {
        if (!isJobSnapshot(row.snapshot)) return null;
        const policy = policyForSnapshotId(row.snapshotId);
        if (!policy) return null;
        const card = projectCard({
          sourceId: policy.source_id, snapshot: row.snapshot,
          contentHash: "", firstSeenAt: row.savedAt, fullPassMisses: 0,
        }, policy);
        const closed = row.snapshot.lifecycle === "closed";
        return <article key={row.snapshotId} className={`saved-row${closed ? " closed" : ""}`}>
          <div>
            <p className="small secondary">{card.company} · Источник: {policy.attribution.display_name}</p>
            <h3><a href={card.apply.url} rel="nofollow noreferrer" target="_blank">{card.title}</a></h3>
            {row.excerpt && <p className="small secondary" style={{ marginTop: 4 }}>{row.excerpt}</p>}
            <p className="small secondary" style={{ marginTop: 4 }}>
              {card.salaryOriginalText ?? "Зарплата не опубликована"} · сохранено {row.savedAt.slice(0, 10)}
            </p>
            {closed && <span className="badge review" style={{ marginTop: 8 }}>
              <Icon name="info" size={16} />Закрыта (источник)</span>}
          </div>
          <div className="saved-status">
            <span className="saved-label">Личный статус</span>
            <AppliedToggle snapshotId={row.snapshotId} markedAppliedAt={row.markedAppliedAt} />
          </div>
          <div className="remove-save">
            <SaveButton snapshotId={row.snapshotId} initiallySaved variant="icon" />
          </div>
        </article>;
      })}
      {rows.length === 0 && <div className="empty">
        <h2>Список пуст</h2>
        <p>Сохраняйте вакансии закладкой в подборе или каталоге — список останется приватным.</p>
        <Link className="btn tertiary" href="/matched">К подбору</Link>
      </div>}
    </section>
    {hidden.length > 0 && <>
      <div className="section-head">
        <h3>Скрытые</h3>
        <span className="small secondary">Исключены из подбора с указанной причиной</span>
      </div>
      <section aria-label="Скрытые вакансии" className="job-list">
        {hidden.map(row => {
          const snapshot = isJobSnapshot(row.snapshot) ? row.snapshot : null;
          const policy = policyForSnapshotId(row.snapshotId);
          return <article key={row.snapshotId} className="job-card">
            <div className="job-top">
              <span className="company-mark" aria-hidden="true">?</span>
              <div className="job-title-area">
                <p className="company">{snapshot?.company_name ?? row.snapshotId}</p>
                <h3>{snapshot?.title ?? "Вакансия недоступна"}</h3>
              </div>
              <span className="badge review">Скрыто: {hideReasonLabel(row.reasonCode)}</span>
            </div>
            {row.excerpt && <p className="job-reason">{row.excerpt}</p>}
            <div className="job-bottom">
              <span className="small secondary">Скрыто {row.createdAt.slice(0, 10)}</span>
              <div className="row" style={{ gap: 8 }}>
                {snapshot && policy && <a className="btn tertiary" href={snapshot.source_url}
                  rel="nofollow noreferrer" target="_blank">Открыть источник</a>}
                <UnhideButton snapshotId={row.snapshotId} />
              </div>
            </div>
          </article>;
        })}
      </section>
    </>}
    <div className="row" style={{ marginTop: 24 }}>
      <Link className="btn primary" href="/matched">К подбору</Link>
    </div>
  </>;
}
