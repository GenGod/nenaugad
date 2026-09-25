# Nenaugad — status (ex-Atlas Starter)

## Сейчас
[S3-001](tasks/S3-001-cv-intake.md) — **accepted and activated by the owner
2026-09-25** («коммит и включай приём»). Локальная `.env`:
`UPLOADS_ENABLED=true` (в git не попадает; код по умолчанию остаётся
fail-closed). Живая проверка включённого приёма по HTTP: регистрация →
вход → вставка CV (201) → чтение (текст совпадает) → удаление (200);
анонимно — 401.

Дальше (по решению владельца): S3-002 (PDF-текстовый слой), S2-002
(скрытие с причинами/пометка отклика), AI-предохранители (обязательны до
paid AI), третий источник, починка Docker Desktop (11 смертей за день).

**Что реализовано:** офлайн-парсер без зависимостей (`src/server/cv/parse.ts`):
вставка текста и .txt/.md (UTF-8 с проверкой обратимым декодированием),
.docx — свой минимальный ZIP-ридер (central directory; сигнатура PK главнее
расширения; шифрованные entries и >200 entries — отказ; распаковка через
`inflateRawSync` с `maxOutputLength` — зип-бомбы умирают на лимите 20 МБ, а
не в памяти), текст из `word/document.xml` (w:t + абзацы + XML-entity),
PDF отклоняется с предложением текстовой формы; лимиты fail-closed: файл
≤10 МБ, извлечённый текст ≤150 000 символов, пустой текст — ошибка;
предупреждения THIN_TEXT_LAYER/UNUSUAL_CHARACTERS. Миграция 0007 `cv_uploads`
(ownership, минимизация: исходный бинарник не хранится — только текст и
метаданные; констрейнты диапазонов). API `/api/v1/cv` (POST json/multipart,
GET список, GET/DELETE по id) — 401 без сессии, чужой id → 404, 413/400 с
человеческими сообщениями; удаление профиля удаляет и CV. Страница `/cv`
(вставка/загрузка/просмотр/удаление, предупреждения, «ничего не выводится
автоматически»), ссылка с /profile. Config: UPLOADS_ENABLED=true —
единственная разрешённая форма включения, малформированные значения
по-прежнему fail-closed (safety-тест расширен, не ослаблен).

**Проверено:** 70/70 unit (zip-строитель в тестах: happy docx, зип-бомбы
двух видов, шифрование, лимиты, роутинг по сигнатуре), 19/19 integration
(ownership: B не читает/не удаляет A; удаление профиля чистит CV;
констрейнты), check/build, e2e 33/33 (вставка→просмотр→удаление; 401).
Отладочный след: падение e2e было отсутствием миграции 0007 на dev-базе
(применена). Docker-инстабильность: 10-я гибель движка за день.

**Границы среза:** PDF-парсер, OCR и AI-извлечение — вне среза (перед paid
AI обязательны бюджеты/квоты/дедлайны по AGENTS); автозаполнения полей
профиля нет — принцип «draft ≠ факт».

Дальше (по решению владельца): S3-002 (PDF-текстовый слой), S2-002,
AI-предохранители, третий источник.

**Что реализовано:** `headJobicyListing` в allowlisted fetcher (pinned
jobicy.com, HEAD, `redirect:"error"`, таймаут 10 с; 200→active, 404/410→
inactive, 429/5xx/редирект/сеть→unknown — никогда не закрывает); миграция
0006 `closure_checks` (per-record последняя проверка + счётчик inactive);
`runClosureCheckPass` (бюджет ≤25 HEAD/час rolling — персистентно, рестарт
не сбрасывает; per-record интервал ≥6 ч; не проверяются записи из свежего
окна; закрытие только после 2 подряд inactive с интервалом; active сбрасывает,
unknown нейтрален; mass-closure guard: >50% inactive при ≥4 проверках →
`quarantined`, закрытия не применяются, результаты записываются); провенанс
и даты при закрытии не переписываются (`jsonb_set` lifecycle, контракт
валиден — проверено); воркер гоняет проход после импорт-цикла (`--no-closure`
отключает), `--status` показывает closure-статистику; «Сохранённое»
показывает закрытые с бейджем «Закрыта (источник)», каталог/подбор исключают
автоматически.

