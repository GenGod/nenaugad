# Nenaugad — day-one starter

Локальный шаблон для соло-разработчика по **Solo Pipeline SP 1.0**.
Один TypeScript / Next.js App Router проект, утверждённый дизайн Atlas 1.1,
маленькие сквозные задачи и выключенные рисковые функции.
Проект переименован владельцем из Atlas в **Nenaugad** (2026-09-24);
имя дизайн-языка Atlas 1.1 и его исходные артефакты сохранены.

**Это не готовая бета.** Авторизация, CV, реальные источники, платный AI и
эксплуатационные финансовые предохранители пока не реализованы.

## Важная граница поставки

В среде подготовки недоступен npm-реестр и нет Docker/PostgreSQL.
Прямые зависимости указаны точными версиями, но установка, полный typecheck,
Next build, PostgreSQL и настоящие Playwright E2E здесь НЕ выполнены.
`package-lock.json` намеренно отсутствует: его нельзя достоверно выдумать.
Первый исполнитель создаёт lockfile обычной установкой и принимает S0.

Проверенные офлайн-части и точные результаты — в [reports/DELIVERY.md](reports/DELIVERY.md).
Не считайте этот файл обещанием успешной production-сборки.

## Что уже находится в коде

- Главная, каталог, поиск и подробности синтетической вакансии.
- Фильтр постоянной полной удалёнки: hybrid, office, temporary, conflict, closed исключены.
- Неизвестная география не превращается в worldwide; персональной оценки в стартере нет.
- Исходные токены Atlas 1.1 и автоматически получаемые CSS aliases, responsive layout.
- Явные fixture/PostgreSQL адаптеры. Ошибка БД не подменяется фикстурами.
- SQL-миграция, повторяемый synthetic seed и отдельные интеграционные тесты.
- Встроенные Node unit-тесты, Playwright-сценарии, CI и рабочие инструкции.
- Production/live AI/uploads намеренно блокируются конфигурацией.

Нет настоящих вакансий, контактов, чужих резюме, API-ключей, font binaries и
выдуманных писем. PostgreSQL-режим тоже демонстрационный, не live.

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
Проверки ownership, реальных uploads, кошелька, restore и AI относятся к следующим
этапам — их нельзя объявлять пройденными по отсутствию этих функций.

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
src/domain/                  чистые правила и starter-тип
src/data/                    только синтетические фикстуры
src/server/                  конфигурация, source gate, repository
src/server/ai/                намеренно выключенная граница AI
migrations/                  локальный synthetic catalog
scripts/                     setup, tokens, migrations, task, guardrails
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

Запуски Actions могут расходовать квоту вашего аккаунта. Репозиторий здесь
не создан в GitHub, ничего не отправлено и ни один workflow удалённо не запускался.

## Дизайн

Source Serif 4 / Inter заданы как семейства с системными fallback. Файлы шрифтов
не включены, внешних font/CDN-запросов нет. После отдельного подключения шрифтов
повторить проверку переносов. `npm run tokens` получает CSS из исходного JSON;
ручные изменения generated CSS выявляет `npm run tokens:check`.

На карточке нет fake match-percent, фиктивного сохранения или активного apply
на вымышленную компанию. Вся лента явно обозначена как демо.

## Что делать после S0

[Первая реальная задача S1-001](tasks/S1-001-first-source.md):
один одобренный источник → сохранение → каталог, с контрактом, атрибуцией,
точными дублями и честной свежестью. Без approval — контрактные fixtures,
не обход запрета. Далее ручной профиль с auth, затем CV и письмо.

Не включайте production заменой флага. Сначала выполните
[SAFETY_GATES](docs/SAFETY_GATES.md) для конкретной функции.
