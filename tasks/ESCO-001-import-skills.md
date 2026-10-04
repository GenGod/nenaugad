# ESCO-001 — подключение skills-части ESCO в справочник навыков (решение владельца 2026-10-02)

**Статус: исполнена (implemented), 2026-10-04.** Локальные проверки выполнены
(см. «Результат»), приёмка — за владельцем. Основание: решение владельца по пункту
E.6 партии №4 после дословного чтения условий (официальный ESCO Handbook, §5
«Legal conditions applying to the ESCO service», извлечено из PDF 2026-10-02).

**Что разрешено — дословно (handbook §5):**
- обязательная атрибуция при использовании ESCO: **«This service uses the ESCO
  classification of the European Commission.»**;
- **«Any modified or adapted version of ESCO must be clearly indicated as such.»**;
- occupations-часть основана на ISCO (© International Labour Organization 2012,
  «can be adapted and reproduced with permission») — **в эту задачу не входит**;
- skills-часть — ЕС; reuse регулируется Decision 2011/833/EU (текущая политика
  Комиссии по legal notice: CC BY 4.0, атрибуция + указание изменений).

**Границы задачи (skills-часть).**
1. Получить ESCO skills (версия v1.2.1 / release v5.7.0; портал требует принять
   privacy statement и получить ссылку на скачивание — это явное действие с
   внешним сервисом, а не фоновое). Артефакт версионируется как артефакт (по
   образцу B1: ревизия + sha256, в git не хранится).
2. Построить **дельты алиасов** к `src/domain/skills.ts` v2 — не заменять словарь
   целиком: дельты проходят review, что и v1→v2, с метрикой точности на
   golden-наборе; пороги ratchet не опускаются.
3. Атрибуция: строка «This service uses the ESCO classification of the European
   Commission.» — в интерфейсе (минимально: статус/футер; точка размещения —
   при реализации) и в `docs/DEPENDENCIES.md` вместе с Decision 2011/833/EU и
   пометкой «adapted version».
4. Русское покрытие: ESCO мультиязычен (есть ru) — расширение русских алиасов
   из ESCO ru-набора измеряется тем же способом, что A3-001 (worklist,
   unknown-токены каталога).

**Проверки при исполнении:** `npm run check`, `test:db`, `build`,
`npm run eval:matching` (точность/NDCG не ниже порогов), guardrails — источник
контента оформляется по правилам источников (purpose-specific review).

**Откат:** удалить артефакт и дельты (словарь возвращается к v2); строку
атрибуции убрать вместе с данными.

## Разведка канала (2026-10-04)

- Открытый ESCO REST API (`https://ec.europa.eu/esco/api`, software v1.1.3,
  release notes 28/08/2025) обслуживает датасет **v1.2.1** («third iteration of
  1.2.1»). Параметр `selectedVersion=v1.2.1` подтверждён: `search?...type=skill`
  отдаёт total **13 939** навыков; без pin («latest») — 13 485, это другая, более
  узкая выборка. Версия в задаче пинится этим параметром.
- Email-gated скачивание с портала не требуется: тот же датасет доступен через
  открытый API. Артефакт собирается постранично (`search`, limit=100, 140 страниц,
  лейблы всех 28 языков; полные документы концептов — точечно по совпавшим URI)
  и в git не хранится: манифест с датой/sha256 — `data/esco-manifest.json`,
  страницы — `data/esco/` (gitignored).
- **Уточнение к пункту 4 плана: в ESCO нет русского языка.** API отдаёт 28
  языков: ar + 24 официальных ЕС + is + no + en-us. «ESCO ru-набор» не существует;
  русские алиасы остаются нашей собственной работой (v2), RU-часть пункта
  исполняется как повторное измерение worklist (unknown-токены каталога), а не
  как импорт ru-лейблов.

## План исполнения

1. `scripts/esco-fetch.ts` + `npm run esco:fetch` (fetch / `--check` / `--propose`):
   артефакт v1.2.1, манифест sha256, offline-предложение кандидатов мэппинга и
   дельты из локального артефакта.
2. Review кандидатов → `src/domain/skills-esco.ts`: мэппинг канонов на концепты
   ESCO (URI + лейблы из артефакта) и дельта алиасов (только многословные
   EN-лейблы, прошедшие инварианты v2; иные — с обоснованием).
3. `src/domain/skills.ts` → v3: дельта ESCO мержится рядом с ALIAS_DELTA_V2;
   тесты инвариантов; пороги ratchet не опускаются.
4. Атрибуция: «This service uses the ESCO classification of the European
   Commission.» + пометка адаптации (футер), `docs/DEPENDENCIES.md`
   (Decision 2011/833/EU, legal notice CC BY 4.0, ISCO/ILO вне scope).
5. Измерения: `npm run eval:matching` до/после (accuracy, NDCG, worklist),
   `check`, `test:db`, `build`, `test:e2e` (обновление visual-базлайнов:
   футер меняется на всех страницах).
6. Откат: удалить `data/esco*`, `src/domain/skills-esco.ts`, дельту v3 и строку
   атрибуции.

## Результат (2026-10-04)

