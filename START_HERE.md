# Nenaugad: day one

> **Status 2026-10-02.** This is an archived record of the first day of delivery. Since then
> S0–S4 and the AI batches have been completed; the current state is in `IMPLEMENTATION_STATUS.md`,
> the open items are in `docs/OPEN_GAPS.md`. Everything below that says «не реализовано» [not implemented]
> refers to the original template; the AI contour exists, is off and is guarded
> (`LIVE_AI_ENABLED=false`, personal data does not leave the contour).

This is a starting repository, not yet another plan. It must be continued,
not replaced by a new project generation.

## Human start

1. Unpack the archive and open `nenaugad` in an editor with a coding agent.
2. Read `README.md` and `reports/DELIVERY.md`.
3. Use the Node from `.nvmrc` or a supported version from `package.json`.
4. `npm run setup` will create a local `.env` without overwriting an existing one.
5. `npm run check:offline` runs checks without installing dependencies.
6. In an environment with npm access run `npm install`, check the result and keep
   the real `package-lock.json` in git. Then `npm run check`, `npm run build`,
   the Playwright browser installation and `npm run test:e2e`.
7. `npm run dev` opens Next.js on loopback only. PostgreSQL is a separate
   explicitly chosen local mode from the README, not a requirement for a first look.

None of the commands here call models or send CVs.
`npm install` and the browser installation download ordinary dependencies. Do not pass
production secrets to the agent. Run `git init`, commit and push deliberately and separately.

## First message to another AI

```text
This is a new Nenaugad, but the base repository already exists. Read AGENTS.md,
START_HERE.md, reports/DELIVERY.md and the task tasks/S0-001-install-and-verify.md.

Do not create a second starter. Finish verifying this one: if npm is available, install
the pinned direct dependencies, create a real lockfile, run check,
build, Playwright and the integration tests on a separate local PostgreSQL.

Do not pass off offline tests as a check of Next.js/PostgreSQL. If installation is unavailable,
record the blocker and do not invent a lockfile or results.

Do not enable live AI, real sources, upload and production. After the checks,
present a factual report on S0 and propose moving to S1-001.
Work in SP 1.0: one small task, at most two repair cycles,
without changing the approved Atlas 1.1 design.
```

## Where to look

`src/` — the application and data; `tests/` — unit/integration/E2E.
`tasks/` — the current task, S0 and the first real source.
`docs/solo/` — SP 1.0 and the original documents as needed.
`docs/ARCHITECTURE.md` — boundaries and decisions.
`docs/SAFETY_GATES.md` — what must be implemented before risky features.
`reports/DELIVERY.md` — what actually ran during preparation.

Do not load all of `docs/solo/context` into every session.
