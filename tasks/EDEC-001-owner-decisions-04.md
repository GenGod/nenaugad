# EDEC-001 — партия решений владельца №4 (раздел E инвентаря)

**Что это.** Раздел E [docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md) — решения, не
работа исполнителя. Задача: собрать вопросы с фактами и замерами, получить
ответы, исполнить то, что исполняется кодом/политикой, и зарегистрировать
оставшиеся задачи.

**Статус:** implemented (2026-10-02).

## Пакет и ответы

Полный разбор — [docs/design/2026-10-02-owner-decisions-04-batch.md](../docs/design/2026-10-02-owner-decisions-04-batch.md).
Ответы владельца (2026-10-02):

1. **Выдача** → «Да, переключить на v4». Ключевой замер: порядок каталога
   NDCG@10 **0.421** против ранкера v4 **0.892** (golden v4, 39 × 6). Реализация —
   задача B23.
2. **Батч/приватность** → «Закрыто + задача оценки локальной модели». Приватность
   AI-007 не отменяется; скоринг и письма ждут локальную генеративную модель —
   MODEL-001.
3. **jobicy `process_with_ml`** → «Сначала перечитать условия», затем «Да, выдать».
   **Исполнено в этой сессии:**
   - Fair Use перечитан: «designed for … research tools, **AI products**…»;
     «**AI assistants** … without a separate agreement» — та же формулировка, на
     которой 2026-10-01 выдан более сильный `send_to_ai_provider`.
   - Политика jobicy v4 → v5: `process_with_ml: allowed`, `reviewed_at`
     2026-10-02, `approval_reference` дополнен решением №4; `terms_hash` не
     менялся (текст условий тот же), `train_model` остаётся denied.
   - Тесты обновлены под решение: `tests/unit/jobicy.test.ts`,
     `tests/unit/source-contract.test.ts`, `tests/integration/embeddings.test.ts`
     (старая проверка «denied» инвертирована с записью решения).
   - `npm run embeddings:index -- --embedder=local --source=jobicy` →
     `{result: "ok", embedded: 202, stored: 202}` — **B13 закрыт фактически**.
4. **Retention** → «Журнал 12 мес + tombstone». Реализация — RET-001.

Пункты E.5–E.7 (фильтры компаний, ESCO, email) остаются открытыми — ответы
ожидаются; рекомендации в §9 пакета.

## Регистрация следующих задач

| Задача | Что | Из решения |
|---|---|---|
| B23 | `/matched` на ранкер v4 (+ журнал, shadow, тесты, замер до/после) | §1 |
| RET-001 | TTL журнала 12 мес + tombstone закрытых записей (миграция) | §4 |
| MODEL-001 | оценка локальной генеративной модели (железо/скорость/качество) | §2 |

## Проверки

`npm run check` → exit 0; `npm run test:db` → exit 0 (включая обновлённый
embeddings-тест); `npm run test:e2e` → 96 passed; `npm run embeddings:index
--source=jobicy` → ok, 202/202. Расходы: coding-host — `unknown`.
