# Atlas Starter — status

## Сейчас
Новый проект создан как один Next.js/TypeScript starter по SP 1.0.
Активная задача: [S0-001](tasks/S0-001-install-and-verify.md).
Владелец ещё не принимал этот код.

| Область | Код | Фактическая проверка |
|---|---|---|
| Чистые правила synthetic-каталога, config/source gate | Implemented | См. reports/DELIVERY.md |
| Atlas UI / Next pages и routes | Implemented | Полный Next не запускался без npm |
| PostgreSQL migrate/seed/repository | Implemented | Не запускалось без PostgreSQL/pg |
| Playwright-сценарии | Implemented | Реальный Next E2E не запускался |
| Runtime AI | Not implemented | Disabled gate, не генератор |
| Auth, profile, upload, letters | Not implemented | Не принимать реальные данные |
| Budget ledger / worker / реальный source | Not implemented | Обязательны до соответствующей активации |
| Production / beta | Blocked | Требуются другие задачи и решение владельца |

Точные отчёты и ограничения: reports/DELIVERY.md.
Первое действие следующего исполнителя — установка зависимостей и квалификация S0,
а не create-next-app и не включение модели.
