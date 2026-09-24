# ADR-001: маленький S0, не новая AI-платформа

## Решение
Один Next.js App Router проект с TypeScript, встроенные server routes,
PostgreSQL как будущий основной storage. В S0 fixture repository — default;
PostgreSQL repository — явный опциональный локальный режим того же приложения.
Клиентской авторизации, auth-заглушки, аккаунта «admin по умолчанию» нет.

Worker/очередь появляются при первой реальной фоновой задаче. Это не требует
сейчас ставить Redis, Temporal или писать собственный универсальный планировщик.
В S1 выбрать один готовый механизм согласно SP 1.0. Существующие unit-проверки
не имитируют будущую распределённую идемпотентность.

## Границы
`domain` не импортирует Next, pg или provider SDK.
`data` содержит только именованные синтетические примеры.
`server/catalog-service` выбирает repository и не подставляет данные при сбое БД.
`server-only` защищает Next-границу для серверных адаптеров.
В server config любой live/production флаг отклоняется. Обхода в браузере нет.

`atlas_demo_jobs` хранит только synthetic. Это НЕ production canonical jobs.
Source records, job variants, candidate/letter tables появляются по реальным
контрактам в соответствующих задачах. Не мигрировать личные данные в эту таблицу.

## Почему не полноценный функционал сразу
Сейчас нет рисков обработки реальных CV/писем, потому что нет соответствующих
API и форм. Цена нулевая по application inference потому что нет transport.
Это не доказательство готовности privacy/finance: до активации они реализуются
и тестируются отдельно. `disabled.ts` всегда throw, а не недоделанный live client.

## Что не выбрано
Нет отдельного Fastify API, универсального gateway-сервиса, vector DB, model router,
SSO-платформы, биллинга и публичного deploy. Нет mock-auth с опасным переходом в prod.

## Установка и воспроизводимость
Точные direct versions получены из доступных официальных материалов/реестров.
npm resolution в среде поставки недоступен. Реальный lockfile и peer dependency
проверка — незавершённая часть S0, а не фиктивно выполненная работа.
После первой принятой установки только `npm ci`; обновления — отдельные малые задачи.

## Поведение при ошибке
Invalid search -> явное сообщение / API 400.
DB unavailable -> сообщение / API 503, без fallback.
Hidden or missing record -> 404, в том числе при прямом обращении.
AI/profile/upload -> явно не реализованы, без передачи данных.
`/api/health` — liveness, не readiness.

## Ограничения UI
Начальный UI на русском; архитектура не объявляет RU/EN runtime готовым.
Текст не проходит через dangerous HTML, нет внешних логотипов или генеративных ссылок.
CSP ограничивает local starter, но допускает inline scripts для Next; это не финальная
production CSP. Return from detail currently goes to catalog root; exact scroll/filter
restoration is a later UX task, not silently claimed implemented.
