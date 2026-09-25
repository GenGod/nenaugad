"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Saves/unaves a snapshot through the ownership-scoped API; the button
// reflects only real server responses, never an optimistic fake state.
export function SaveButton({ snapshotId, initiallySaved }: { snapshotId: string; initiallySaved?: boolean }) {
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

  return <>
    <button type="button" className={saved ? "button secondary compact" : "button primary compact"}
      onClick={toggle} disabled={busy}>
      {saved ? "Убрать из сохранённого" : "Сохранить"}
    </button>
    {error && <span className="helper" role="alert">{error}</span>}
  </>;
}
