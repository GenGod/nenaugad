"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Revision = {
  id: string; version: number; body: string;
  origin: "generated" | "user_edited";
  modelId: string | null; createdAt: string;
};

type Evidence = {
  profileRoles: readonly string[];
  profileCountry: string | null;
  jobTitle: string | null;
  jobCompany: string | null;
  generalMode: boolean;
};

export function LetterEditor({ letterId, initialRevision, initialVersions, evidence }: {
  letterId: string; initialRevision: Revision | null; initialVersions: readonly Revision[];
  evidence: Evidence;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialRevision?.body ?? "");
  const [versions, setVersions] = useState(initialVersions);
  const [currentVersion, setCurrentVersion] = useState(initialRevision?.version ?? 0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
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
          ` Списано ${body.settledMinor ?? "?"} μ$ (миллионных долей доллара).`);
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
        // Conditional write (B10): the version this editor was loaded with goes
        // into If-Match, so a second tab holding a stale version gets 412 instead
        // of silently overwriting the newer text.
        headers: { "content-type": "application/json", "if-match": `"${currentVersion}"` },
        body: JSON.stringify({ body: text }),
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
    {needsInput && <div className="banner review" style={{ marginBottom: 16 }} role="alert">
      <div>
        <strong>Письмо требует доработки.</strong>
        <p style={{ marginTop: 8 }}>Валидатор обнаружил проблемы. Исправьте текст вручную
          или уточните данные:</p>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          {needsInput.map((question, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static list, replaced as a whole and never reordered
            <li key={index}>{question}</li>
          ))}
        </ul>
        <button type="button" className="btn secondary" style={{ marginTop: 12 }}
          onClick={() => setNeedsInput(null)}>Понятно, правлю вручную</button>
      </div>
    </div>}
    <div className="row" style={{ marginBottom: 16 }}>
      <button type="button" className="btn primary" disabled={generating} onClick={generate}>
        {generating ? "Генерируем…" : "Создать черновик"}
      </button>
      <button type="button" className="btn primary" disabled={busy || text.trim().length === 0}
        onClick={copyToClipboard}>Скопировать письмо</button>
      <button type="button" className="btn secondary" disabled={busy}
        onClick={save}>Сохранить правки</button>
      <button type="button" className="btn secondary" disabled={text.trim().length === 0}
        onClick={downloadTxt}>Сохранить TXT</button>
      <button type="button" className="btn secondary"
        onClick={() => setShowVersions(!showVersions)}>
        {showVersions ? "Скрыть версии" : `История (${versions.length})`}
      </button>
      <button type="button" className="btn secondary" disabled={busy} onClick={remove}>
        Удалить
      </button>
    </div>
    <p className="small secondary" aria-live="polite">
      {statusLabel} · Письмо не отправляется работодателю автоматически.
    </p>
    <div className="letter-area">
      <label htmlFor="letter-body" className="sr-only">Текст письма</label>
      <textarea id="letter-body" rows={16} value={text} style={{ width: "100%" }}
        onChange={event => { setText(event.target.value); setStatus(null); }}
        placeholder="Нажмите «Создать черновик» для AI-генерации или пишите вручную…" />
    </div>
    <output id="letter-word-count" className="small secondary" aria-live="off">
      Слов: {text.trim() ? text.trim().split(/\s+/u).length : 0}
    </output>
    {/* Evidence panel (B8): what a letter may be based on, from the confirmed
        profile and the job card — the same facts the generation API reports. */}
    <div className="aside-card" style={{ marginTop: 16 }}>
      <p className="overline">На чём основано</p>
      <ul className="stack" style={{ marginTop: 8, paddingLeft: 18 }}>
        <li>Роли из подтверждённого профиля:{" "}
          {evidence.profileRoles.length > 0 ? evidence.profileRoles.join(", ") : "не заданы"}</li>
        <li>Страна профиля: {evidence.profileCountry ?? "не указана"}</li>
        <li>{evidence.generalMode
          ? "Вакансия не выбрана — это общий черновик."
          : `Вакансия: ${evidence.jobTitle ?? "недоступна"}${evidence.jobCompany ? ` · ${evidence.jobCompany}` : ""}`}</li>
      </ul>
      <p className="small secondary" style={{ marginTop: 8 }}>
        Основания — подтверждённый профиль и карточка вакансии; сам текст письма никуда
        не отправляется автоматически.
      </p>
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {status && <output className="small secondary" aria-live="polite">{status}</output>}
    {showVersions && <div style={{ marginTop: 16 }}>
      <div className="section-head" style={{ marginTop: 8 }}><h3>Версии</h3></div>
      <div className="stack">
        {versions.map(rev => (
          <article key={rev.id} className="aside-card">
            <div className="row">
              <span className="badge neutral">v{rev.version}</span>
              <span className="badge neutral">{rev.origin === "generated" ? "AI" : "правка"}</span>
              <span className="small secondary">{rev.createdAt.slice(0, 16).replace("T", " ")}</span>
            </div>
            <p className="small secondary" style={{
              marginTop: 8, maxHeight: "6rem", overflow: "hidden" }}>
              {rev.body.slice(0, 200)}{rev.body.length > 200 ? "…" : ""}
            </p>
            <button type="button" className="btn secondary"
              onClick={() => { setText(rev.body); setCurrentVersion(rev.version); setStatus(`Показана версия ${rev.version}.`); }}>
              Открыть
            </button>
            <button type="button" className="btn secondary"
              onClick={() => setCompareVersion(rev.version)}>
              Сравнить
            </button>
          </article>
        ))}
      </div>
    </div>}
    {compareVersion !== null && (() => {
      const other = versions.find(rev => rev.version === compareVersion);
      if (!other) return null;
      return <div style={{ marginTop: 16 }}>
        <div className="section-head" style={{ marginTop: 8 }}>
          <h3>Сравнение: версия {other.version} и текущий текст</h3>
          <button type="button" className="btn secondary" onClick={() => setCompareVersion(null)}>
            Закрыть сравнение</button>
        </div>
        <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="small secondary">Версия {other.version}
              {" "}({other.origin === "generated" ? "AI" : "правка"}) ·{" "}
              {other.createdAt.slice(0, 16).replace("T", " ")}</p>
            <pre className="aside-card"
              style={{ whiteSpace: "pre-wrap", maxHeight: "20rem", overflow: "auto" }}>
              {other.body}</pre>
          </div>
          <div style={{ flex: 1 }}>
            <p className="small secondary">Текущий текст (версия {currentVersion})</p>
            <pre className="aside-card"
              style={{ whiteSpace: "pre-wrap", maxHeight: "20rem", overflow: "auto" }}>
              {text}</pre>
          </div>
        </div>
      </div>;
    })()}
  </>;
}
