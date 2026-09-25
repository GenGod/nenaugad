import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "../../components/auth-forms.tsx";

export const metadata: Metadata = { title: "Вход" };

export default function Login() {
  return <section className="status-page">
    <p className="eyebrow">Аккаунт / локальный демо</p><h1>Вход и регистрация</h1>
    <p className="hero-lead">Профиль нужен для подбора и сохранения вакансий. Каталог остаётся открытым без входа.</p>
    <div className="panel" style={{ maxWidth: 480 }}>
      <LoginForm />
    </div>
    <p className="helper"><Link className="text-link" href="/jobs">Продолжить без входа →</Link></p>
  </section>;
}
