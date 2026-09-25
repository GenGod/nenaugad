# AI-002 — провайдер GPT-6 Luna: транспорт, цены, бюджеты

**Результат:** openai-SDK подключён (exact-pin, `maxRetries: 0`), транспорт
`gpt-6-luna` реализует интерфейс шлюза; цены/бюджеты инициализированы;
guardrails обновлены; всё протестировано с mock-транспортом. Шлюз остаётся
выключенным до отдельного «включай» владельца.

**Утверждено владельцем 2026-09-25:**
- Провайдер/модель: OpenAI `gpt-6-luna`
- Цены (verified developers.openai.com): input $0.10/MTok, output $0.50/MTok
  (short context, standard)
- Потолок операции: 1 цент (10_000 micro-cents)
- Квота пользователя: 50 центов/месяц (500_000 micro-cents)
- Общий бюджет среды: $10 (10_000_000 micro-cents)
- Purpose: `cover_letter` только
- SDK: `openai` с `maxRetries: 0`

## Приёмка
1. `openai` SDK добавлен exact-pin; `maxRetries: 0` в конструкторе.
2. Guardrails: `openai` удалён из forbidden-списка (владелец утвердил).
3. Транспорт (`src/server/ai/openai-transport.ts`): реализует
   `ModelTransport.dispatchOnce` — ровно один вызов, без внутреннего retry;
   считает фактическую стоимость в micro-cents (integer, ceil) из usage;
   сетевые/таймаут-сбои → `{kind:"uncertain"}`; kill switch проверяется
   до dispatch.
4. Провайдер-конфиг (`src/server/ai/provider.ts`): model ID, цены
   micro-cents/MTok (integer), purpose whitelist.
5. Бюджеты инициализированы сид-скриптом: global $10, owner $0.50/мес.
6. Тесты: mock-транспорт по всем сценариям шлюза; реальные вызовы — только
   после отдельного «включай».

**Риск:** высокий (деньги). **Откат:** удалить transport/env ключ.
