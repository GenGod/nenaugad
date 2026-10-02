# RET-001 — retention: TTL журнала и tombstone закрытых записей (решение владельца №4, пункт 4)

**Результат:** retention перестал удалять записи источника и получил горизонт
журнала. Просроченная/закрытая запись источника становится **tombstone**: id,
source, даты и content_hash остаются, текст и производные векторы удаляются,
lifecycle → `tombstoned`; повторный листинг **возрождает** запись с исходным
провенансом. Журнал показов/кликов живёт **12 месяцев** и чистится проходом
воркера. Миграция 0018 применена локально.

**Не входит:** retention других таблиц (письма, профили, кэш скоров — у них свои
правила); изменение окна политики источника (720 ч остаётся).

## Что изменено

- `migrations/0018_job_tombstones.sql` — `job_snapshots.tombstoned_at` + комментарий;
  значение `tombstoned` для lifecycle контракт уже допускал (`source-contracts.ts`),
  поэтому обезличивание не ломает валидатор: `title`/`company_name`/
  `description_text` — обычные строки, `source_url` сохранён (требуется как http-URL
  и остаётся провенансом).
- `src/domain/snapshot-projection.ts` — `tombstoneSnapshot()` (идентификаторы и
  даты живут, проза уходит) и `StoredSnapshot.tombstonedAt`.
- `src/server/storage/snapshots.ts` — `deleteExpired` заменён на
  **`tombstoneExpired`**: UPDATE вместо DELETE (jsonb обезличивается, lifecycle
  меняется, уже-томбстоуны не трогаются — идемпотентно), затем удаление векторов
  для только что обезличенных (FK-каскад больше не срабатывает, а вектор — производное
  удалённого текста). `loadStore`/`saveStore` читают и пишут `tombstoned_at`.
- `src/server/import/himalayas-adapter.ts` — интерфейс `tombstoneExpired`, отчёт
  `tombstoned`, memory-двойник с той же семантикой; `jobicy-adapter.ts` — тот же
  отчёт.
- `src/server/import/pipeline.ts` — новая ветка **`revived`**: запись, помеченная
  tombstone, при повторном листинге возвращает текст, версию+1 и сохраняет
  исходный `first_seen_at`; отсутствующие томбстоуны не пересчитывают misses
  (retention владеет их горизонтом).
- `src/domain/events.ts` / `src/server/events-service.ts` — `EVENT_RETENTION_MONTHS
  = 12` (записанная причина: горизонт ранжирования + минимизация) и
  `purgeExpiredEvents`; `scripts/worker.ts` — проход `events_purged` каждый тик
  (отключается `--no-retention`), поле отчёта `tombstoned`.

## Проверки (2026-10-02)

- `npm run check` → exit 0 (**241/241** unit, biome 210, tsc чисто);
- `npm run test:db` → exit 0 (**57/57**): tombstone с проверкой пустого текста и
  сохранённого hash/first_seen, идемпотентность второго прохода, возрождение
  (`revived`, версия+1, исходный `first_seen_at`), TTL журнала (старое удаляется,
  свежее остаётся), вектор уходит с текстом;
- `npm run build` → exit 0; `npm run test:e2e` → **96 passed**;
- `npm run db:migrate` на рабочей БД → `{"migrationsApplied":1}`.

**Тест поймал реальный баг до коммита:** `setUTCFullYear(year − 12)` вычитал
12 **лет** вместо месяцев — исправлено на `setUTCMonth(month − 12)`.

## Ограничения, названные честно

- Обезличиваются title / company_name / description_text / excerpt;
  структурные подполя (например, `schedule.original_text` в условиях найма) не
  вычищаются — это короткие технические пометки, не текст вакансии; если владелец
  захочет строже, это отдельное уточнение решения.
- `dedupKey` томбстоуна вырожден (title/company пусты) — на отображении это не
  сказывается (неактивные записи исключаются до группировки), а дедупу служат
  id + content_hash, которые сохранены.
- Записи `closure_checks` томбстоуна остаются (история доступности); проход
  закрытия их больше не трогает (`lifecycle='active'` — фильтр).

**Откат:** `git revert` коммита; колонка `tombstoned_at` остаётся (аддитивная,
игнорируется прежним кодом); уже обезличенные записи откатом не восстанавливаются —
текст возвращается только повторным листингом источника.

**Расходы:** coding-host — `unknown`.
