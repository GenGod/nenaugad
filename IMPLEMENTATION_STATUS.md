# Nenaugad — status (ex-Atlas Starter)

## Сейчас
Проект переименован владельцем из Atlas в **Nenaugad** (2026-09-24): package name,
compose-проект/контейнер, имя CI, UI-строки и проза живых документов. Сохранены:
имя дизайн-языка Atlas 1.1 и его артефакты, исходники `Reference/` и `docs/solo/context/`,
исторические `reports/`, внутренние контракты данных (`atlas-fixtures`, `atlas_demo_jobs`,
`atlas_starter*`, `ATLAS_ENV`) — их переименование требует сброса схемы/тома БД.

Активная задача: [S0-001](tasks/S0-001-install-and-verify.md) — **accepted владельцем 2026-09-24**.
Следующая задача назначается владельцем; кандидат — [S1-001](tasks/S1-001-first-source.md)
(до owner-approval источника допустимы только контрактные фикстуры адаптера).

Toolchain по решению владельца переведён на Node 26 (2026-09-24):
`.nvmrc` = 26.7.0, `engines` дополнен линией `^26.0.0`.

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
- AI/live sources/uploads выключены; сетевых AI-вызовов нет; secret-коммитов нет (git-репозиторий не инициализирован, коммитов не было).
- Расход coding-host: unknown.

## Откат
`docker compose stop db` выполнен. Удалить последствия: удалить `node_modules/`,
`.next/`, `package-lock.json`, `.env`; `docker compose down -v` — только по решению владельца.

## Следующая небольшая задача
[S1-001](tasks/S1-001-first-source.md): один одобренный источник → сохранение → каталог.

| Область | Код | Фактическая проверка |
|---|---|---|
| Чистые правила synthetic-каталога, config/source gate | Implemented | 30/30 unit, guardrails |
| Nenaugad UI / Next pages и routes | Implemented | build + 24/24 Playwright E2E |
| PostgreSQL migrate/seed/repository | Implemented | migrate/seed x2, 3/3 integration |
| Playwright-сценарии | Implemented | Реальный Next, 320/390/1440 |
| Runtime AI | Not implemented | Disabled gate, не генератор |
| Auth, profile, upload, letters | Not implemented | Не принимать реальные данные |
| Budget ledger / worker / реальный source | Not implemented | Обязательны до активации |
| Production / beta | Blocked | Требуют решения владельца |
