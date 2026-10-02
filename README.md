# Nenaugad — локальный проект по Solo Pipeline SP 1.0

Один TypeScript / Next.js App Router проект, утверждённый дизайн Atlas 1.1,
маленькие сквозные задачи; рисковые функции реализованы со своими гейтами
([SAFETY_GATES](docs/SAFETY_GATES.md)) и выключены до решения владельца.
Проект переименован владельцем из Atlas в **Nenaugad** (2026-09-24);
имя дизайн-языка Atlas 1.1 и его исходные артефакты сохранены.

**Это не готовая бета.** Auth, приватные профили, CV-интейк, импорт реальных
источников, письма и финансовый леджер реализованы и локально проверены; но
restore, публичного deploy и допуска владельца нет, а живые вызовы AI запрещены,
пока `LIVE_AI_ENABLED` не `true` (сейчас `false`).

## Важная граница поставки

Установка и полный цикл проверок выполнены на рабочей машине владельца:
настоящий `package-lock.json` в git; `check`/`lint`/`typecheck`/`build`,
`test:db` на изолированной PostgreSQL и Playwright e2e зелёные; S0-001 принят
2026-09-24. [reports/DELIVERY.md](reports/DELIVERY.md) сохраняет запись среды
подготовки (23.09); актуальные факты и числа — `IMPLEMENTATION_STATUS.md`.

Это не обещание production-сборки: бета закрыта (см. `docs/SAFETY_GATES.md`).

## Что уже находится в коде

- Дизайн-система Nenaugad 1.3 и все экраны: каталог, подбор, профиль, CV,
  письма, сохранённое, «что нового», статус.
- Auth и приватные версионированные профили (owner только из сессии).
- Импорт двух одобренных источников (Himalayas, Jobicy): политики, worker,
  канонизация, атрибуция и provenance, closure-checks.
- Детерминированный допуск (pass/fail/unknown, DST-точное окно) и golden-набор
  A1 с eval-харнессом и порогами-ратчетами.
- CV-интейк txt/md/docx/pdf — офлайн, за флагом `UPLOADS_ENABLED`.
- Письма: приватный CRUD, версии, валидатор, If-Match, evidence-панель.
- AI-контур за охраняемым шлюзом: бюджеты, потолок операции, `npm run ai:holds`,
  выключатель `LIVE_AI_ENABLED`; персональные данные не покидают контур.
- SQL-миграции, fixture/PostgreSQL адаптеры, unit/integration/Playwright-тесты,
  CI и рабочие инструкции.
- Production отклоняется конфигом; живые вызовы AI запрещены.

Нет чужих резюме, контактов, font binaries и выдуманных писем. Ключ провайдера
может лежать в локальном окружении, но включателем не является. Данные каталога —
реальные посты двух одобренных источников с атрибуцией; синтетические фикстуры
остались отдельным демо-набором.

## Требования

Рекомендуемый Node указан в `.nvmrc`; `package.json` допускает Node 22.16+ в линии
22 и Node 24.x. Node для прямого запуска TypeScript использует type stripping;
это не заменяет `tsc`. Основной UI — Next.js, не самописный HTTP-фреймворк.

Для первого просмотра нужен Node/npm и доступ к npm при установке.
Docker нужен только для PostgreSQL-режима. Установка браузера нужна для E2E.
На Windows удобен WSL2; сами npm scripts не зависят от Bash.

## Первый локальный запуск

Из корня репозитория `nenaugad`:

```sh
npm run setup
npm run check:offline
npm install
npm run check
npm run build
npm run dev
```

Открыть `http://127.0.0.1:3000`.

`npm run setup` сохраняет `.env` с случайным паролем локальной БД и режимом
`DATA_BACKEND=fixture`. Повторный запуск не перезаписывает файл и не выводит секреты.
После установки сохраните `package-lock.json` в git. Последующие чистые установки —
`npm ci`. Не заменяйте проверяемые зависимости на `latest` молча.

Для первой установки полезно выполнить `npm audit` и разобрать результат.
Не применять `npm audit fix --force` без понимания изменения версий.

## Проверки

