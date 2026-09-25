import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../../../server/auth.ts";
import { getOrCreateLetter } from "../../../server/letters/service.ts";
import { snapshotPool } from "../../../server/storage/snapshots.ts";

export const metadata: Metadata = { title: "Новое письмо" };
export const dynamic = "force-dynamic";

// Entry point from /matched: creates (or reuses) a letter for the job and
// redirects to the editor.
export default async function NewLetter({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const raw = await searchParams;
  const jobId = typeof raw.job === "string" ? raw.job : "";
  if (!jobId) {
    return <section className="status-page">
      <p className="eyebrow">Письмо</p><h1>Не указана вакансия</h1>
      <Link className="button primary" href="/matched">К подбору</Link>
    </section>;
  }
  try {
    const letter = await getOrCreateLetter({
      pool: snapshotPool(), userId: user.id, jobSnapshotId: jobId,
    });
    redirect(`/letters/${letter.id}`);
  } catch {
    return <section className="status-page">
      <p className="eyebrow">Письмо</p><h1>Вакансия недоступна</h1>
      <p className="hero-lead">Вакансия могла быть удалена источником.</p>
      <Link className="button primary" href="/matched">К подбору</Link>
    </section>;
  }
}
