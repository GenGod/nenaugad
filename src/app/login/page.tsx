import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "../../components/auth-forms.tsx";

export const metadata: Metadata = { title: "Вход" };

export default function Login() {
  return <>
    <header className="page-head">
      <p className="overline">Аккаунт / локальный демо</p>
      <h1>Вход и регистрация</h1>
      <p>Профиль нужен для подбора и сохранения вакансий. Каталог остаётся открытым без входа.</p>
    </header>
    <div className="panel" style={{ maxWidth: 480 }}>
      <LoginForm />
    </div>
    <p className="small secondary" style={{ marginTop: 16 }}>
      <Link href="/jobs">Продолжить без входа →</Link>
    </p>
  </>;
}
