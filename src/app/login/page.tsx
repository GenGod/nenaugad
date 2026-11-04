import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LoginForm } from "../../components/auth-forms.tsx";
import { readConfig, signUpOpen } from "../../server/config.ts";

export const metadata: Metadata = { title: "Вход" };

export default async function Login() {
  // Read per request, never fixed at build time: a runtime variable needs dynamic rendering
  // (Next 16, guides/environment-variables). Production has no sign-up (D5, DEPLOY-002).
  await connection();
  const signUp = signUpOpen(readConfig(process.env));
  return <>
    <header className="page-head">
      <p className="overline">{signUp ? "Аккаунт / локальный демо" : "Аккаунт"}</p>
      <h1>{signUp ? "Вход и регистрация" : "Вход"}</h1>
      <p>Профиль нужен для подбора и сохранения вакансий. Каталог остаётся открытым без входа.{signUp ? null : " Регистрация пока закрыта."}</p>
    </header>
    <div className="panel" style={{ maxWidth: 480 }}>
      <LoginForm signUp={signUp} />
    </div>
    <p className="small secondary" style={{ marginTop: 16 }}>
      <Link href="/jobs">Продолжить без входа →</Link>
    </p>
  </>;
}
