"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

// Account deletion (B11-001): the user re-enters the password (owner decision
// 2026-10-13) and sees what is deleted and what is kept before confirming (spec SP 1.0
// §8). On success the session ends in place, as logout does (B43).
export function AccountDeletion() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/account", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error === "PASSWORD_MISMATCH" ? "Пароль не подошёл — аккаунт не удалён."
          : response.status === 401 ? "Сессия закончилась или аккаунт уже удалён — войдите снова."
          : "Не удалось удалить аккаунт. Попробуйте позже.");
        return;
      }
      // The account is gone whatever happens next: leave the page even if signing out fails.
      await signOut({ redirect: false }).catch(() => undefined);
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack" onSubmit={remove} noValidate>
    <p>Удаление сразу и необратимо стирает аккаунт (email и пароль), все версии профиля,
      тексты резюме, письма и их версии, сохранённые и скрытые вакансии, журнал показов и
      оценки соответствия.</p>
    <p className="small secondary">Остаются, без email и текстов: записи о расходах на ИИ (суммы
      и статусы) и отметка о самом удалении — чтобы восстановление из резервной копии не
      вернуло ваши данные.</p>
    <div className="field">
      <label htmlFor="delete-password">Пароль для удаления</label>
      <input id="delete-password" type="password" autoComplete="current-password" maxLength={200}
        value={password} onChange={event => setPassword(event.target.value)} />
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="row">
      <button type="submit" className="btn danger" disabled={busy || password.length === 0}>
        Удалить аккаунт
      </button>
    </div>
  </form>;
}
