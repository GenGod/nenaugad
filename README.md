# Nenaugad — a local project under Solo Pipeline SP 1.0

One TypeScript / Next.js App Router project, approved Atlas 1.1 design,
small end-to-end tasks; risky features are implemented with their own gates
([SAFETY_GATES](docs/SAFETY_GATES.md)) and are off until an owner decision.
The project was renamed by the owner from Atlas to **Nenaugad** (2026-09-24);
the design-language name Atlas 1.1 and its original artifacts are kept.

**This is not a finished beta.** Auth, private profiles, CV intake, import of real
sources, letters and the financial ledger are implemented and locally verified; but
restore, a public deploy and owner acceptance do not exist, and live AI calls are forbidden
until `LIVE_AI_ENABLED` is `true` (currently `false`).

## Important delivery boundary

Installation and the full check cycle were performed on the owner's working machine:
a real `package-lock.json` in git; `check`/`lint`/`typecheck`/`build`,
`test:db` on an isolated PostgreSQL and Playwright e2e are green; S0-001 was accepted
2026-09-24. [reports/DELIVERY.md](reports/DELIVERY.md) keeps the record of the preparation
environment (23.09); the current facts and numbers are in `IMPLEMENTATION_STATUS.md`.

This is not a promise of a production build: the beta is closed (see `docs/SAFETY_GATES.md`).

## What is already in the code

