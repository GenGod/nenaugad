# Фактическая проверка поставки Atlas Starter 0.1

Дата: 23 сентября 2026. Объект проверки — локальный starter, не production Atlas.

**Обновление 2026-10-02 (FDOC-001).** Записи ниже — про среду подготовки 23.09
(реестр был недоступен). На рабочей машине владельца всё перечисленное в
«Заблокировано средой» с тех пор выполнено: `npm install` создал настоящий
`package-lock.json` (он в git), `check`/`lint`/`typecheck`/`build`/`test:db` на
изолированной PostgreSQL и Playwright e2e выполняются и зелёные; S0-001 принят
владельцем 2026-09-24. Актуальные факты и числа — `IMPLEMENTATION_STATUS.md`.

## Выполнено
- `npm run tokens`: CSS aliases получены из приложенного исходного Atlas JSON.
- `npm run check:offline`: 30 unit-тестов, все прошли; skipped=0; токены и статические
  guardrails прошли. Это НЕ проверка серверных Next handlers.
- `tsc -p tsconfig.core.json` с установленным compiler TypeScript 5.8.3 и локальным
  @types/node: exit 0. Проверяется только чистое ядро и unit-тесты. Не полный app.
- Syntax/transpile inspection TypeScript 5.8.3: 36 TS/TSX-файлов без синтаксических
  диагностик. Реальные Next/React/pg types не загружались.
- `npm run setup` дважды: создание приватной .env и отказ от её перезаписи.
  `.env` с локальным паролем НЕ включена в архив.
- `npm run doctor`, `npm run task -- show`: выполнены, секреты не выводятся.
- Статическая проверка layout: см. static-layout.json. Реальные компоненты
  сериализовались QA-only JSX serializer, затем HTML/CSS открывались в Chromium.
  Это не React, не Next runtime, не hydration и не E2E. Найденный min-width overflow
  в каталоге при 320 px исправлен; повторный результат отражён в JSON.

## Заблокировано средой / не выполнено
- npm registry probe вернул `EAI_AGAIN` на registry.npmjs.org.
- `npm install` dependency tree не разрешён; настоящий package-lock.json не создан.
- `npm run lint`, полный `npm run typecheck`, `npm run build`, `npm run dev` не выполнены:
  Next/React/pg/Biome и type declarations приложения не установлены.
- `npm run test:db`: не выполнено; Docker/PostgreSQL и pg отсутствуют.
- `npm run test:e2e`: сценарии написаны, но настоящий Next-сервер/Playwright Test
  не запускались. Нельзя считать статический layout тест эквивалентом.
- npm audit, dependency/Actions/image-digest verification, WCAG-аудит, pen test,
  нагрузка, restore и live sources/AI не выполнялись.
- GitHub-репозиторий не создавался, CI/deploy не запускались, подписки не покупались.

## Среда
Node 22.16.0, npm 10.9.2, доступный TypeScript 5.8.3,
Chromium 144.0.7559.96 (только статическая проверка).
Рекомендуемый toolchain для установки задан в .nvmrc/package.json.
Различие runtime/compiler среды и выбранных зависимостей явно сохраняется.

## Что не является готовой функцией
*(Запись 23.09.)* Авторизация, приватные профили, загрузка CV, worker, runtime ledger,
реальные источники и генерация писем отсутствуют. Их отсутствие и блокировка
не доказывают готовность будущей реализации.

*(Обновление 2026-10-02.)* Всё перечисленное реализовано отдельными задачами
S1–S4 и AI-001…AI-007 со своими гейтами; «реализовано» и здесь не значит
«активировано»: живые вызовы AI запрещены (`LIVE_AI_ENABLED=false`), батч-путь
закрыт, restore отсутствует.

S0-001 принят владельцем 2026-09-24 после настоящей установки и проверок;
задача [S0-001](../tasks/S0-001-install-and-verify.md) остаётся контрактом этих
проверок, а их фактические результаты — в `IMPLEMENTATION_STATUS.md`.
