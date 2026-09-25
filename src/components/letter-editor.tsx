"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Revision = {
  id: string; version: number; body: string;
  origin: "generated" | "user_edited";
  modelId: string | null; createdAt: string;
};

export function LetterEditor({ letterId, initialRevision, initialVersions }: {
  letterId: string; initialRevision: Revision | null; initialVersions: readonly Revision[];
}) {
  const router = useRouter();
  const [text, setText] = useState(initialRevision?.body ?? "");
  const [versions, setVersions] = useState(initialVersions);
  const [currentVersion, setCurrentVersion] = useState(initialRevision?.version ?? 0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [needsInput, setNeedsInput] = useState<string[] | null>(null);

  const origin = initialRevision?.origin;
  const statusLabel = origin === "generated"
    ? "Сгенерировано и проверено структурно" : origin === "user_edited"
    ? "Изменено вами — основания нового текста не проверены"
    : "Черновик пуст";

  async function generate() {
    setGenerating(true); setError(null); setStatus(null);
    try {
      const response = await fetch(`/api/v1/cover-letters/${letterId}/generations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
      });
      const body = (await response.json().catch(() => ({}))) as {
        revision?: Revision; error?: string; settledMinor?: string;
        questions?: string[]; rawOutput?: string;
        validation?: { passed: boolean; issues: { code: string; message: string }[] };
      };
      if (!response.ok) {
        if (body.error === "NEEDS_INPUT" && body.questions) {
          setNeedsInput(body.questions);
          if (body.rawOutput) setText(body.rawOutput);
          setStatus("Письмо требует доработки — вопросы ниже.");
          return;
        }
        setError(body.error === "BUDGET_EXCEEDED"
          ? "Бюджет исчерпан — обратитесь к владельцу."
          : body.error === "PROFILE_REQUIRED"
          ? "Сначала заполните профиль."
          : "Не удалось сгенерировать. Попробуйте позже.");
        return;
      }
      if (body.revision) {
        setText(body.revision.body);
        setCurrentVersion(body.revision.version);
        setVersions(prev => [body.revision!, ...prev]);
        setNeedsInput(null);
        const warnings = body.validation?.issues?.filter(i => i.code !== "EMPTY") ?? [];
        setStatus(`Черновик создан и проверен (версия ${body.revision.version}).` +
          (warnings.length > 0 ? ` Замечания: ${warnings.map(w => w.message).join("; ")}` : "") +
          ` Списано ${body.settledMinor ?? "?"} micro-cents.`);
        router.refresh();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setBusy(true); setError(null); setStatus(null);
    try {
      const response = await fetch(`/api/v1/cover-letters/${letterId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text, expectedVersion: currentVersion }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        version?: number; error?: string;
      };
      if (!response.ok) {
        setError(body.error === "VERSION_CONFLICT"
          ? "Конфликт версий — обновите страницу."
          : "Не удалось сохранить.");
        return;
      }
      setCurrentVersion(body.version ?? currentVersion + 1);
      setStatus(`Сохранено (версия ${body.version}).`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/cover-letters/${letterId}`, { method: "DELETE" });
      if (response.ok) router.push("/matched");
    } finally {
      setBusy(false);
    }
  }

  function downloadTxt() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cover-letter.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Скопировано в буфер обмена.");
    } catch {
      setError("Не удалось скопировать — выделите текст вручную.");
    }
  }

  return <>
    {needsInput && <div className="empty-state" style={{ marginBottom: 16 }} role="alert">
      <h2>Письмо требует доработки</h2>
      <p>Валидатор обнаружил проблемы. Исправьте текст вручную или уточните данные:</p>
      <ul>{needsInput.map((question, index) => <li key={index}>{question}</li>)}</ul>
      <button type="button" className="button secondary compact"
        onClick={() => setNeedsInput(null)}>Понятно, правлю вручную</button>
    </div>}
    <div className="search-controls" style={{ marginBottom: 16 }}>
      <button type="button" className="button primary compact" disabled={generating}
        onClick={generate}>
        {generating ? "Генерируем…" : "Создать черновик"}
      </button>
      <button type="button" className="button primary compact" disabled={busy || text.trim().length === 0}
        onClick={copyToClipboard}>Скопировать письмо</button>
      <button type="button" className="button secondary compact" disabled={busy}
        onClick={save}>Сохранить правки</button>
      <button type="button" className="button secondary compact" disabled={text.trim().length === 0}
        onClick={downloadTxt}>Сохранить TXT</button>
      <button type="button" className="button secondary compact"
        onClick={() => setShowVersions(!showVersions)}>
        {showVersions ? "Скрыть версии" : `История (${versions.length})`}
      </button>
      <button type="button" className="button secondary compact" disabled={busy} onClick={remove}>
        Удалить
      </button>
    </div>
    <p className="helper" aria-live="polite">
      {statusLabel} · Письмо не отправляется работодателю автоматически.
    </p>
    <label htmlFor="letter-body" className="sr-only">Текст письма</label>
    <textarea id="letter-body" rows={16} value={text} style={{ width: "100%", fontSize: "1rem" }}
      onChange={event => { setText(event.target.value); setStatus(null); }}
      placeholder="Нажмите «Создать черновик» для AI-генерации или пишите вручную…" />
    <output id="letter-word-count" className="helper" aria-live="off">Слов: {text.trim() ? text.trim().split(/\s+/u).length : 0}</output>
    {error && <p className="field-error" role="alert">{error}</p>}
    {status && <output className="helper" aria-live="polite">{status}</output>}
    {showVersions && <div className="results" style={{ marginTop: 16 }}>
      <div className="result-header"><h2>Версии</h2></div>
      {versions.map(rev => (
        <article key={rev.id} className="job-card" style={{ padding: "1rem" }}>
          <div className="card-top">
            <span className="badge neutral">v{rev.version}</span>
            <span className="badge neutral">{rev.origin === "generated" ? "AI" : "правка"}</span>
            <span className="helper">{rev.createdAt.slice(0, 16).replace("T", " ")}</span>
          </div>
          <p className="conditions" style={{
            maxHeight: "6rem", overflow: "hidden", fontSize: ".875rem" }}>
            {rev.body.slice(0, 200)}{rev.body.length > 200 ? "…" : ""}
          </p>
          <button type="button" className="button secondary compact"
            onClick={() => { setText(rev.body); setCurrentVersion(rev.version); setStatus(`Показана версия ${rev.version}.`); }}>
            Открыть
          </button>
        </article>
      ))}
    </div>}
  </>;
}
