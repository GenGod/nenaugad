# C0-002 — AI-границы, часть 2: свойство-тесты и пакет purposes

**Статус: исполнена в незаблокированной части (implemented), 2026-10-04.** Часть 1
C0 исполнена ранее (AI-006). Часть 2 брифа распадается на три куска: (а) «убедиться по
коду, что ownership, atomic budget reservation, персистентные счётчики, deadline,
uncertain billing, cancellation, commit-time revalidation покрывают вызовы; тесты
каждого свойства» — исполнено здесь; (б) новые purposes — «каждый отдельно одобряется
владельцем», пакет ниже; (в) пересмотр квоты/потолка — решение владельца.

## Часть 1 — перепроверена по коду (не по памяти)

- `gateway.ts:74` — whitelist purposes проверяется **до** любого движения денег
  (`isPurposeApproved` → `PurposeNotApprovedError`), тест golden-10-случая ниже.
- Батч-путь: AI-006 закрыт вариантом «отключить до завода» — `openai-batch.ts` без
  импорта SDK, `BATCH_DISABLED` + `BATCH_DISABLED_REASON`, роут отвечает 503 с планом
  повторного включения; дыра mapping `custom_id → snapshot_id` закрыта вместе с путём.
- Аудит раздела A инвентаря (AI-004…AI-007) закрыт; `LIVE_AI_ENABLED` — выключатель
  шлюза (тест «с флагом off отказ до денег»).

## Аудит свойств: свойство → где обеспечено → тест

| Свойство | Обеспечено | Тест |
|---|---|---|
| Ownership | все запросы spending скоупятся `owner_id` (reserve/begin/settle/cancel/get) | **новый**: чужой владелец не читает/settle/cancel (OPERATION_NOT_FOUND); свой — не тронут |
| Atomic budget reservation | `FOR UPDATE` на `ai_budgets` + условный UPDATE held | «concurrent callers cannot double-spend the remainder» |
| Персистентные счётчики попыток | `beginAttempt`: `attempt_count < MAX_ATTEMPTS` в SQL | «attempt counter is persistent…» (+ ATTEMPTS_EXHAUSTED) |
| Deadline | `beginAttempt`: `deadline_at > now`; отдельный тест | «deadline expiry and uncertain hold semantics» (DEADLINE_EXPIRED) |
| Uncertain billing | `markUncertain` (status-guarded), холд удерживается; снятие — `npm run ai:holds` | «…uncertain hold semantics» + «…the mock transport path settles honestly» |
| Cancellation | `cancelOperation` (status-guarded, освобождает холд) | «settlement converts the hold; cancel releases it; the kill switch…» |
| Commit-time revalidation | `settleOperation`: статус ∈ {in_flight, uncertain} иначе WRONG_STATE; `cancelOperation`: settled/cancelled → WRONG_STATE | **новый**: cancelled→settle WRONG_STATE; settled→cancel WRONG_STATE |
| Kill switch | `executeGuardedOperation`: `liveAi` первым | «live AI switch: with the flag off the gateway refuses before any money moves» |
| Квота владельца | `reserveBudget` сверяет owner-бюджет | «registration provisions the owner's quota…missing owner budget» + **новый**: исчерпание settled-тратами |
| Потолок операции | `gateway`: `worstCase > operationCeiling` → отказ | «operation ceiling: a reservation above one cent is refused» |
| Граница персональных данных | `personal-data-boundary.ts` (см. пакет ниже) | unit-тесты границы (существующие) |

**Добавлено 4 теста** в `tests/integration/ai-guards.test.ts`: изоляция владельцев,
двусторонний WRONG_STATE (commit-time revalidation), исчерпание квоты владельца
(не только «строка отсутствует»), и документированная граница «deadline останавливает
новые шаги, но не блокирует settle уже отправленного вызова».

## Золотой 10 (общий список брифа §4) — держится

