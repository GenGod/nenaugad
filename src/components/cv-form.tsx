"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type UploadItem = {
  id: string;
  originalFilename: string;
  kind: string;
  characterCount: number;
  warnings: readonly string[];
  createdAt: string;
};

const WARNING_LABELS: Readonly<Record<string, string>> = {
  THIN_TEXT_LAYER: "Текстовый слой очень тонкий — возможно, это скан или шаблон без текста.",
  UNUSUAL_CHARACTERS: "Много необычных символов — проверьте извлечённый текст перед использованием.",
};

export function CvForm({ initialItems, enabled }: { initialItems: UploadItem[]; enabled: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openText, setOpenText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/v1/cv");
    if (response.ok) {
      const body = (await response.json()) as { items: UploadItem[] };
      setItems(body.items);
      router.refresh();
    }
  }

  async function submitText(event: React.FormEvent) {
    event.preventDefault();
    setError(null); setMessage(null);
    if (text.trim().length === 0) {
      setError("Вставьте текст резюме.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/cv", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; warnings?: string[]; characterCount?: number };
      if (!response.ok) {
        setError(body.message ?? "Не удалось сохранить текст.");
        return;
      }
      const warnings = body.warnings ?? [];
      setMessage(`Сохранено: ${body.characterCount} символов${warnings.length > 0
        ? "; предупреждения: " + warnings.map(code => WARNING_LABELS[code] ?? code).join(" ") : ""}.`);
      setText("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null); setMessage(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/v1/cv", { method: "POST", body: form });
      const body = (await response.json().catch(() => ({}))) as { message?: string; warnings?: string[]; characterCount?: number };
      if (!response.ok) {
        setError(body.message ?? "Не удалось разобрать файл.");
        return;
      }
      const warnings = body.warnings ?? [];
      setMessage(`Сохранено: ${body.characterCount} символов${warnings.length > 0
        ? "; предупреждения: " + warnings.map(code => WARNING_LABELS[code] ?? code).join(" ") : ""}.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleOpen(id: string) {
    if (openId === id) {
      setOpenId(null); setOpenText(null);
      return;
    }
    const response = await fetch(`/api/v1/cv/${id}`);
    if (response.ok) {
      const body = (await response.json()) as { text: string };
      setOpenId(id);
      setOpenText(body.text);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/cv/${id}`, { method: "DELETE" });
      if (response.ok) {
        if (openId === id) { setOpenId(null); setOpenText(null); }
        await refresh();
      } else setError("Не удалось удалить.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {!enabled && <p className="field-error" role="alert">
      Загрузка выключена (UPLOADS_ENABLED). Вставка текста ниже работает только при включённом флаге.
    </p>}
    <form className="panel" onSubmit={submitText}>
      <div className="field">
        <label htmlFor="cvtext">Вставьте текст резюме</label>
        <textarea id="cvtext" rows={8} maxLength={200000} value={text}
          onChange={event => setText(event.target.value)}
          placeholder="Опыт, роли, навыки, годы…" />
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" className="btn primary" disabled={busy || !enabled}>Сохранить текст</button>
        <label className="btn secondary" style={{ cursor: busy || !enabled ? "not-allowed" : "pointer" }}>
          Загрузить файл (.txt/.md/.docx)
          <input type="file" accept=".txt,.md,.docx,text/plain,text/markdown" hidden
            disabled={busy || !enabled} onChange={submitFile} />
        </label>
      </div>
      <p className="small secondary" style={{ marginTop: 12 }}>Парсер работает офлайн; PDF пока
        не поддерживается — вставьте текст. Исходный файл не хранится, только извлечённый текст.
        Ничего не отправляется внешним сервисам.</p>
    </form>
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p className="small secondary" style={{ marginTop: 8 }} aria-live="polite">{message}</p>}
    <div className="section-head">
      <h3>Сохранённые резюме</h3>
      <span className="small secondary">Только ваши; удаление профиля удаляет и их</span>
    </div>
    {items.length === 0
      ? <div className="empty">
        <h2>Пока ничего не загружено</h2>
        <p>Текст остаётся приватным и используется только вами при заполнении профиля.</p>
      </div>
      : <div className="job-list">
        {items.map(item => <article key={item.id} className="job-card">
          <div className="job-top">
            <span className="company-mark" aria-hidden="true">{item.kind === "docx" ? "W" : "T"}</span>
            <div className="job-title-area">
              <p className="company">{item.originalFilename}</p>
              <h3><button type="button" className="source-link"
                onClick={() => { void toggleOpen(item.id); }}>
                {openId === item.id ? "Скрыть текст" : "Показать текст"}
              </button></h3>
            </div>
            <span className="badge neutral">{item.kind} · {item.characterCount} симв.</span>
          </div>
          {item.warnings.length > 0 && <ul className="small secondary" style={{ marginTop: 8 }}>
            {item.warnings.map(code => <li key={code}>⚠ {WARNING_LABELS[code] ?? code}</li>)}
          </ul>}
          {openId === item.id && openText !== null && (
            <div style={{ marginTop: 12 }}>
              <textarea readOnly rows={12} value={openText} aria-label="Извлечённый текст"
                style={{ width: "100%" }} />
            </div>
          )}
          <div className="job-bottom">
            <span className="small secondary">Загружено {item.createdAt.slice(0, 10)}</span>
            <button type="button" className="btn secondary" disabled={busy}
              onClick={() => { void remove(item.id); }}>Удалить</button>
          </div>
        </article>)}
      </div>}
  </>;
}