Канал получения: открытый ESCO REST API (software v1.1.3, release notes
28.08.2025) обслуживает датасет **v1.2.1**; версия пинится `selectedVersion=v1.2.1`
(13 939 навыков; без пина `latest` — другая, меньшая выборка, 13 485). Артефакт:
полные документы навыков, 140 страниц, 180 МБ, лейблы всех 28 языков; собран
`npm run esco:fetch` (sha256-пины в `data/esco-manifest.json`, сами файлы в git не
хранятся). Две неочевидные особенности API задокументированы в скрипте: `offset` —
это **номер страницы**, а не смещение в записях; `full=true` капит страницу на 100
записей независимо от `limit` (интуитивное чтение обоих даёт пустые страницы на
глубине — проверено живьём).

Ревью мэппинга и дельты (`npm run esco:fetch -- --propose`; решения зафиксированы
в `src/domain/skills-esco.ts`):
- **50 связей** «наш канон → концепт ESCO» по 33 из 83 канонов: точные совпадения
  лейблов (SQL, JavaScript, C#, MySQL, English…), скобочные («Python (computer
  programming)», «Swift (computer programming)») и через альтернативные лейблы
  (business intelligence ↔ «BI», ICT encryption ↔ «TLS»/«SSL», Hadoop ↔ наш
  alias «hadoop»).
- **Дельта алиасов v3: 8 канонов, 11 алиасов** — business intelligence, apache
  hadoop, c sharp, information security, it security, statistical analysis,
  artificial neural networks, supervised/semi-/unsupervised learning, programme
  management. Правила ревью (в заголовке `skills-esco.ts` и тестах): только
  многословные терминоподобные лейблы; не фразы-способности, не версии/издания,
  не исторические имена; без коллизий.
- **Ложные друзья отклонены и записаны:** «.NET» — альт-лейбл концепта Visual
  Basic; «transformers» — «electrical machines»; «Canvas» — концепт LMS;
  техно-имена (AngularJS, OpenCV, bash, tensorflow) сидят в альт-лейблах
  обобщённого «computer programming» / «computer vision». Вывод: альт-лейблы
  ESCO не импортируются оптом — только поштучно через review.
- Честное ограничение мэппинга: у многих бренд-инструментов концептов в ESCO нет
  (Docker, Kubernetes, Terraform, MongoDB, Redis, Elasticsearch, SQLite, AWS/GCP/
  Azure, Nginx, React Native, Flutter, Node.js, Go, Rust…).

**Русская часть — уточнение премисы пункта 4:** в ESCO **нет русского языка**
(28 языков API: ar + 24 официальных языка ЕС + is + no + en-us). «ESCO ru-набор» не
существует; русские алиасы остаются собственной работой проекта (v2) и из ESCO не
происходят. Повторный замер worklist: 95 distinct unknown / 119 вхождений (не
изменился); RU-неизвестные — инженер(3), обучение(2), разработка(2), тестов(2) —
из ESCO закрыть невозможно; морфология — отдельная задача (как и записано в v2-тестах).

**Атрибуция:** «This service uses the ESCO classification of the European
Commission.» + пометка адаптации («Словарь псевдонимов навыков — адаптированная
версия ESCO (v1.2.1)») — в футере, на каждой странице; e2e-тест
(`design-system.spec.ts`). Условия — `docs/DEPENDENCIES.md` (Decision 2011/833/EU,
Commission legal notice CC BY 4.0, occupations-часть ISCO/ILO вне scope).

**Измерения:** `npm run eval:matching` до (v2, `reports/local/esco-001-before.txt`)
и после (v3, `…-after.txt`) — метрики **в точности нейтральны**: R@5 0.611 ·
R@10 0.850 · NDCG@5 0.875 · NDCG@10 0.892 · MRR 1.000, guards unjudged/hidden 0/0.
Ни один добавленный лейбл не встречается в 39 постах golden-набора, поэтому дельта
покупает покрытие для будущих постов, а не счёт сегодня; пороги ratchet не
опускались и не поднимались, запись об этом — в `tests/unit/matching-eval.test.ts`.

**Проверки (все — локально, exit code 0):** `npm run esco:fetch` (fetch + проверка
мэппинга по артефакту), `npm run esco:fetch -- --check` (артефакт verified),
`npm run check` (244/244 unit, lint, typecheck), `npm run test:db` (57/57, БД
локальная), `npm run build`, `npm run test:e2e` (99 passed; визуальные базалайны
обновлены — футер изменился на всех страницах), `npm run eval:matching`.

**Файлы:** `scripts/esco-fetch.ts`, `src/domain/skills-esco.ts`, `src/domain/skills.ts`
(v3-мерж), `tests/unit/skills-esco.test.ts`, `tests/unit/matching-eval.test.ts`
(запись замера), `src/components/shell.tsx` (футер),
`tests/e2e/design-system.spec.ts`, `tests/e2e/visual.spec.ts-snapshots/*` (регенерация),
`docs/DEPENDENCIES.md`, `data/esco-manifest.json` (пины; сам артефакт `data/esco/` —
gitignored), `package.json` (`esco:fetch`), `.gitignore`.

**Не выполнено / ограничения:** связей 33/83 канонов (ESCO — концептуальный
справочник, не каталог инструментов); эффект дельты на golden-метрики не наблюдаем
по построению набора; визуальная приёмка футера — за владельцем (скриншоты
обновлены); расход coding-host — unknown (как и прежде).

**Откат:** удалить `data/esco/`, `data/esco-manifest.json`, `src/domain/skills-esco.ts`;
в `src/domain/skills.ts` убрать импорт и мерж ESCO-дельты, вернуть версию 2; убрать
строку атрибуции из футера, тесты `skills-esco.test.ts` и запись в
`docs/DEPENDENCIES.md`; после отката — `npm run check` и `npm run eval:matching`.