Формулировка пункта: «Любой AI-вызов — включая существующий путь job_matching и новые
purposes фазы C — вне одобренного purpose/бюджета → fail-closed отказ (сегодня
batch-путь это условие нарушает — см. C0)». Нарушитель (batch) закрыт; тесты: отказ
неодобренного purpose **до** денег (0 строк операций, 0 held), kill switch, потолок
операции, бюджеты, uncertain без слепого ретрая. (V5) safety-тесты писем не тронуты;
`npm run guardrails` зелёный.

## Пакет решений владельца: purposes фазы C

**Поправка по коду (проверено 2026-10-04):** право источников
`send_to_ai_provider` **уже выдано** всем трём источникам решением владельца
2026-10-01 (AI-005, `source-policies.ts:38,102,170`); ранние документы (доктрина №3
§4.3, задача B3-001) называли его blocked — исправлено в обоих. Квота владельца
поднята до **$1/мес** (тоже 2026-10-01); потолок операции **1 цент** не менялся;
глобальный бюджет среды **$10**. Цены: вход **$0.10/MTok**, выход **$0.50/MTok**
(`provider.ts`, проверены 2026-09-25).

| Purpose | Для чего | Данные, покидающие контур | Граница ПД | task_type | Оценка цены | Что требуется |
|---|---|---|---|---|---|---|
| `extraction` (C1) | поля вакансии из текста | только текст вакансии | **совместим** (`buildJobOnlyPrompt`) | `job_extraction` существует (лимит 2 попытки) | ≈0.03 цента/пост (1.7k вход + ~300 выход) — потолок 1 цент покрывает ~30 постов | решение владельца о purpose + запись в whitelist |
| `dedup-confirm` (C5) | подтверждение пары near-dup | два текста вакансий | **совместим** | нового нет → миграция task_type | ≈0.06 цента/пара (2×1.5k вход) | purpose + миграция task_type + лимит попыток |
| `matching-scoring` (C2) | рубрика «подходит» для топ-K | **факты кандидата** (профиль) | **отказывает** (`PURPOSES_NEEDING_CANDIDATE_FACTS`) | `job_matching` существует | ≈0.7–0.94 цента/выдача топ-50 — потолок 1 цент почти весь; квота $1 → ≈106–147 выдач/мес | узкое прочтение §4.4 доктрины №3 (владелец) ИЛИ локальная модель; затем purpose + возможный пересмотр потолка |
| `hyde` (research A2) | гипотетическая вакансия из резюме | **резюме кандидата** | **отказывает** | нового нет → миграция | вход-доминанта ≈0.02 цента/резюме | то же решение о приватности + purpose + миграция |
| `eval-judge` (C6) | судейство пар вакансия↔профиль | **факты кандидата** | **отказывает** | нового нет → миграция | ≈0.1–0.2 цента/пару | то же решение о приватности + purpose + миграция |

Честная рамка: два purposes (job-only) совместимы с границей уже сегодня и требуют
только записи в whitelist (+миграция для `dedup-confirm`); три остальных упираются в
**одно** решение владельца — §4.4 доктрины №3 («допускаем ли передачу фактов профиля
третьей стороне»), и это решение переиспользуется здесь, а не решается заново.
Ни одна строка этих purposes в код не добавлена: whitelist и есть механизм одобрения.

## Проверки

`npm run test:db` — **62/62** (+4 новых свойства-теста); `npm run check` — зелёный;
продуктовый код не менялся (только тесты + документы), `build`/`e2e` не затронуты —
зафиксировано честно.

## Откат

Удалить 4 теста (diff тривиален); продуктовое поведение не менялось. Пакет purposes —
документ; отзыв решения = не добавлять запись в whitelist.

## Следующий шаг

Решения владельца из пакета (минимум: `extraction` как первый job-only purpose —
он открывает C1). Либо, до решений, любая C-строка, не требующая передачи данных
наружу.