```sh
npm run check:offline
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`check:offline` = tokens consistency + статические guardrails + unit-тесты.
Он НЕ запускает Next.js, React, SQL, сетевые интеграции или linter.
`check` добавляет Biome и полный TypeScript check, но требует npm-зависимостей.
Playwright сам запускает отдельный локальный сервер на порту 3100, без reuse.
`retries=0` не маскирует нестабильность повторным успешным прогоном.

UI-сценарии заданы для 320, 390 и 1440 px. Это не полный WCAG-аудит.
Ownership, uploads, леджер и AI-гейты покрыты своими unit/integration-тестами;
restore не реализован, и его нельзя объявлять пройденным по отсутствию функции.
Список известных недоделок — [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md).

## Локальная PostgreSQL

Сначала должна существовать `.env` от `npm run setup`.

```sh
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
```

В `.env` измените **только** `DATA_BACKEND=fixture` на `DATA_BACKEND=postgres`,
перезапустите `npm run dev`. Веб-приложение теперь читает тот же synthetic-набор из БД.

Контейнер публикует PostgreSQL только на `127.0.0.1:54329`. Скрипты допускают только
локальные базы `atlas_starter` и `atlas_starter_test`. Это предохранитель дев-среды,
не проверенная production-конфигурация и не универсальный DB-клиент.

Миграции используют транзакцию, advisory lock и checksum. Повторный seed не меняет
неизменённые строки. Нет автоматического truncate/drop. `docker compose down`
сохраняет volume; `down -v` удалит его — не использовать без решения владельца.

### Интеграционные тесты

Создайте отдельную тестовую базу:

```sh
docker compose exec db createdb -U atlas atlas_starter_test
```

В `.env` укажите `TEST_DATABASE_URL` с тем же локальным паролем, но базой
`atlas_starter_test`. Не публикуйте URL и не коммитьте `.env`.

```sh
npm run test:db
```

Если БД уже существует, повторять `createdb` не нужно. При отсутствии тестовой
конфигурации тесты завершаются ошибкой, а не ложным успехом/skip.
В тестовой базе проверяются миграции, seed, чтение и запрет несинтетических записей.
Это не эмулятор: для запуска действительно требуется PostgreSQL.

## Структура

```text
src/app/                     Next pages + read-only routes
src/components/              небольшие Nenaugad-компоненты
src/domain/                  чистые правила (допуск, ранкер, эмбеддинги, события)
src/data/                    только синтетические фикстуры + golden-набор
src/server/                  конфигурация, source gate, repository, профили
src/server/ai/               охраняемый AI-контур (шлюз, леджер, граница данных)
src/server/import/           адаптеры источников, pipeline, closure-checks
src/server/cv/               офлайн-интейк CV за флагом
src/server/letters/          приватные письма
migrations/                  схема каталога, профилей, журнала, векторов
scripts/                     setup, tokens, migrate/seed, worker, eval, guardrails
tests/unit/                  выполняются встроенным Node test runner
tests/integration/           настоящая отдельная PostgreSQL
tests/e2e/                   настоящий Next + Playwright
tasks/                       один активный контракт задачи
docs/solo/context/           исходные ТЗ и контракты, чтение по задаче
```

`StarterJob` — намеренно маленький тип synthetic starter; не переименование
полной domain schema Nenaugad. Реальный источник использует настоящие контракты
из `docs/solo/context/03_DOMAIN_CONTRACTS.schema.json`.

## Работа с coding-agent с первого дня

Начните с [START_HERE.md](START_HERE.md) и задачи S0. У корня есть `AGENTS.md`.
`CLAUDE.md` только указывает на него; отдельного набора конкурирующих правил нет.

```sh
npm run task -- show
npm run task -- repair "Новая проверяемая гипотеза по наблюдаемой ошибке"
```

Команда записывает использованный цикл в `tasks/current.json` и отклоняет третий.
Это рабочий журнал, не защищённая от редактирования sandbox-система. Агент не вправе
менять/обнулять счётчик ради обхода; ограничения внешнего coding-инструмента задаёт
владелец. Если счёт хоста недоступен, расход называется неизвестным.

После каждого результата обновляется `IMPLEMENTATION_STATUS.md` и фактический
отчёт. `implemented`, `tested locally`, `verified with provider`, `accepted`
различаются. Принять результат может владелец.

## CI

`.github/workflows/ci.yml` не разворачивает приложение и не использует AI-ключи.
CI требует настоящий `package-lock.json`; его отсутствие даёт понятную ошибку.
Он намеренно не выполняет неповторяемый `npm install` вместо `npm ci`.
После S0 проверьте Actions и зафиксируйте их SHA перед рабочим публичным процессом.

Запуски Actions могут расходовать квоту вашего аккаунта. Репозиторий создан на
GitHub и получает пуши в `main`; перед тем как полагаться на публичный workflow,
проверьте Actions и зафиксируйте их полный SHA (см. [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)).

## Дизайн

Source Serif 4 / Inter заданы как семейства с системными fallback. Файлы шрифтов
не включены, внешних font/CDN-запросов нет. После отдельного подключения шрифтов
повторить проверку переносов. `npm run tokens` получает CSS из исходного JSON;
ручные изменения generated CSS выявляет `npm run tokens:check`.

На карточке нет fake match-percent, фиктивного сохранения или активного apply
на вымышленную компанию. Вся лента явно обозначена как демо.

## Что делать дальше

S0–S4 и AI-батчи пройдены; актуальный фронт работ — [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md)
(раздел E — решения владельца) и «Следующий шаг» в `IMPLEMENTATION_STATUS.md`.
Ближайшие кандидаты: возврат батч-пути по плану AI-006, переключение выдачи на
ранкер (ворота A9 готовы), кросс-язычное расширение golden-набора, отдельный
review удаления аккаунта.

Не включайте production заменой флага. Сначала выполните
[SAFETY_GATES](docs/SAFETY_GATES.md) для конкретной функции.
