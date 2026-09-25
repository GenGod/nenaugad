"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Hide a job from matching with an explicit irrelevance reason (spec 4.3).
// Reasons are fixed codes; the API validates them again.
export function HideButton({ snapshotId }: { snapshotId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function hide(reasonCode: string) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/hidden", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId, reason: reasonCode }),
      });
      if (response.status === 401) { router.push("/login"); return; }
      if (!response.ok) { setError("Сервер не подтвердил скрытие."); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="button secondary compact" disabled={busy}
      onClick={() => setOpen(true)}>Скрыть…</button>;
  }
  return <span className="search-controls">
    <select aria-label="Причина скрытия" defaultValue="salary_mismatch" disabled={busy}
      onChange={event => { if (event.target.value !== "") void hide(event.target.value); }}>
      <option value="" disabled>Выберите причину</option>
      <option value="salary_mismatch">Зарплата не подходит</option>
      <option value="geography_mismatch">География найма не подходит</option>
      <option value="wrong_level">Не тот уровень позиции</option>
      <option value="wrong_stack">Не тот стек/роли</option>
      <option value="company_uninteresting">Компания не интересна</option>
      <option value="remote_conditions_unclear">Условия удалёнки неясны</option>
      <option value="other">Другое</option>
    </select>
    <button type="button" className="button secondary compact" disabled={busy}
      onClick={() => setOpen(false)}>Отмена</button>
    {error && <span className="helper" role="alert">{error}</span>}
  </span>;
}

export function UnhideButton({ snapshotId }: { snapshotId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className="button secondary compact" disabled={busy}
    onClick={async () => {
      setBusy(true);
      try {
        const response = await fetch("/api/v1/hidden", {
          method: "DELETE", headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshotId }),
        });
        if (response.ok) router.refresh();
      } finally {
        setBusy(false);
      }
    }}>Вернуть в подбор</button>;
}

// Manual apply mark: set only by this button, never by the external link.
export function AppliedToggle({ snapshotId, markedAppliedAt }: {
  snapshotId: string; markedAppliedAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button"
    className={markedAppliedAt ? "button secondary compact" : "button primary compact"}
    disabled={busy}
    onClick={async () => {
      setBusy(true);
      try {
        const response = await fetch("/api/v1/saved", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshotId, applied: markedAppliedAt === null }),
        });
        if (response.ok) router.refresh();
      } finally {
        setBusy(false);
      }
    }}>
    {markedAppliedAt ? `Отклик отправлен ✓ (${markedAppliedAt.slice(0, 10)})` : "Отметить отклик"}
  </button>;
}
