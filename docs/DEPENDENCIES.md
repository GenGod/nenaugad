# Зависимости и границы проверки

Дата подготовки: 23 сентября 2026. Это не автоматическое подтверждение npm-установки.

| Компонент | Выбранная версия | Основание |
|---|---|---|
| Next.js | 16.3.6 | Официальное сообщение об обновлении безопасности от 22.09.2026 |
| React / React DOM | 19.3.0 | Официальный выпуск React 19.3 и метаданные react/latest |
| pg | 8.23.0 | Страница пакета владельца node-postgres |
| next-auth | 4.24.15 | Реализация auth S2-001 (scrypt-креденшелы, owner только из сессии); версия закреплена точно, без диапазона |
| openai | 7.23.0 | AI-002 (решение владельца 2026-09-25): единственный разрешённый provider SDK. Импорт разрешён статически только `src/server/ai/openai-transport.ts` (`npm run guardrails`); SDK auto-retry выключен по контракту |
| @huggingface/transformers | 4.3.0 | Решение владельца 2026-09-30 (бриф §7.2, задача B1): локальный инференс эмбеддингов. Версия закреплена точно (без диапазона) и проверяется `npm run guardrails`; тянет `onnxruntime-node` 1.30.0, `sharp`, `@huggingface/tokenizers` — нативные бинарники |
| Модель эмбеддингов | `onnx-community/Qwen3-Embedding-0.6B-ONNX` @ `c25a394d`, int8, 1024 dim | Решение владельца №2 (2026-09-30, §6.2): Apache-2.0, 32K контекст, last-token pooling, инструкция только на стороне запроса. Веса — не npm-пакет: скачиваются `npm run models:fetch` с закреплённым sha256 (`src/domain/embeddings.ts`), в git не хранятся; смена — по `docs/EMBEDDING_PLAYBOOK.md` |
| ESCO skills (внешний классификатор) | датасет v1.2.1 через ESCO REST API v1.1.3 (`selectedVersion=v1.2.1`, 13 939 навыков; release notes API 28.08.2025) | Решение владельца E.6 (2026-10-02): подключена только skills-часть, как источник псевдонимов навыков. Артефакт — `npm run esco:fetch` (sha256-пины в `data/esco-manifest.json`), в git не хранится. © European Union; reuse с атрибуцией (Decision 2011/833/EU; Commission legal notice — CC BY 4.0), помечен как адаптированная версия; occupations-часть (ISCO/ILO) вне scope |
| PostgreSQL local image | pgvector/pgvector:0.8.6-pg17 | Решение владельца 2026-09-30 (пункт 1 §7): векторы хранятся в pgvector. Образ везёт PostgreSQL 17.11 (Debian 12) — та же версия, что и прежний `postgres:17.11-alpine`, поэтому каталог данных совместим напрямую (проверено репетицией на копии тома); расширение `vector` 0.8.6 включается миграцией 0016 |
| TypeScript | 5.9.3 | Выбрана известная фиксированная версия, не обещание latest |
| Biome | 2.2.4 | Официальный version history |
| Playwright Test | 1.62.1 | Страница пакета Microsoft |
| Рекомендуемый Node | 24.21.0 | Официальный archive ветки 24 |
| Node фактической офлайн-проверки | 22.16.0 | Локальная среда поставки |
| TypeScript ограниченной локальной проверки | 5.8.3 | Уже установленный compiler среды, не полный lock проекта |

Type declarations в package.json — фиксированные стартовые версии.
Peer dependencies, transitive dependencies, установка native binaries и поддержка
всей комбинации должны быть проверены в S0. npm-проба в среде поставки дала
DNS EAI_AGAIN; lockfile и npm audit не выполнялись. Нельзя заявлять отсутствие
уязвимостей по списку direct dependencies.
*(Обновление 2026-10-02: в среде подготовки S0 эти проверки действительно не
выполнялись; на рабочей машине владельца установка выполнена, настоящий
`package-lock.json` создан и лежит в git, S0-001 принят 2026-09-24. Актуальные
факты и числа — `IMPLEMENTATION_STATUS.md`.)*

## ESCO skills (внешний контент, не job-источник)
Решение владельца E.6 (2026-10-02) после дословного чтения ESCO Handbook §5.
Используется только skills-часть ESCO: датасет **v1.2.1** через открытый ESCO REST
API (software v1.1.3, release notes 28.08.2025; `selectedVersion=v1.2.1` → 13 939
навыков). Артефакт (полные документы навыков, 140 страниц, лейблы всех 28 языков)
скачивается `npm run esco:fetch`, каждый файл проверяется sha256, пины —
`data/esco-manifest.json`; сами файлы в git не хранятся. Мэппинг канонов на
концепты и дельта псевдонимов — `src/domain/skills-esco.ts` (reviewed; дельта
входит в словарь v3), изменение — через предложение `npm run esco:fetch --
--propose` и review, не автоматически.

Условия использования (дословно по handbook §5 и legal notice Комиссии):
- обязательная атрибуция «This service uses the ESCO classification of the
  European Commission.» размещена в футере интерфейса и проверяется e2e-тестом;
- «Any modified or adapted version of ESCO must be clearly indicated as such.» —
  словарь псевдонимов навыков является адаптированной версией ESCO и помечен как
  таковой (футер и заголовок `src/domain/skills-esco.ts`);
- reuse регулируется Decision 2011/833/EU; текущая политика Комиссии
  (Commission legal notice) — CC BY 4.0: атрибуция + указание изменений;
- occupations-часть ESCO (ISCO-08, © ILO 2012) в проект не входит и не скачивается.
Ограничение, зафиксированное честно: **в ESCO нет русского языка** (28 языков API:
ar, 24 официальных языка ЕС, is, no, en-us). Русские псевдонимы словаря —
собственная работа проекта и из ESCO не происходят.
Откат: удалить `data/esco*` и `src/domain/skills-esco.ts`, убрать дельту v3 и строку
атрибуции (см. `tasks/ESCO-001-import-skills.md`).

## Первичные источники
- https://nextjs.org/blog/nextjs-security-update-september-22-2026
- https://nextjs.org/docs/app/getting-started/installation
- https://react.dev/blog/2026/09/09/react-19-3
- https://registry.npmjs.org/react/latest
- https://www.npmjs.com/package/pg
- https://node-postgres.com/features/queries
- https://node-postgres.com/features/transactions
- https://www.postgresql.org/docs/17/
- https://nodejs.org/en/download/archive/v24
- https://nodejs.org/api/typescript.html
- https://biomejs.dev/internals/changelog/version/2-2-4/
- https://www.npmjs.com/package/@playwright/test
- https://nextjs.org/docs/app/guides/testing/playwright
- https://www.npmjs.com/package/@huggingface/transformers
- https://ec.europa.eu/esco/api/
- https://ec.europa.eu/esco/api/doc/release_notes.html
- https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX

GitHub Actions starter использует major tags checkout/setup-node v4, не выдаёт их
за immutably pinned supply chain. Перед activation рабочего CI проверьте Actions
и закрепите полный актуальный SHA в отдельном reviewed diff. Workflow не имеет
production secrets, write permission или deploy. Не используйте pull_request_target
для запуска кода недоверенного PR.

## Установка
Первый раз `npm install`: реальный dependency resolver создаёт lockfile.
После review/сохранения lockfile — `npm ci`.
Не писать package-lock руками и не скрывать peer conflict опцией --force.
При недоступной выбранной версии проверить официальный registry/release,
предложить совместимую поддерживаемую замену и сохранить причину изменения.
Не откатывать Next на уязвимую версию ради успешного build.
