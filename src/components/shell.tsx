import Link from "next/link";
import { currentUser } from "../server/auth.ts";
import { LogoutButton } from "./auth-forms.tsx";
import { MobileNav, SiteNav } from "./nav.tsx";

export async function Header() {
  const user = await currentUser();
  const email = user?.email ?? "";
  return <>
    <a className="skip" href="#main">К содержимому</a>
    <div className="brand-note">
      Демо-каталог · Все вакансии вымышлены · Резюме, профиль и письма остаются в локальной базе
    </div>
    <header className="site-header">
      <div className="wrap header-inner">
        <Link className="logo" href="/" aria-label="Ненаугад — главная">
          {/* biome-ignore lint/performance/noImgElement: a fixed 208×31 brand asset; next/image would change the header markup that every visual baseline covers */}
          <img className="brand-logo" src="/brand/wordmark.png" alt="ненаугад" width={208} height={31} />
        </Link>
        <span className="tagline">Только удалённо</span>
        <SiteNav />
        <div className="header-right">
          {user
            ? <>
              <span className="small secondary">{email.split("@")[0]}</span>
              <span className="avatar" aria-hidden="true">{(email.slice(0, 1) || "н").toUpperCase()}</span>
              <LogoutButton />
            </>
            : <Link className="btn secondary" href="/login">Войти</Link>}
        </div>
      </div>
    </header>
  </>;
}

export function Footer() {
  return <>
    <footer className="wrap">
      <div className="demo-note">
        Ненаугад · Демо-интерфейс. Автоматические отклики не выполняются; профиль, резюме и письма приватны.
        <br />
        {/* Обязательная атрибуция ESCO (handbook §5); словарь псевдонимов —
            адаптированная версия skills-части: см. src/domain/skills-esco.ts. */}
        <span lang="en">This service uses the ESCO classification of the European Commission.</span>{" "}
        Словарь псевдонимов навыков — адаптированная версия ESCO (v1.2.1).
      </div>
    </footer>
    <MobileNav />
  </>;
}
