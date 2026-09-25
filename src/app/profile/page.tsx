import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { LogoutButton } from "../../components/auth-forms.tsx";
import { ProfileForm, type ProfileState } from "../../components/profile-form.tsx";
import { countProfileVersions, latestProfile } from "../../server/profile-service.ts";
import { snapshotPool } from "../../server/storage/snapshots.ts";

export const metadata: Metadata = { title: "Профиль" };
export const dynamic = "force-dynamic";

export default async function Profile() {
  const user = await currentUser();
  if (!user) {
    return <section className="status-page">
      <p className="eyebrow">Профиль</p><h1>Сначала вход</h1>
      <p className="hero-lead">Профиль, подбор и сохранённое доступны после входа.</p>
      <Link className="button primary" href="/login">Войти или зарегистрироваться</Link>
    </section>;
  }
  const pool = snapshotPool();
  const profile = await latestProfile(pool, user.id);
  const versions = await countProfileVersions(pool, user.id);
  const initial: ProfileState | null = profile ? {
    residenceCountry: profile.input.residenceCountry ?? "",
    timezone: profile.input.timezone ?? "",
    targetRoles: profile.input.targetRoles.join(", "),
    skills: profile.input.skills.join(", "),
    employmentTypes: [...profile.input.employmentTypes],
    windowStart: profile.input.availabilityWindows[0]?.start ?? "09:00",
    windowEnd: profile.input.availabilityWindows[0]?.end ?? "18:00",
    weekdays: [...(profile.input.availabilityWindows[0]?.weekdays ?? [1, 2, 3, 4, 5])],
    zeroMandatoryAttendance: profile.input.zeroMandatoryAttendance,
    salaryAmount: profile.input.minimumCompensation?.amount ?? "",
    salaryCurrency: profile.input.minimumCompensation?.currency ?? "USD",
    salaryHard: profile.input.minimumCompensation?.hard ?? true,
    showNeedsReview: profile.input.showNeedsReview,
  } : null;
  return <section className="status-page">
    <p className="eyebrow">Профиль / ручной ввод</p><h1>Условия вашей работы.</h1>
    <p className="hero-lead">
      {profile
        ? `Текущая версия: ${profile.version} (сохранено версий: ${versions}). Изменение создаёт новую версию.`
        : "Профиль ещё не создан — заполните условия; всё проверяется вашими руками, ничего не выводится из резюме."}
    </p>
    <div className="panel"><ProfileForm initial={initial} version={profile?.version ?? null} /></div>
    <div className="search-controls" style={{ marginTop: 16 }}>
      <Link className="button primary" href="/matched">Открыть подбор</Link>
      <Link className="button secondary compact" href="/cv">Резюме (текст)</Link>
      <Link className="button secondary compact" href="/letters/new?mode=general">Общее письмо</Link>
      <LogoutButton />
    </div>
    <p className="helper">Права на работу и гражданство не запрашиваются: профиль оценивает только опубликованные условия.</p>
  </section>;
}
