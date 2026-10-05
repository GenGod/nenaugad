# Factual verification of the Atlas Starter 0.1 delivery

Date: 23 September 2026. The object of verification is the local starter, not production Atlas.

**Update 2026-10-02 (FDOC-001).** The records below concern the preparation environment of 23.09
(the registry was unavailable). On the owner's working machine everything listed under
«Заблокировано средой» [Blocked by the environment] has since been done: `npm install` created a real
`package-lock.json` (it is in git), `check`/`lint`/`typecheck`/`build`/`test:db` on
an isolated PostgreSQL and Playwright e2e run and are green; S0-001 was accepted
by the owner 2026-09-24. The current facts and numbers are in `IMPLEMENTATION_STATUS.md`.

## Done
- `npm run tokens`: CSS aliases were derived from the attached source Atlas JSON.
- `npm run check:offline`: 30 unit tests, all passed; skipped=0; tokens and the static
  guardrails passed. This is NOT a check of the server-side Next handlers.
- `tsc -p tsconfig.core.json` with the installed compiler TypeScript 5.8.3 and a local
  @types/node: exit 0. Only the pure core and the unit tests are checked. Not the full app.
- Syntax/transpile inspection TypeScript 5.8.3: 36 TS/TSX files without syntactic
  diagnostics. The real Next/React/pg types were not loaded.
- `npm run setup` twice: creation of a private .env and refusal to overwrite it.
  The `.env` with the local password is NOT included in the archive.
- `npm run doctor`, `npm run task -- show`: run, no secrets are printed.
- Static layout check: see static-layout.json. The real components were
  serialized by a QA-only JSX serializer, then the HTML/CSS was opened in Chromium.
  This is not React, not a Next runtime, not hydration and not E2E. A found min-width overflow
  in the catalog at 320 px was fixed; the repeated result is reflected in the JSON.

## Blocked by the environment / not done
- The npm registry probe returned `EAI_AGAIN` on registry.npmjs.org.
- `npm install`: the dependency tree was not resolved; a real package-lock.json was not created.
- `npm run lint`, the full `npm run typecheck`, `npm run build`, `npm run dev` were not run:
  Next/React/pg/Biome and the application's type declarations are not installed.
- `npm run test:db`: not done; Docker/PostgreSQL and pg are absent.
- `npm run test:e2e`: the scenarios are written, but a real Next server/Playwright Test
  was not started. The static layout test cannot be considered equivalent.
- npm audit, dependency/Actions/image-digest verification, a WCAG audit, a pen test,
  load, restore and live sources/AI were not performed.
- No GitHub repository was created, no CI/deploy was run, no subscriptions were purchased.

## Environment
Node 22.16.0, npm 10.9.2, the available TypeScript 5.8.3,
Chromium 144.0.7559.96 (static check only).
The recommended toolchain for installation is set in .nvmrc/package.json.
The difference between the environment's runtime/compiler and the chosen dependencies is explicitly preserved.

## What is not a finished feature
*(Record of 23.09.)* Authorization, private profiles, CV upload, a worker, a runtime ledger,
real sources and letter generation are absent. Their absence and the blockage
do not prove the readiness of a future implementation.

*(Update 2026-10-02.)* Everything listed has been implemented by separate tasks
S1–S4 and AI-001…AI-007 with their own gates; «реализовано» [implemented] here too does not mean
«активировано» [activated]: live AI calls are forbidden (`LIVE_AI_ENABLED=false`), the batch path
is closed, restore is absent.

S0-001 was accepted by the owner 2026-09-24 after a real installation and checks;
the task [S0-001](../tasks/S0-001-install-and-verify.md) remains the contract of these
checks, and their actual results are in `IMPLEMENTATION_STATUS.md`.
