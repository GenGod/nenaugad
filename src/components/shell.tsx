import Link from "next/link";
import { currentUser } from "../server/auth.ts";
import { LogoutButton } from "./auth-forms.tsx";

export async function Header() {
  const user = await currentUser();
  return <>
    <a className="skip-link" href="#main">К содержимому</a>
    <div className="demo-banner">
      <div className="container">Локальный шаблон · Все вакансии вымышлены · Резюме и AI ещё не подключены</div>
    </div>
    <header className="site-header container">
      <Link className="wordmark" href="/" aria-label="Nenaugad — главная">nenaugad<span aria-hidden="true">.</span></Link>
      <nav className="desktop-nav" aria-label="Основная навигация">
        <Link href="/jobs">Вакансии</Link>
        <Link href="/saved">Сохранённое</Link>
        <Link href="/profile">Профиль</Link>
      </nav>
      {user
        ? <div className="header-user">
            <Link className="status-link" href="/matched">
              <span className="status-dot" aria-hidden="true" />Подбор
            </Link>
            <span className="user-chip" title={user.email ?? undefined}>
              {(user.email ?? "аккаунт").split("@")[0]}
            </span>
            <LogoutButton />
          </div>
        : <Link className="status-link" href="/login">
            <span className="status-dot" aria-hidden="true" />Войти
          </Link>}
    </header>
  </>;
}

export function Footer() {
  return <>
    <footer className="site-footer container">
      <span>Nenaugad / Starter 0.1</span>
      <span>Пример интерфейса. Не открытый сервис поиска работы.</span>
    </footer>
    <nav className="mobile-nav" aria-label="Мобильная навигация">
      <Link href="/jobs"><span aria-hidden="true">⌕</span>Вакансии</Link>
      <Link href="/saved"><span aria-hidden="true">◇</span>Сохранённое</Link>
      <Link href="/profile"><span aria-hidden="true">○</span>Профиль</Link>
    </nav>
  </>;
}
