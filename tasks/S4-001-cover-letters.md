# S4-001 — письма: приватный CRUD, редактор, генерация через GPT-6 Luna

**Результат:** вошедший пользователь создаёт письмо из вакансии, генерирует
черновик через GPT-6 Luna (полный стек AI-предохранителей), редактирует,
видит версии, копирует/скачивает TXT, удаляет. Всё ownership-scoped.

**Не входит:** general mode (без вакансии), сравнение версий side-by-side,
autosave с debounce (явное сохранение кнопкой), repair loop, needs_input
детекция (v1: сырой ответ в черновик, валидатор — следующий срез),
job-evidence панель «На чём основано», конфликт вкладок (If-Match заготовка).

**Контекст:** CL 1.0 полностью; ТЗ 4.1-4.3; SP 7 (письмо); AI-001/002.

## Приёмка
1. Миграция 0010: `cover_letters` (owner, job_id, status, current_version)
   + `cover_letter_revisions` (letter FK, version, body, origin, model,
   content_hash, created_at). Ownership CHECK через FK на users.
2. POST `/api/v1/cover-letters` {jobId} → создание без AI-вызова; 409 если
   уже есть письмо для этой пары user+job.
3. POST `/api/v1/cover-letters/{id}/generations` → через executeGuardedOperation
   (резерв → dispatch → settlement); ответ модели сохраняется как новая
   ревизия (origin=generated); 402 при исчерпании бюджета; Idempotency-Key
   обязателен (заголовок).
4. PATCH `/api/v1/cover-letters/{id}/draft` {body, expectedVersion} →
   новая ревизия (origin=user_edited); 409 при конфликте версий.
5. GET `/api/v1/cover-letters/{id}` → документ + ревизии + current.
6. GET `/api/v1/cover-letters/{id}/export?format=txt` → text/plain.
7. DELETE → удаление письма и ревизий.
8. UI `/letters/[id]`: редактор (textarea), статус (generated_checked/
   user_edited_unchecked), версии (список + выбор), «Скопировать»,
   «Сохранить TXT», «Создать черновик» (кнопка AI-генерации с уведомлением
   об обработке через OpenAI), удаление. ВAtlas 1.1 стиле.
9. Вход из подбора: кнопка «Составить письмо» на карточке /matched.
10. Тесты: integration (ownership, версии, 409, бюджет), e2e (создание →
    генерация → редактирование → TXT).

**Риск:** высокий (paid AI + персональные данные). **Откат:** миграцию не
откатывать; AI-вызовы контролируются бюджетом.
