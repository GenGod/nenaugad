"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  validateCountry, validateRoles, validateSalaryAmount, validateTimeOrder, validateTimezone,
} from "./form-validation.ts";
import { COUNTRY_OPTIONS, timeZoneOptions } from "./autocomplete-data.ts";
import { COUNTRY_FIELD_HINT } from "../domain/profile-gaps.ts";

type ProfileState = {
  residenceCountry: string;
  timezone: string;
  targetRoles: string;
  skills: string;
  employmentTypes: string[];
  windowStart: string;
  windowEnd: string;
  weekdays: number[];
  zeroMandatoryAttendance: boolean;
  salaryAmount: string;
  salaryCurrency: string;
  salaryHard: boolean;
  showNeedsReview: boolean;
};

const EMPLOYMENT_OPTIONS: readonly [string, string][] = [
  ["employment_full_time", "Полная занятость"],
  ["employment_part_time", "Частичная занятость"],
  ["contractor", "Подряд (contractor)"],
  ["freelance", "Фриланс"],
  ["internship", "Стажировка"],
  ["temporary", "Временная работа"],
];
const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function ProfileForm({ initial, version }: { initial: ProfileState | null; version: number | null }) {
  const router = useRouter();
  const [state, setState] = useState<ProfileState>(initial ?? {
    residenceCountry: "", timezone: "", targetRoles: "", skills: "", employmentTypes: ["contractor"],
    windowStart: "09:00", windowEnd: "18:00", weekdays: [1, 2, 3, 4, 5],
    zeroMandatoryAttendance: true, salaryAmount: "", salaryCurrency: "USD", salaryHard: true,
    showNeedsReview: true,
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Real-time validation mirrors the server rules; the server stays authority.
  const errors = {
    country: validateCountry(state.residenceCountry),
    timezone: validateTimezone(state.timezone),
    roles: validateRoles(state.targetRoles),
    salary: validateSalaryAmount(state.salaryAmount),
    timeOrder: validateTimeOrder(state.windowStart, state.windowEnd),
    weekdays: state.weekdays.length === 0 ? "Отметьте хотя бы один день доступности." : null,
    employment: state.employmentTypes.length === 0 ? "Выберите хотя бы одну форму сотрудничества." : null,
  };
  const formValid = Object.values(errors).every(message => message === null);

  function update(patch: Partial<ProfileState>) {
    setState(current => ({ ...current, ...patch }));
    setStatus(null);
  }
  function markTouched(field: string) {
    setTouched(current => ({ ...current, [field]: true }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!formValid) {
      setTouched({ country: true, timezone: true, roles: true, salary: true,
        timeOrder: true, weekdays: true, employment: true });
      return;
    }
    setBusy(true); setError(null); setStatus(null);
    try {
      const body = {
        residenceCountry: state.residenceCountry.trim().toUpperCase() || null,
        timezone: state.timezone.trim() || null,
        targetRoles: state.targetRoles.split(",").map(role => role.trim()).filter(Boolean),
        skills: state.skills.split(",").map(skill => skill.trim()).filter(Boolean),
        employmentTypes: state.employmentTypes,
        availabilityWindows: [{ weekdays: state.weekdays, start: state.windowStart, end: state.windowEnd }],
        zeroMandatoryAttendance: state.zeroMandatoryAttendance,
        minimumCompensation: state.salaryAmount.trim()
          ? { amount: state.salaryAmount.trim(), currency: state.salaryCurrency,
              period: "hourly", taxBasis: "unknown", component: "unknown", hard: state.salaryHard }
          : null,
        showNeedsReview: state.showNeedsReview,
      };
      const response = await fetch("/api/v1/profile", {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { version?: number; error?: string };
      if (!response.ok) {
        setError(`Не сохранено (${result.error ?? response.status}). Проверьте поля.`);
        return;
      }
      setStatus(`Профиль сохранён — версия ${result.version}. Подбор пересчитан.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/v1/profile", { method: "DELETE" });
      if (response.ok) {
        setStatus("Все версии профиля удалены.");
        router.refresh();
      } else setError("Не удалось удалить профиль.");
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (field: keyof typeof errors, message: string | null) =>
    touched[field] && message ? <span className="field-error" role="alert">{message}</span> : null;

  return <form className="form-grid" onSubmit={save} noValidate>
    <div className="field">
      <label htmlFor="country">Страна работы (ISO-код, например DE)</label>
      <input id="country" maxLength={2} value={state.residenceCountry} list="country-options"
        aria-invalid={touched.country === true && errors.country !== null}
        aria-describedby="country-hint"
        onChange={event => update({ residenceCountry: event.target.value.toUpperCase() })}
        onBlur={() => markTouched("country")} placeholder="DE" />
      <datalist id="country-options">
        {COUNTRY_OPTIONS.map(([code, name]) =>
          <option key={code} value={code}>{name}</option>)}
      </datalist>
      {fieldError("country", errors.country)}
      <span id="country-hint" className="small secondary">{COUNTRY_FIELD_HINT}</span>
    </div>
    <div className="field">
      <label htmlFor="tz">Часовой пояс (IANA, например Europe/Berlin)</label>
      <input id="tz" maxLength={64} value={state.timezone} list="timezone-options"
        aria-invalid={touched.timezone === true && errors.timezone !== null}
        onChange={event => update({ timezone: event.target.value })}
        onBlur={() => markTouched("timezone")} placeholder="Europe/Berlin" />
      <datalist id="timezone-options">
        {timeZoneOptions().map(zone => <option key={zone} value={zone} />)}
      </datalist>
      {fieldError("timezone", errors.timezone)}
    </div>
    <div className="field full">
      <label htmlFor="roles">Целевые роли (через запятую)</label>
      <input id="roles" maxLength={400} value={state.targetRoles}
        aria-invalid={touched.roles === true && errors.roles !== null}
        onChange={event => update({ targetRoles: event.target.value })}
        onBlur={() => markTouched("roles")} placeholder="engineer, analyst" />
      {fieldError("roles", errors.roles)}
    </div>
    <div className="field full">
      <label htmlFor="skills">Навыки (через запятую — улучшает подбор)</label>
      <div className="row">
        <input id="skills" maxLength={1000} value={state.skills} style={{ flex: 1 }}
          onChange={event => update({ skills: event.target.value })}
          placeholder="React, Node.js, PostgreSQL, Docker, Kubernetes" />
        <button type="button" className="btn secondary" disabled={busy}
          onClick={async () => {
            setBusy(true); setError(null);
            try {
              const res = await fetch("/api/v1/cv");
              if (res.ok) {
                const body = (await res.json()) as { items?: { id: string }[] };
                const latest = body.items?.[0];
                if (latest) {
                  const textRes = await fetch(`/api/v1/cv/${latest.id}`);
                  if (textRes.ok) {
                    const textBody = (await textRes.json()) as { text: string };
                    const { extractSkills } = await import("../domain/skills.ts");
                    const found = extractSkills(textBody.text);
                    if (found.length > 0) {
                      update({ skills: found.join(", ") });
                      setStatus(`Найдено ${found.length} навыков в вашем резюме.`);
                    } else {
                      setError("В резюме не найдены узнаваемые навыки — введите вручную.");
                    }
                  }
                } else {
                  setError("Сначала загрузите резюме на странице «Резюме».");
                }
              }
            } finally { setBusy(false); }
          }}>Извлечь из резюме</button>
      </div>
      <p className="small secondary">Подтверждённые навыки улучшают точность подбора и AI-рейтинга.</p>
    </div>
    <fieldset className="full">
      <legend>Формы сотрудничества</legend>
      <div className="stack" style={{ gap: 4 }}>
        {EMPLOYMENT_OPTIONS.map(([value, label]) => (
          <label key={value} className="check">
            <input type="checkbox" checked={state.employmentTypes.includes(value)}
              onChange={event => update({
                employmentTypes: event.target.checked
                  ? [...state.employmentTypes, value]
                  : state.employmentTypes.filter(type => type !== value),
              })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {fieldError("employment", errors.employment)}
    </fieldset>
    <div className="field full">
      <label htmlFor="start">Доступность: время и дни (локальные часы)</label>
      <div className="row">
        <input id="start" type="time" value={state.windowStart} style={{ maxWidth: "8rem" }}
          onChange={event => update({ windowStart: event.target.value })} />
        <span aria-hidden="true">—</span>
        <input id="end" type="time" aria-label="До" value={state.windowEnd} style={{ maxWidth: "8rem" }}
          onChange={event => update({ windowEnd: event.target.value })} />
      </div>
    </div>
    <fieldset className="full">
      <legend>Дни доступности</legend>
      <div className="row" style={{ gap: 8 }}>
        {DAY_LABELS.map((label, index) => {
          const day = index + 1;
          const selected = state.weekdays.includes(day);
          return <button key={day} type="button" className="weekday-toggle"
            aria-pressed={selected}
            onClick={() => update({
              weekdays: selected
                ? state.weekdays.filter(weekday => weekday !== day)
                : [...state.weekdays, day].sort(),
            })}>
            {label}
          </button>;
        })}
      </div>
    </fieldset>
    <div className="full">{fieldError("timeOrder", errors.timeOrder)}{fieldError("weekdays", errors.weekdays)}</div>
    <label className="check full">
      <input type="checkbox" checked={state.zeroMandatoryAttendance}
        onChange={event => update({ zeroMandatoryAttendance: event.target.checked })} />
      <span>Исключать обязательное физическое присутствие (zero mandatory attendance)</span>
    </label>
    <div className="field full">
      <label htmlFor="salary">Минимальная оплата (в час, та же валюта, что у вакансий)</label>
      <div className="row">
        <input id="salary" inputMode="decimal" maxLength={12} value={state.salaryAmount}
          style={{ maxWidth: "8rem" }} aria-invalid={touched.salary === true && errors.salary !== null}
          onChange={event => update({ salaryAmount: event.target.value })}
          onBlur={() => markTouched("salary")} placeholder="30" />
        <select aria-label="Валюта" value={state.salaryCurrency}
          onChange={event => update({ salaryCurrency: event.target.value })} style={{ maxWidth: "6rem" }}>
          {["USD", "EUR", "GBP"].map(currency => <option key={currency}>{currency}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={state.salaryHard}
            onChange={event => update({ salaryHard: event.target.checked })} />
          <span>жёсткий минимум</span>
        </label>
      </div>
      {fieldError("salary", errors.salary)}
    </div>
    <label className="check full">
      <input type="checkbox" checked={state.showNeedsReview}
        onChange={event => update({ showNeedsReview: event.target.checked })} />
      <span>Показывать вкладку «Нужно уточнить»</span>
    </label>
    <div className="full">
      {error && <p className="field-error" role="alert">{error}</p>}
      {status && <p className="small secondary">{status}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button type="submit" className="btn primary" disabled={busy}>
          {version === null ? "Создать профиль" : "Сохранить новую версию"}
        </button>
        {version !== null && <button type="button" className="btn secondary" disabled={busy} onClick={remove}>
          Удалить профиль
        </button>}
      </div>
      <p className="small secondary" style={{ marginTop: 12 }}>Страна и часы задаются вами явно и
        ниоткуда не выводятся. Профиль не покидает локальную базу.</p>
    </div>
  </form>;
}

export type { ProfileState };
