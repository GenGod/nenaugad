# AI-002 — the GPT-6 Luna provider: transport, prices, budgets

**Result:** the openai SDK is connected (exact-pin, `maxRetries: 0`), the
transport `gpt-6-luna` implements the gateway interface; the prices/budgets
are initialized; the guardrails are updated; everything is tested with a mock
transport. The gateway stays disabled until a separate "enable it" from the
owner.

**Approved by the owner 2026-09-25:**
- Provider/model: OpenAI `gpt-6-luna`
- Prices (verified developers.openai.com): input $0.10/MTok, output $0.50/MTok
  (short context, standard)
- Operation ceiling: 1 cent (10_000 micro-cents)
- User quota: 50 cents/month (500_000 micro-cents)
- Total environment budget: $10 (10_000_000 micro-cents)
- Purpose: `cover_letter` only
- SDK: `openai` with `maxRetries: 0`

## Acceptance
1. The `openai` SDK added exact-pin; `maxRetries: 0` in the constructor.
2. Guardrails: `openai` removed from the forbidden list (the owner approved).
3. Transport (`src/server/ai/openai-transport.ts`): implements
   `ModelTransport.dispatchOnce` — exactly one call, no internal retry;
   computes the actual cost in micro-cents (integer, ceil) from usage;
   network/timeout failures → `{kind:"uncertain"}`; the kill switch is checked
   before dispatch.
4. Provider config (`src/server/ai/provider.ts`): the model ID, the prices in
   micro-cents/MTok (integer), the purpose whitelist.
5. The budgets are initialized by a seed script: global $10, owner $0.50/month.
6. Tests: a mock transport for all the gateway scenarios; real calls — only
   after a separate "enable it".

**Risk:** high (money). **Rollback:** delete the transport/env key.
