# ADR-001: a small S0, not a new AI platform

**Update 2026-10-02 (FDOC-001).** The ADR decisions stand: one Next.js project,
Postgres as the only storage, without a vector DB service, model router, queues and
a new API layer. But the «Сейчас» [Now] section below describes the starting stage and is stale in fact:
since then auth and private profiles (S2), import of two approved sources
with a worker (S1), CV intake behind a flag (S3), private letters (S4) and the guarded
AI contour with a spending ledger (AI-001…AI-007; live calls are forbidden until
`LIVE_AI_ENABLED` is `true`) have appeared. The current state is in `IMPLEMENTATION_STATUS.md`,
the open gaps are in `docs/OPEN_GAPS.md`. The statements below marked
«устарело 2026-10-02» [stale 2026-10-02] are kept as a record of the decision, not as a description of the code.

## Decision
One Next.js App Router project with TypeScript, built-in server routes,
PostgreSQL as the future main storage. In S0 the fixture repository is the default;
the PostgreSQL repository is an explicit optional local mode of the same application.
There is no client-side authorization, no auth stub, no «admin по умолчанию» [admin by default] account.

A worker/queue appears with the first real background task. This does not require
installing Redis or Temporal now, or writing one's own universal scheduler.
In S1 choose one ready-made mechanism according to SP 1.0. The existing unit checks
do not simulate future distributed idempotency. *(Stale 2026-10-02:
idempotency and the atomic reserve are implemented in `src/server/ai/spending.ts` and
covered by `tests/integration/ai-guards.test.ts`; worker S1-004 is one process,
concurrency 1, as decided here.)*

## Boundaries
`domain` does not import Next, pg or a provider SDK.
`data` contains only named synthetic examples.
`server/catalog-service` chooses the repository and does not substitute data when the DB fails.
`server-only` protects the Next boundary for server adapters.
In the server config any live/production flag is rejected. There is no bypass in the browser.
*(Stale 2026-10-02: `UPLOADS_ENABLED=true` and `LIVE_AI_ENABLED=true` are explicit
local switches with an owner decision; production and unknown values
are still fail-closed (`src/server/config.ts`).)*

`atlas_demo_jobs` stores synthetic only. This is NOT production canonical jobs.
Source records, job variants, candidate/letter tables appear according to the real
contracts in the respective tasks. Do not migrate personal data into this table.

## Why not full functionality at once
Right now there are no risks of processing real CVs/letters, because the corresponding
API and forms do not exist. The cost is zero for application inference because there is no transport.
This is not proof of privacy/finance readiness: before activation they are implemented
and tested separately. `disabled.ts` always throws, and is not an unfinished live client.
*(Stale 2026-10-02: CV forms and letters are implemented (S3/S4) with their own gates;
`disabled.ts` was deleted — its role was taken by the gateway `src/server/ai/gateway.ts`, which
refuses fail-closed before money; scoring and letters are closed by the personal data
boundary until a local model, and not by a stub.)*

## What was not chosen
There is no separate Fastify API, universal gateway service, vector DB, model router,
SSO platform, billing and public deploy. There is no mock-auth with a dangerous transition to prod.

## Installation and reproducibility
Exact direct versions were obtained from the available official materials/registries.
npm resolution is unavailable in the delivery environment. The real lockfile and the peer dependency
check are an unfinished part of S0, not work fictitiously performed.
After the first accepted installation, only `npm ci`; updates are separate small tasks.

## Behaviour on error
Invalid search -> an explicit message / API 400.
DB unavailable -> a message / API 503, without fallback.
Hidden or missing record -> 404, including on direct access.
AI/profile/upload -> explicitly not implemented, with no data transfer.
*(Stale 2026-10-02: they are implemented and act by their own rules — AI only through the
guarded gateway (live calls are forbidden without `LIVE_AI_ENABLED=true`, scoring and
letters are closed by the personal data boundary), the profile behind auth and ownership,
CV behind `UPLOADS_ENABLED` with a gate on all routes; see `docs/OPEN_GAPS.md`.)*
`/api/health` is liveness, not readiness.

## UI limitations
The initial UI is in Russian; the architecture does not declare the RU/EN runtime ready.
Text does not pass through dangerous HTML, there are no external logos or generative links.
The CSP restricts the local starter, but allows inline scripts for Next; this is not the final
production CSP. Return from detail currently goes to catalog root; exact scroll/filter
restoration is a later UX task, not silently claimed implemented.
