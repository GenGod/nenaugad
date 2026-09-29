import type { Metadata } from "next";
import Link from "next/link";
import { currentUser } from "../../server/auth.ts";
import { digestForUser, type DigestItem } from "../../server/digest-service.ts";
import { lastFeedViewLabel } from "../../domain/digest.ts";
import { SEEN_TTL_DAYS } from "../../domain/seen-set.ts";
import { Icon } from "../../components/icon.tsx";

export const metadata: Metadata = { title: "Что нового" };
export const dynamic = "force-dynamic";

// In-app digest (item A7). Deliberately not an email: send_email is denied in the
// source matrices, so the only honest channel today is a page the candidate
// opens. The window is "since your last look at the feed", which the journal
// already knows — the page writes nothing.
function DigestRow({ item }: { item: DigestItem }) {
  return <article className="job-card">
    <div className="job-top">
      <span className="company-mark" aria-hidden="true">{item.company.slice(0, 1)}</span>
      <div className="job-title-area">
        <p className="company">{item.company}</p>
        <h3><a href={item.applyUrl} rel="nofollow noreferrer" target="_blank">{item.title}</a></h3>
      </div>
      {item.freshness === "new" && <span className="badge pass"><Icon name="check" size={16} />Новое</span>}
    </div>
    <p className="small secondary" style={{ marginTop: 4 }}>
      {item.ageLabel ?? "Дата появления неизвестна"} · условия{" "}
      {item.status === "eligible" ? "совпадают" : "нужно уточнить"}
    </p>
    <p className="source"><Icon name="source" size={16} />
      Источник: {item.sourceName} · переход ведёт на листинг источника, отклик не отправляется</p>
  </article>;
}

export default async function WhatsNew() {
  const user = await currentUser();
  if (!user) {
    return <section className="empty">
      <p className="overline">Что нового</p><h1>Доступно после входа</h1>
      <p>Дайджест строится от вашего подтверждённого профиля и остаётся приватным.</p>
      <Link className="btn primary" href="/login">Войти</Link>
    </section>;
  }
  const digest = await digestForUser(user.id);
  if (digest.status === "no_profile") {
    return <section className="empty">
      <p className="overline">Что нового</p><h1>Сначала профиль</h1>
      <p>Новые совпадения считаются от ваших подтверждённых условий.</p>
      <Link className="btn primary" href="/profile">Заполнить профиль</Link>
    </section>;
  }
  if (digest.status === "fixture_backend") {
    return <section className="empty">
      <p className="overline">Что нового</p><h1>Нет данных источника</h1>
      <p>Локальный режим fixture не содержит снапшотов — дайджест честно пуст, без моков.</p>
      <p className="small secondary">Переключите DATA_BACKEND=postgres и выполните импорт источника.</p>
    </section>;
  }
  const since = lastFeedViewLabel(digest.cursor);
  const fresh = digest.items.filter(item => item.freshness === "new");
  const earlier = digest.items.filter(item => item.freshness !== "new");
  return <>
    <header className="page-head">
      <p className="overline">Что нового / только ваше</p>
      <h1>Новые совпадения</h1>
      <p>{since === null
        ? "Это первый обзор: подбор ещё не открывался, поэтому «новым» считается всё, что нашлось. Откройте подбор — и следующий обзор покажет только появившееся после него."
        : `Считается от вашего последнего просмотра подбора (${since}). Новых совпадений: ${digest.newCount}.`}</p>
    </header>
    <section aria-label="Новое с прошлого просмотра">
      {fresh.length === 0
        ? <div className="empty">
          <h2>Новых совпадений нет</h2>
          <p>{since === null
            ? "Пока нечего показать: подбор не нашёл совпадений по вашим условиям."
            : `С прошлого просмотра (${since}) новых совпадений не появилось.`}
            {digest.seenSuppressed.eligible + digest.seenSuppressed.needsReview > 0 &&
              ` Уже показанные ранее не повторяются — скрыто ${digest.seenSuppressed.eligible + digest.seenSuppressed.needsReview}; они вернутся, если вакансия изменится, или через ${SEEN_TTL_DAYS} дней.`}</p>
          <Link className="btn tertiary" href="/matched">К подбору</Link>
        </div>
        : <div className="job-list">
          {fresh.map(item => <DigestRow key={item.snapshotId} item={item} />)}
        </div>}
    </section>
    {earlier.length > 0 && <>
      <div className="section-head">
        <h3>Совпадения из прошлых обзоров</h3>
        <span className="small secondary">Не новое для вас, но всё ещё актуально: {earlier.length}</span>
      </div>
      <section aria-label="Совпадения из прошлых обзоров" className="job-list">
        {earlier.map(item => <DigestRow key={item.snapshotId} item={item} />)}
      </section>
    </>}
    <div className="row" style={{ marginTop: 24 }}>
      <Link className="btn primary" href="/matched">К подбору</Link>
      <Link className="btn tertiary" href="/saved">Сохранённое</Link>
    </div>
  </>;
}
