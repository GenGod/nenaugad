# Nenaugad — status (ex-Atlas Starter)

## Сейчас
[S1-002](tasks/S1-002-himalayas-live-adapter.md) — **activated and accepted by the
owner 2026-09-24** («коммит и включай Himalayas»). Первый живой импорт выполнен:
25 страниц, 497 записей в `job_snapshots`, 3 отклонены маппером явно (мусор не
сохраняется), курсор-чекпоинт сохранён (полный фид ~100k — догоняется бюджетными
прогонами). Локальный режим `.env` переключён на `DATA_BACKEND=postgres`;
каталог `/jobs` рендерит демо-примеры + ~494 карточки Himalayas (excerpt,
атрибуция, backlink nofollow; полный текст хранится, но не публикуется).
Следующую задачу назначает владелец (кандидаты: S2 профиль, второй источник
Jobicy, регуляризация импорта cron/worker).

Активная политика himalayas: version 3, approved+enabled, valid_until
2026-12-23 (повторный review), retention 720ч, polling ≥24ч. Откат: `enabled:
false` — карточи исчезают без правки UI.

E2E продолжает гонять fixture-бэкенд (env в playwright.config) — счётчик
демо-каталога валиден; postgres-режим e2e — будущая задача.

## Решения владельца
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Переименование Atlas → Nenaugad (2026-09-24).
- S0-001 принят; git init, main; коммиты f1f2ab7…e31a9bd.
- Матрица прав himalayas утверждена 2026-09-24 (d48bcfe); S1-001 принят (e31a9bd).
- S1-002 закоммичен и активирован 2026-09-24 (см. git log).
- Mimosa: полн. аудит не завершён (лимиты library_source/callgraph; ложные
  срабатывания на параметризованный SQL и `.exec(`/`.match(` — обходы без
  ослабления защиты). Безопасность проекта не заявляется.

**Что реализовано:** закреплённый транспорт `src/server/import/fetcher.ts`
(единственный файл в guardrail-allowlist: pinned host, opaque-cursor валидация,
`redirect:"error"`, таймаут, лимит размера, 429/5xx классификация); live-адаптер
cursor-walk с бюджетом страниц и чекпоинтом (`himalayas-adapter.ts`, отказ при
disabled, poll-гейт ≥24ч, неудачный прогон не расходует окно); миграция 0002
(`job_snapshots` с CHECK контракта + `import_state`); PostgreSQL-хранение с
retention (720ч + expires_at − 7д); CLI `npm run import:himalayas` (отказ exit 1
пока источник выключен) и `npm run smoke:himalayas`; read-путь карточек с
атрибуцией/backlink только при включённой политике; UI-секция каталога «тёмная»
до активации. Маппер переписан под живой контракт (guid=URL→стабильный ID,
Unix-секунды, excerpt отдельно, numeric timezone hours, полный диапазон = нет
ограничения).

**Проверено:** 44/44 unit, 6/6 integration (test DB: идемпотентность, чекпоинт,
CHECK-ограничения, retention), check/build, smoke **contract_ok** на реальных
записях API, отказ CLI без сети, e2e 24/24 без регресса. Цикл ремонта 1/2
(задним числом, см. current.json).

**Активация (решение владельца):** review diff → `enabled: true` в политике →
`npm run smoke:himalayas` → `npm run import:himalayas` (по умолчанию 25 страниц,
~500 записей; полный фид ~100k — бюджетными прогонами) → обновить e2e-счётчик
каталога. Откат: `enabled: false` без правки UI; таблицы 0002 остаются.

**Политика himalayas: матрица прав утверждена владельцем 2026-09-24** (review живых
страниц API/ToS). `status: approved`, `enabled: false` — активация отдельной задачей
live-адаптера. Разрешено: fetch/cache/store_full_text/store_excerpt/derive_fields/
publish_excerpt (атрибуция+backlink обязательны). Запрещено: publish_full_text,
process_with_ml, send_to_ai_provider, train_model, direct_apply, send_email,
index_web_page, syndicate_google_jobs, bulk_export. apply_route=source_required,
retention 720ч + expiryDate, polling ≥86400с, terms_hash зафиксирован
(sha256 himalayas.app/terms на 2026-09-24), valid_until 2026-12-23 (повторный review).