**Проверено:** 65/65 unit (классификация HEAD по всем статусам, счётчики,
guard-пороги), 17/17 integration (закрытие за 2 inactive с интервалом;
nothing_due внутри интервала; active/unknown-семантика; quarantine без
применения; бюджет 25/час с рестартом; закрытые снапшоты валидны по
контракту), check/build, живой `--status` с closure-статистикой, e2e 30/30
(в стабильное окно; 9-я гибель Docker между прогонами — прежний блокер).

Дальше (по решению владельца): S2-002, S3 (CV/parser), третий источник,
починка Docker Desktop (9 смертей за два дня).

**Что реализовано:** политика jobicy (approved, enabled=false, terms_hash
зафиксирован, valid_until 2026-12-23); миграция 0004 (job_snapshots →
мультиисточник: source_id IN (himalayas, jobicy), именованные констрейнты);
`fetchJobicyWindow` в allowlisted fetcher (pinned jobicy.com, count≤200);
маппер под живой контракт (id-число→`jobicy:{id}`, pubDate ISO+00:00→ISO,
jobGeo: Anywhere→worldwide / страна→ISO / регион→region_text без выдуманного
списка стран, jobType→employment_types, salary nullable, excerpt=jobExcerpt);
`runJobicyImport` (окно всегда partial: absence ≠ closure, miss-счётчики не
растут; poll-гейт 6ч; retention 720ч); CLI `npm run import:jobicy` (отказ
exit 1 пока выключен); read-пути обобщены на оба источника (каталог
«Внешние источники», подбор, сохранённое — с per-source атрибуцией).

**Проверено:** 57/57 unit (маппер/гейты/идемпотентность/отказы), 11/11
integration (в т.ч. jobicy в общих таблицах после 0004 + отказ чужого
источника), check/build, отказ CLI без сети. **e2e: 30/30 проходил дважды за
день в стабильные окна; текущий прогон 27/30 — три падения на 100% связаны
с окружением** (Docker Desktop умирал 6 раз; трижды зафиксирован
ECONNREFUSED 127.0.0.1:54329 при живом движке — порт-прокси). С1-003 не
меняет UI-пути, пока jobicy выключен. Цикл ремонта 1/2 — запись о блокере
окружения.

**Блокер окружения (действие владельца):** Docker Desktop нестабилен —
движок падает каждые ~10–20 минут, порт-прокси отказывает при живом движке.
Рекомендации: обновить/починить Docker Desktop, проверить лимит памяти WSL2
(.wslconfig), попробовать `wsl --shutdown`; могу добавить db-пробу в doctor.

**После review:** «коммить» + отдельно «включай Jobicy» (enabled=true →
`npm run import:jobicy` → ~200 свежих карточек рядом с Himalayas).

Итог S2-001: auth (next-auth@4.24.15, scrypt), миграция 0003 (users/профили
с версиями/saved_jobs + ownership), ручной профиль, детерминированный подбор
v1 (5 правил, 4 исхода, reason codes, AND/OR-агрегация, гейты), /matched с
объяснениями, /saved, API с 401/404-дисциплиной. Проверено: 51/51 unit,
10/10 integration (ownership-негативы), 30/30 e2e, check/build.

**Следующая задача: [S1-003](tasks/S1-003-jobicy-second-source.md) — Jobicy (назначена
2026-09-25).** Живое исследование выполнено; матрица прав ждёт решения владельца.

### Факты review jobicy (собраны 2026-09-25 с живых страниц, владельцем поручено)
- API (jobicy.com/jobs-rss-feed + github.com/Jobicy/remote-jobs-api): `GET /api/v2/remote-jobs`,
  без ключа, count 1–200 (окно последних записей, НЕ полный снимок); поля: id (число), url
  (канонический листинг Jobicy), jobTitle/companyName/jobIndustry[]/jobType[]/jobGeo/jobLevel/
  jobExcerpt/jobDescription(HTML)/pubDate(ISO+00:00)/salary*(nullable). Smoke подтверждён.
