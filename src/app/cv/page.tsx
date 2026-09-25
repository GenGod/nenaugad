import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { readConfig } from "../../server/config.ts";
import { listCvUploads } from "../../server/cv/service.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";
import { CvForm } from "../../components/cv-form.tsx";

export const metadata: Metadata = { title: "Резюме" };
export const dynamic = "force-dynamic";

export default async function Cv() {
  const user = await currentUser();
  if (!user) {
    return <section className="status-page">
      <p className="eyebrow">Резюме</p><h1>Доступно после входа</h1>
      <p className="hero-lead">Резюме — приватные данные: загрузка и просмотр только для владельца сессии.</p>
      <Link className="button primary" href="/login">Войти</Link>
    </section>;
  }
  const uploads = await listCvUploads(snapshotPool(), user.id);
  return <section className="status-page">
    <p className="eyebrow">Резюме / детерминированный приём</p><h1>Ваш текст — ваша проверка.</h1>
    <p className="hero-lead">Система ничего не выводит из резюме автоматически: вы читаете извлечённый текст
      и сами подтверждаете каждый факт в профиле. AI-извлечение не подключено.</p>
    <CvForm initialItems={[...uploads]} enabled={readConfig(process.env).uploads} />
    <p className="helper"><Link className="text-link" href="/profile">Перейти к заполнению профиля →</Link></p>
  </section>;
}