**Результат S1-001:** настоящий доменный контракт (`src/domain/source-contracts.ts`,
SourcePolicy/JobSnapshot по 03_DOMAIN_CONTRACTS.schema.json, ручные валидаторы без
сторонних зависимостей), исполняемая политика источников (`src/server/source-policies.ts`),
контрактная фикстура будущего Himalayas-адаптера с детерминированным маппером
(`src/server/import/himalayas-fixture.ts`: секунды/миллисекунды, пустые locations =
worldwide только без противоречия тексту, зарплата без выдуманной валюты), идемпотентный
пайплайн импорта (`src/server/import/pipeline.ts`: дедуп по ID, content-hash, version+1
только при смене смысла, 429/5xx/неполный снимок не закрывают записи, stale после двух
полных проходов с интервалом ≥24ч, конечный retry) и UI-проекция с гейтами
(`src/domain/snapshot-projection.ts`). Сетевого транспорта в src/ нет (guardrails).

Проверено: 39/39 unit (9 новых по 7 пунктам приёмки S1), lint+tsc (49 файлов), build,
24/24 e2e, 3/3 test:db. Цикл ремонта: 1/2 (запись задним числом о дефекте классификации,
исправленном до завершения исходной реализации — см. tasks/current.json).

**Не сделано сознательно:** live fetch Himalayas (нужен owner-approval политики и отдельный
review), хранение snapshots в PostgreSQL (контрактный стор в памяти/фикстурах; схема БД не
менялась), показ карточек himalayas в UI (источник не одобрен — contribute 0 карточек,
моков нет).

## Решения владельца
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Переименование Atlas → Nenaugad (2026-09-24): package, compose-проект, CI, UI, проза.
  Сохранены артефакты дизайн-языка Atlas 1.1, Reference/, docs/solo/context/, reports/
  и контракты данных (atlas-fixtures, atlas_demo_jobs, atlas_starter*, ATLAS_ENV).
- S0-001 принят 2026-09-24; git init, ветка main, коммиты f1f2ab7, 7c5a404.
- Mimosa pre-commit полный аудит не завершил (library_source limit, callgraph partial):
  безопасность проекта не заявляется.

## Следующий шаг
Владелец: review S1-001 diff + решение по политике himalayas (approve/purpose/review).
После approve — отдельная задача live-адаптера (fetch, polling, БД-хранение).

### Факты review himalayas (собраны 2026-09-24 с живых страниц, владельцем поручено)
- API (himalayas.app/api, /docs/remote-jobs-api, openapi.json): бесплатный, без ключа;
  cursor ≤20, обновление 24ч, 429 → ждать ~60с, s-maxage=86400; кэширование на своём
  бэкенде прямо поощряется; обязательная атрибуция (link back + mention as source);
  applicationLink можно показывать с кредитом источника; запрет синдикации на
  сторонние сайты (Jooble/Neuvoo/Google Jobs/LinkedIn); locationRestrictions пустой =
  worldwide; pubDate/expiryDate в схеме Unix-мс, в прозе ISO — противоречие,
  живой smoke-тест при адаптере обязателен.
- ToS сайта: широкий запрет automated data gathering «without prior written approval»;
  механизма атрибуции вместо разрешения нет. Напряжение с API-документацией;
  письменный канал обеих страниц — hi@himalayas.app (он же для повышенных лимитов).
- Рекомендация владельцу: до approve — запросить письменное подтверждение (вариант 2);
  либо approve по API-условиям с матрицей: fetch/cache/store/derive/publish_excerpt
  allowed (атрибуция+backlink), publish_full_text/direct_apply/ML/AI/email/seo/syndicate/
  train/bulk denied, apply_route=source_required, retention 720ч + expiryDate,
  polling 86400с. Решение и approve — только владелец.

## Фактические результаты S0-001 (2026-09-24, Node v26.7.0, npm 12.0.2, Windows)