- Права: «normal integrations do not require a separate agreement»; обязательны атрибуция
  («Keep Jobicy as the original source and preserve the canonical Jobicy job URL»); нельзя
  выдавать за свои, спам-сети/вводящие в заблуждение базы запрещены; polling ≤1/час,
  кэшировать поощряется; HTML-описание санитизировать. GitHub-код MIT, но листинги не входят.
- Paid-опция: Bearer-ключ → прямой ATS URL, $0.01 за впервые полученную запись; выключена
  без бюджета. Affiliate `?u=` — не используем без решения владельца.
- Закрытие: рекомендован HEAD листинга 1–2/час; 404/410 = неактивна, иные ошибки ≠ закрытие
  (следующая задача lifecycle; в S1-003 окно всегда partial, absence ≠ closure).
- terms_hash (sha256 /jobs-rss-feed, 2026-09-25):
  97e86dc4985447f754f9de36b9e72f4723d17dab6995052e35e88aff3370698c
- Рекомендуемая матрица: fetch/cache/store_full_text/store_excerpt/derive_fields/
  publish_excerpt = allowed (атрибутация+backlink); publish_full_text/process_with_ml/
  send_to_ai_provider/train_model/send_email/index_web_page/syndicate/bulk_export/
  direct_apply = denied; apply_route=source_required; retention 720ч; poll ≥6ч;
  valid_until 2026-12-23.

## Решения владельца
- Node 26 (2026-09-24): `.nvmrc` = 26.7.0, `engines` +`^26.0.0`.
- Переименование Atlas → Nenaugad (2026-09-24).
- S0-001 принят; git init, main; коммиты f1f2ab7…e5efe11.
- Матрица прав himalayas утверждена и активирована (2026-09-24): 497 записей,
  чекпоинт; откат — enabled:false без правки UI.
- S2-001 принят 2026-09-25 (коммит ожидает слова владельца).
- Mimosa: полн. аудит не завершён (лимиты; ложные срабатывания на
  параметризованный SQL и `.exec(`/`.match(`). Безопасность не заявляется.
- Окружение: Docker Desktop падал 4 раза 24–25.09 — причина «случайных»
  падений DB/e2e; при падениях проверять движок первым.

**Что реализовано:** auth на next-auth@4.24.15 (JWT-сессия, httpOnly, Credentials;
регистрация `/api/v1/auth/register`, пароли scrypt из node:crypto); миграция 0003
(users / candidate_profiles / search_profiles с версиями / saved_jobs с ownership);
ручной профиль (страна ISO-2, IANA-зона, окна доступности, целевые роли, формы
сотрудничества, zero-mandatory-attendance, минимум зарплаты с strict/hard,
show_needs_review) — сохранение = новая версия, удаление удаляет все версии;
детерминированный движок правил v1 (`src/domain/matching.ts`: GEO-01, CONTRACT-01,
REMOTE-01, SAL-01, TIME-01 с исходами pass/fail/unknown/not_applicable и reason
codes ТЗ 13.2; агрегация AND-в-опции / OR-между-опциями; TIME-01 v1 — попадание
смещения зоны в принимаемые, с сезонной проверкой январь/июль); страницы /login,
/profile, /matched (eligible + «Нужно уточнить», ineligible скрыт, объяснение по
каждому правилу), /saved; API profile/saved/matched — 401 без сессии.

**Проверено:** 51/51 unit (правила, профиль-валидация), 10/10 integration
(scrypt/дубликаты email, версии, удаление, ownership: B не видит/не снимает
сохранённое A, FK на несуществующий снапшот), 30/30 e2e (регистрация→профиль→
честный пустой /matched на fixture→404 на сохранение несуществующего; 401 на
приватные API без сессии), check/build. Цикл ремонта 1/2 (задним числом).

**Границы:** CV/upload — S3; TIME-01 не считает перекрытие окон с DST-точностью
(версионированное расширение позже); профили не покидают локальную базу;
e2e-регистрация пишет случайные аккаунты в локальную dev-БД; CI получил
DATABASE_URL/AUTH_SECRET на e2e-шаге (эфемерный секрет CI, не production).

**После принятия:** S2-002 (скрытие с причинами/пометка отклика, postgres-e2e)
или подключение второго источника Jobicy — по решению владельца.

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
