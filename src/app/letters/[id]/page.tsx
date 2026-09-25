import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "../../../server/auth.ts";
import { getLetterDetail } from "../../../server/letters/service.ts";
import { snapshotPool, readSnapshotCardsData } from "../../../server/storage/snapshots.ts";
import { isJobSnapshot } from "../../../domain/source-contracts.ts";
import { LetterEditor } from "../../../components/letter-editor.tsx";

export const metadata: Metadata = { title: "Сопроводительное письмо" };
export const dynamic = "force-dynamic";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) {
    return <section className="status-page">
      <p className="eyebrow">Письмо</p><h1>Доступно после входа</h1>
      <Link className="button primary" href="/login">Войти</Link>
    </section>;
  }
  const { id } = await params;
  const detail = await getLetterDetail({
    pool: snapshotPool(), userId: user.id, letterId: id,
  });
  if (!detail) notFound();

  // Fetch the job snapshot for context display.
  const isGeneral = detail.summary.mode === "general";
  const sourceId = isGeneral ? "" : (detail.summary.jobSnapshotId ?? "").split(":")[0] ?? "";
  const rows = sourceId ? await readSnapshotCardsData(snapshotPool(), sourceId) : [];
  const snapshotRow = rows.find(row => row.stored.snapshot.id === detail.summary.jobSnapshotId);
  const job = snapshotRow && isJobSnapshot(snapshotRow.stored.snapshot)
    ? snapshotRow.stored.snapshot : null;

  return <section className="status-page">
    <p className="eyebrow">Письмо / приватное</p>
    <h1>Сопроводительное письмо</h1>
    <p className="hero-lead">
      {isGeneral
        ? <span className="badge review">Общий черновик — адаптируйте под вакансию</span>
        : job ? `${job.title} · ${job.company_name}` : "Вакансия недоступна"}
      {" · "}версия профиля активна
    </p>
    <div className="panel">
      <LetterEditor
        letterId={detail.summary.id}
        initialRevision={detail.current ? {
          id: detail.current.id, version: detail.current.version,
          body: detail.current.body, origin: detail.current.origin,
          modelId: detail.current.modelId, createdAt: detail.current.createdAt,
        } : null}
        initialVersions={detail.revisions.map(rev => ({
          id: rev.id, version: rev.version, body: rev.body,
          origin: rev.origin, modelId: rev.modelId, createdAt: rev.createdAt,
        }))}
      />
    </div>
    <p className="helper">
      <Link className="text-link" href="/matched">← К подбору</Link>
      {" · "}Данные обрабатываются через OpenAI GPT-6 Luna; текст не публикуется.
    </p>
  </section>;
}
