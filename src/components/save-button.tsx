"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon.tsx";

// Saves/unaves a snapshot through the ownership-scoped API; the button
// reflects only real server responses, never an optimistic fake state.
export function SaveButton({ snapshotId, initiallySaved, variant }: {
  snapshotId: string; initiallySaved?: boolean; variant?: "text" | "icon";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/saved", {
        method: saved ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok && !(saved && response.status === 404)) {
        setError("Сервер не подтвердил операцию.");
        return;
      }
      setSaved(!saved);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (variant === "icon") {
    return <button type="button" className="icon-btn" aria-pressed={saved}
      aria-label={saved ? "Убрать из сохранённого" : "Сохранить вакансию"}
      onClick={toggle} disabled={busy}>
      <Icon name={saved ? "bookmark-filled" : "bookmark"} />
    </button>;
  }
  return <>
    <button type="button" className={saved ? "btn secondary" : "btn primary"}
      onClick={toggle} disabled={busy}>
      {saved ? "Убрать из сохранённого" : "Сохранить"}
    </button>
    {error && <span className="small secondary" role="alert">{error}</span>}
  </>;
}