| Команда | Результат | Exit |
|---|---|---|
| `npm run setup` | создана приватная `.env` (fixture mode), секреты не выводились | 0 |
| `npm run check:offline` | токены (100 алиасов), guardrails, 30/30 unit | 0 |
| `npm install` | 48 пакетов; настоящий `package-lock.json` создан npm | 0 |
| `npm audit` | 0 уязвимостей | 0 |
| `npm run check` | 30/30 unit + Biome (43 файла) + `tsc --noEmit` | 0 |
| `npm run build` | Next 16.3.6 (Turbopack), 11 маршрутов, статика сгенерирована | 0 |
| `npx playwright install chromium` | Chromium headless shell 151.0.7922.34 | 0 |
| `npm run test:e2e` | **24/24** на 320/390/1440, порт 3100 | 0 |
| `docker compose up -d --wait db` | PostgreSQL healthy на 127.0.0.1:54329 | 0 |
| `npm run db:migrate` (x2) | 1 миграция; повтор — 0 применённых | 0 |
| `npm run db:seed` (x2) | 8 записей; повтор — 0 изменённых (идемпотентно) | 0 |
| `npm run test:db` | 3/3 интеграционных на отдельной `atlas_starter_test` | 0 |
| `docker compose stop db` | контейнер остановлен, volume сохранён | 0 |

Приёмка S0-001: п.1–6 выполнены и проверены реально; п.7 — владелец принял S0 (2026-09-24, «принимаю»).

## Цикл ремонта 1/2 (единственный использованный)
E2E «keyboard reaches skip link and labeled search» падал: ожидание `toHaveCount(1)`
для q=SQL противоречило осознанному подстрочному поиску `selectCatalog`
(`src/domain/job.ts:72`): «SQL» матчит и cobalt-data (skills: `SQL`), и north-backend
(skills: `PostgreSQL`). Исправлено ожидание E2E-сценария на 2 карточки
(`tests/e2e/catalog.spec.ts:50`); домен не менялся — он зафиксирован unit-тестами.
Гипотеза записана `npm run task -- repair` до ремонта, счётчик 1/2.

## Изменения файлов
- `.nvmrc`, `package.json` (engines) — решение владельца о Node 26.
- `package-lock.json` — создан npm, не моделью.
- `tests/e2e/catalog.spec.ts` — ремонт цикла 1.
- `tsconfig.json` — Next build сам добавил `.next/dev/types/**/*.ts` в include.
- `.env` — создан setup; `TEST_DATABASE_URL` заполнена из `DATABASE_URL`
  (база `atlas_starter_test`) без вывода секрета; `DATA_BACKEND` остался `fixture`.
- `tasks/current.json` — status → `implemented`, счётчик_cycles сохранён (1/2).

## Границы и не выполненное
- Проверка postgres-режима веб-приложения (`DATA_BACKEND=postgres` в dev) — осознанный
  шаг владельца по README; квалифицировано интеграционными тестами test:db.
- WCAG-аудит, pen test, нагрузка, restore, npm-registry digest verification — не выполнялись.
- AI/live sources/uploads выключены; сетевых AI-вызовов нет. Git инициализирован
  2026-09-24 (main, коммиты f1f2ab7, 7c5a404); после S1-001 новых коммитов нет —
  изменения S1 ждут review владельца.
- Расход coding-host: unknown.

## Откат
`docker compose stop db` выполнен. Удалить последствия: удалить `node_modules/`,
`.next/`, `package-lock.json`, `.env`; `docker compose down -v` — только по решению владельца.

## После приятия S1-001
Live-адаптер Himalayas (после approve политики: fetch, polling, БД-хранение snapshots)
или S2 — ручной профиль → объяснимый подбор → сохранение (по решению владельца).

| Область | Код | Фактическая проверка |
|---|---|---|
| Чистые правила synthetic-каталога, config/source gate | Implemented | 30/30 unit, guardrails |
| Nenaugad UI / Next pages и routes | Implemented | build + 24/24 Playwright E2E |
| PostgreSQL migrate/seed/repository | Implemented | migrate/seed x2, 3/3 integration |
| Playwright-сценарии | Implemented | Реальный Next, 320/390/1440 |
| Доменные контракты SourcePolicy/JobSnapshot, импорт, проекция (S1) | Implemented | 9/9 новых unit по приёмке S1 |
| Live-адаптер источника (fetch/polling/БД) | Not implemented | Требует approve политики + review |
| Runtime AI | Not implemented | Disabled gate, не генератор |
| Auth, profile, upload, letters | Not implemented | Не принимать реальные данные |
| Budget ledger / worker | Not implemented | Обязательны до активации |
| Production / beta | Blocked | Требуют решения владельца |