- Nenaugad 1.3 design system and all screens: catalog, matching, profile, CV,
  letters, saved, «что нового» [What's new], status.
- Auth and private versioned profiles (owner from the session only).
- Import of two approved sources (Himalayas, Jobicy): policies, worker,
  canonicalization, attribution and provenance, closure-checks.
- Deterministic eligibility gate (pass/fail/unknown, DST-accurate window) and the A1
  golden set with an eval harness and ratchet thresholds.
- CV intake txt/md/docx/pdf — offline, behind the `UPLOADS_ENABLED` flag.
- Letters: private CRUD, versions, validator, If-Match, evidence panel.
- AI contour behind the guarded gateway: budgets, operation ceiling, `npm run ai:holds`,
  the `LIVE_AI_ENABLED` switch; personal data does not leave the contour.
- SQL migrations, fixture/PostgreSQL adapters, unit/integration/Playwright tests,
  CI and working instructions.
- Production is rejected by config; live AI calls are forbidden.

There are no third-party CVs, contacts, font binaries or fabricated letters. A provider key
may sit in the local environment, but it is not a switch. The catalog data are
real posts from two approved sources with attribution; the synthetic fixtures
remain as a separate demo set.

## Requirements

The recommended Node is given in `.nvmrc`; `package.json` allows Node 22.16+ in the 22
line and Node 24.x. Node uses type stripping to run TypeScript directly;
this does not replace `tsc`. The main UI is Next.js, not a home-grown HTTP framework.

A first look needs Node/npm and npm access during installation.
Docker is needed only for the PostgreSQL mode. Browser installation is needed for E2E.
On Windows WSL2 is convenient; the npm scripts themselves do not depend on Bash.

## First local run

From the root of the `nenaugad` repository:

```sh
npm run setup
npm run check:offline
npm install
npm run check
npm run build
npm run dev
```

Open `http://127.0.0.1:3000`.

`npm run setup` saves `.env` with a random local DB password and the mode
`DATA_BACKEND=fixture`. A repeated run does not overwrite the file and does not print secrets.
After installation, keep `package-lock.json` in git. Subsequent clean installs are
`npm ci`. Do not silently replace the verified dependencies with `latest`.

For the first installation it is useful to run `npm audit` and work through the result.
Do not apply `npm audit fix --force` without understanding the version change.

## Checks

```sh
npm run check:offline
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

`check:offline` = tokens consistency + static guardrails + unit tests.
It does NOT start Next.js, React, SQL, network integrations or the linter.
`check` adds Biome and a full TypeScript check, but requires npm dependencies.
Playwright starts its own separate local server on port 3100, without reuse.
`retries=0` does not mask flakiness with a repeated successful run.

The UI scenarios are specified for 320, 390 and 1440 px. This is not a full WCAG audit.
Ownership, uploads, the ledger and the AI gates are covered by their own unit/integration tests;
restore is not implemented, and it cannot be declared passed because the feature is absent.
The list of known gaps is [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md).

## Local PostgreSQL

An `.env` from `npm run setup` must exist first.

```sh
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
```

In `.env` change **only** `DATA_BACKEND=fixture` to `DATA_BACKEND=postgres`,
restart `npm run dev`. The web application now reads the same synthetic set from the DB.

The container publishes PostgreSQL only on `127.0.0.1:54329`. The scripts allow only
the local databases `atlas_starter` and `atlas_starter_test`. This is a dev-environment safeguard,
not a verified production configuration and not a universal DB client.

Migrations use a transaction, an advisory lock and a checksum. A repeated seed does not change
unchanged rows. There is no automatic truncate/drop. `docker compose down`
keeps the volume; `down -v` will delete it — do not use without an owner decision.

### Integration tests

Create a separate test database:

```sh
docker compose exec db createdb -U atlas atlas_starter_test
```

In `.env` set `TEST_DATABASE_URL` with the same local password, but the database
`atlas_starter_test`. Do not publish the URL and do not commit `.env`.

```sh
npm run test:db
```

If the DB already exists, there is no need to repeat `createdb`. Without a test
configuration the tests end with an error, not a false success/skip.
The test database checks migrations, seed, reading and the prohibition of non-synthetic records.
This is not an emulator: running it really requires PostgreSQL.

## Structure

```text
src/app/                     Next pages + read-only routes
src/components/              small Nenaugad components
src/domain/                  pure rules (eligibility gate, ranker, embeddings, events)
src/data/                    synthetic fixtures only + golden set
src/server/                  configuration, source gate, repository, profiles
src/server/ai/               guarded AI contour (gateway, ledger, data boundary)
src/server/import/           source adapters, pipeline, closure-checks
src/server/cv/               offline CV intake behind the flag
src/server/letters/          private letters
migrations/                  catalog, profile, journal and vector schema
scripts/                     setup, tokens, migrate/seed, worker, eval, guardrails
tests/unit/                  run by the built-in Node test runner
tests/integration/           a real separate PostgreSQL
tests/e2e/                   a real Next + Playwright
tasks/                       one active task contract
docs/solo/context/           original specs and contracts, read per task
```

`StarterJob` is an intentionally small synthetic starter type; not a rename of
the full Nenaugad domain schema. The real source uses the real contracts
from `docs/solo/context/03_DOMAIN_CONTRACTS.schema.json`.

## Working with a coding agent from day one

Start with [START_HERE.md](START_HERE.md) and task S0. There is an `AGENTS.md` at the root.
`CLAUDE.md` only points to it; there is no separate set of competing rules.

```sh
npm run task -- show
npm run task -- repair "New testable hypothesis about the observed error"
```

The command records the used repair cycle in `tasks/current.json` and rejects a third one.
This is a working log, not a sandbox system protected from editing. An agent has no right
to change/reset the counter in order to bypass it; the limits of the external coding tool are set
by the owner. If the host's billing is unavailable, the spend is called unknown.

After every result, `IMPLEMENTATION_STATUS.md` and the factual report are updated.
`implemented`, `tested locally`, `verified with provider`, `accepted`
are distinguished. Only the owner can accept a result.

## CI

`.github/workflows/ci.yml` does not deploy the application and does not use AI keys.
CI requires a real `package-lock.json`; its absence produces a clear error.
It deliberately does not run the non-reproducible `npm install` instead of `npm ci`.
After S0, check the Actions and pin their SHA before a real public process.

Action runs may consume your account quota. The repository is created on
GitHub and receives pushes to `main`; before relying on the public workflow,
check the Actions and pin their full SHA (see [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)).

## Design

Source Serif 4 / Inter are specified as families with system fallbacks. Font files
are not included, there are no external font/CDN requests. After fonts are connected separately,
repeat the line-breaking check. `npm run tokens` derives the CSS from the source JSON;
manual edits to the generated CSS are detected by `npm run tokens:check`.

The card has no fake match-percent, no fake save and no active apply
to a fictional company. The whole feed is explicitly labelled as a demo.

## What to do next

S0–S4 and the AI batches are done; the current work front is [docs/OPEN_GAPS.md](docs/OPEN_GAPS.md)
(section E — owner decisions) and «Следующий шаг» [Next step] in `IMPLEMENTATION_STATUS.md`.
The nearest candidates: bringing the batch path back per the AI-006 plan, switching the feed to
the ranker (the A9 gates are ready), cross-language extension of the golden set.

Do not enable production by replacing a flag. First complete
[SAFETY_GATES](docs/SAFETY_GATES.md) for the specific feature.
