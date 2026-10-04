# ESCO-001 — подключение skills-части ESCO в справочник навыков (решение владельца 2026-10-02)

**Статус: зарегистрирована (planned).** Основание: решение владельца по пункту
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
