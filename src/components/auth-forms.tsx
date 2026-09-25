"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import {
  validateEmail, validatePassword,
} from "./form-validation.ts";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const formValid = emailError === null && passwordError === null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!formValid) return;
    setBusy(true);
    try {
      if (mode === "register") {
        const response = await fetch("/api/v1/auth/register", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setError(body.error === "EMAIL_TAKEN" ? "Такой email уже зарегистрирован."
            : body.error === "WEAK_PASSWORD" ? "Пароль — минимум 10 символов."
            : "Проверьте email и пароль.");
          return;
        }
      }
      const result = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (result?.error) {
        setError(mode === "register" ? "Регистрация прошла, но вход не удался." : "Неверный email или пароль.");
        return;
      }
      router.push("/profile");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (visible: boolean, message: string | null) =>
    visible && message ? <span className="field-error" role="alert">{message}</span> : null;

  return <form className="search-form" onSubmit={submit} noValidate>
    <label htmlFor="email">Email</label>
    <input id="email" type="email" required maxLength={200} value={email}
      autoComplete="email" aria-invalid={touched.email === true && emailError !== null}
      onChange={event => setEmail(event.target.value)}
      onBlur={() => setTouched(current => ({ ...current, email: true }))} />
    {fieldError(touched.email === true, emailError)}
    <label htmlFor="password">Пароль (минимум 10 символов)</label>
    <input id="password" type="password" required minLength={10} maxLength={200} value={password}
      autoComplete="new-password" aria-invalid={touched.password === true && passwordError !== null}
      onChange={event => setPassword(event.target.value)}
      onBlur={() => setTouched(current => ({ ...current, password: true }))} />
    {fieldError(touched.password === true, passwordError)}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="search-controls">
      <button type="submit" className="button primary compact" disabled={busy || !formValid}>
        {mode === "register" ? "Создать аккаунт и войти" : "Войти"}
      </button>
      <button type="button" className="button secondary compact" onClick={() => {
        setMode(mode === "register" ? "login" : "register");
        setError(null);
      }}>
        {mode === "register" ? "У меня есть аккаунт" : "Создать аккаунт"}
      </button>
    </div>
    <p className="helper">Локальный демо-аккаунт. Не используйте пароль от других сервисов.</p>
  </form>;
}

export function LogoutButton() {
  return <button type="button" className="button secondary compact"
    onClick={() => { void signOut({ callbackUrl: "/" }); }}>Выйти</button>;
}
