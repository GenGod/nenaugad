# EDEC-002 — доводка партии решений №4 (решения владельца 2026-10-02)

**Результат:** пять решений владельца записаны и исполнены; зарегистрированы две
следующие задачи.

## Решения и что сделано

1. **Локальный скоринг → спайк на CUDA.** Зарегистрирована
   [MODEL-002](MODEL-002-gpu-spike.md): замер на RTX 5060 (8 ГБ) с моделью 7–8B
   той же матрицей, что MODEL-001; GPU-рантайм — единственная новая зависимость
   (варианты: Node WebGPU без зависимостей → llama.cpp CUDA → onnxruntime CUDA),
   выбор фиксируется в отчёте задачи.
2. **E.5 (фильтры «не показывать компанию X») → оставить как есть.** Скрытие
   вакансии + весовое понижение окрестности (A6-002) уже работают; возврат при
   накоплении данных.
3. **E.6 (ESCO) → условия прочитаны дословно, решение — подключать skills-часть.**
   Источник: официальный ESCO Handbook (PDF), §5 «Legal conditions applying to
   the ESCO service» + copyright notice; извлечено 2026-10-02 примитивами
   `src/server/cv/pdf.ts` в одноразовом скрипте (без изменений в репозитории;
   CV-парсер оставлен с его лимитом 30 страниц). Цитаты:
   - «© European Union, 2019. Reuse is authorised provided the source is
     acknowledged. The reuse policy of European Commission documents is regulated
     by Decision 2011/833/EU»;
   - «When using ESCO, end users need to acknowledge its use by publishing the
     statement below: "This service uses the ESCO classification of the European
     Commission."»;
   - «Any modified or adapted version of ESCO must be clearly indicated as such.»;
   - occupations-часть: ISCO-08, «© International Labour Organization 2012 …
     can be adapted and reproduced with permission» — вне задачи;
   - общая политика Комиссии (commission.europa.eu/legal-notice_en): CC BY 4.0,
     атрибуция + указание изменений.
   Зарегистрирована [ESCO-001](ESCO-001-import-skills.md).
4. **E.7 (email) → остаётся in-app.** `send_email` denied во всех матрицах;
   email-канал — отдельная задача позже.
5. **Мелкая правка интерфейса → кнопки убраны, бейджи помечены.** Причина, а не
   вкус: скоринг закрыт границей персональных данных (AI-007) и замером MODEL-001,
   поэтому обе кнопки AI-анализа всегда отвечали 503. Изменено:
   `src/components/relevance-buttons.tsx` — `RelevanceButton` и
   `BatchAnalyzeButton` удалены (мёртвые обработчики), `ScoreBadge` помечен
   «AI-оценка (справочно): N/100»; `src/app/matched/page.tsx` — вместо строки с
   кнопкой честная пометка «новые не считаются — скоринг закрыт до локальной
   модели», бейдж рендерится только при наличии кэшированного скора. Охраняемый
   маршрут `/api/v1/relevance` не тронут — он остаётся точкой подключения
   локальной модели.

## Проверки (2026-10-02)

`npm run check` → exit 0 (**241/241**, biome, tsc чисто); `npm run build` → exit 0;
`npm run test:e2e` → **96 passed** (страница подбора на fixture-бэкенде вкладки не
рендерит — базлайны не тронуты); `npm run check:offline` → exit 0. Провайдер не
вызывался; сеть — чтение публичных страниц/PDF ESCO и Commission legal notice.

**Ограничения, названные честно:** сама правка интерфейса покрыта типами, build и
e2e-базлайнами, но не кликовым e2e — на fixture-бэкенде подбор честно пуст (та же
оговорка, что в A6-001); визуальную проверку страницы делает владелец.

**Откат:** `git revert` коммита — кнопки и прежние подписи возвращаются; маршрут и
кэш скоров всё это время не менялись.
