# E2E-001 — the e2e suite passes from a cold dev server

**Status: implemented and tested locally 2026-11-02; not accepted.** Requested by the DS-002
session: the e2e cold-start failures found while verifying
[DS-002](DS-002-signal-design-language.md) and [DS-002b](DS-002b-signal-strip.md) are test
infrastructure, separate from the design work. Branch `claude/upbeat-dhawan-22c5a1`,
fast-forwarded to `feature/ds-002-signal` (`fdc0bb1`) so it carries the DS-002 visual
warm-up this task removes.

## Result and boundaries

**Result:** `npm run test:e2e` passes in full, twice in a row, with the compose database up,
including on a checkout whose `.next/dev` holds a Turbopack cache from other code, which is
the condition that failed the DS-002 and DS-002b runs.

**Symptom (DS-002b run):** 114 passed, 9 failed: all desktop and first in the run (7 in
`account.spec.ts`, 2 in `catalog.spec.ts`). Call logs show the page reloading
(`net::ERR_ABORTED`, "waiting for navigation to finish", "navigated to /login" three times
while the submit button stays disabled). The same tests pass at 390 and 320 px, which run
after desktop. The A/B in DS-002 shows the same failure on the pre-DS-002 code (`570685b`).

**Not included:** upgrading Next.js and acting on its upgrade notice (see "Open"); any
change to assertions, per-assertion timeouts or retries (`retries: 0` stays).

**Owner decision 2026-11-02** (relayed by the DS-002 session, the owner's words "Yes,
option A"): only the Playwright test server (`ATLAS_ENV=test`) skips Next's agent upgrade
notice, through `experimental.agentUpgrade: false`; `npm run dev` and `npm run build` keep
it. No Next upgrade, and nothing from the notice's instructions acted on.

**Risk:** low. Test infrastructure: two Next config values that change only when
`ATLAS_ENV=test`, a port override for Playwright, and a removed test hook. No app code,
rules, storage or API.

## Root cause

Not the cold compile. Next 16 keeps a persistent Turbopack dev cache in
`.next/dev/cache/turbopack` (`experimental.turbopackFileSystemCacheForDev`, default on), and
the e2e server shares `.next/dev` with `npm run dev`. In the main checkout that cache is
241 MB, written by dev servers that ran long enough to persist it, while the code changed
underneath (the DS-002 edits, the A/B's stash). Served from a cache built on other code,
pages reload in a loop: every load connects to HMR, receives an update
(`[Fast Refresh] rebuilding` … `done`) and reloads, about 200 times per 30-second test.
Fresh worktrees never show it: Playwright kills its server before Turbopack persists
anything, so their cache stays empty.

## Investigation (2026-11-02)

Environment: this worktree, `npm ci` from the lockfile, compose database up (port 54329).
The worktree has no `.env` of its own (writing one is denied here), so the main checkout's
`.env` was loaded into the environment without printing it (`node --env-file=…` for
Playwright, `set -a; . .env` for a hand-started server). Playwright starts its web server
with `{...process.env, ...webServer.env}`, so the dev server sees the values Next would
read from `.env`. Server output captured with `DEBUG=pw:webserver`, browser side with
`--trace on`.

| Run | Cache in `.next/dev` | Specs (desktop unless noted) | Result |
|---|---|---|---|
| 1 | none | account + catalog | server stopped by the upgrade notice after 4 requests; 15/15 failed (`ERR_CONNECTION_REFUSED`) |
| 2 | none | account + catalog | 15/15 passed; `/login` first compile 353 ms |
| 3 | none persisted (Playwright kills the server first) | account + catalog | 15/15 passed |
| full | none | all 3 projects | 123/123 passed (2.2 min) |
| 4 | 172 MB, persisted by `next dev` on `570685b`; code `fdc0bb1` | account + catalog | **7 failed** (every account test, 30 s timeouts), 8 passed; 1,798 `GET /login` |
| 5 | same cache, unchanged on disk | account + catalog | **8 failed** (7 account + "open catalog…": "navigated to /" in a loop), 7 passed; 2,291 `GET /login` |
| fix | same cache, unchanged on disk | account + catalog | 15/15 passed (27 s); 8 `GET /login` |

Runs 2–5 and the fix run started after a throwaway `next dev` start had stopped on the
upgrade notice (see below), so that the measured start continued past it.

Run 4/5 traces: no failed request (every response 200 or 304). Each of ~203 page loads per
test logs `[HMR] connected`, `[Fast Refresh] rebuilding`, `[Fast Refresh] done`, then
reloads; the server logs `✓ Compiled in 1ms` before each `GET /login`.

Ruled out on the way: a second dev server sharing the output (`next dev` locks
`.next/dev/lock`, so a second one exits at startup); a dev worker restart (that happens
only on a `next.config.*` change, the deletion of `.next` or `.next/dev`, or heap use above
80 % of the limit, each with a warning on stderr; none appeared); files rewritten by
`next dev` (none).

**Next.js's agent upgrade notice stops the server in the middle of a run (separate
issue; the e2e side closed by the owner's decision above).** `experimental.agentUpgrade` defaults to `'security'` in 16.4.0. When
`@vercel/detect-agent` finds a coding agent in the environment (`AI_AGENT`, `CLAUDECODE`, …),
the dev worker starts an advisory check as an unawaited promise
(`server/lib/router-server.js`) after "Ready". 16.4.0 is listed in the npm security
advisories, so the check stops the process (`printAndExit(…, 1)`) unless a retry receipt
younger than 5 minutes exists in `.next/dev/cache/next-agentic-upgrade-retries/` (written
by the stopped start, consumed by the next one). Under an agent, every other `next dev`
start dies a few seconds after "Ready", so two runs in a row cannot both pass (run 1
above). The owner's own terminal and CI do not detect an agent, so no check runs there.

## Changes

- `next.config.ts`: `experimental.turbopackFileSystemCacheForDev` is off when
  `ATLAS_ENV=test` (the Playwright web server; also the `nenaugad-fixture` preview in the
  main checkout's local `.claude/launch.json`). The e2e server neither reads nor writes the
  persisted cache, so every run compiles the current code from scratch; `npm run dev` keeps
  its cache. Checked: the cache's files kept their 11:37 UTC timestamps through all later
  runs.
- `next.config.ts` (owner decision): `experimental.agentUpgrade` is `false` when
  `ATLAS_ENV=test`, `"security"` (Next's default) otherwise. `ATLAS_ENV=test` is also set
  by the CI job (whose build detects no agent, so nothing changes there) and by the
  `nenaugad-fixture` preview in the main checkout's local `.claude/launch.json`, which
  skips the notice too. Without the advisory check the DevTools "1 Insight" security
  badge is gone from the e2e pages; no screenshot changed (the visual tests passed
  against the committed PNGs).
- `playwright.config.ts`: `E2E_PORT` (default 3100) sets the server port and `baseURL`,
  so two checkouts can run the suite at once; validated as a number before it reaches the
  web server command. The two checkouts still share one database, and the visual
  authed flow reuses fixed accounts, so concurrent runs can still collide there.
- `tests/e2e/visual.spec.ts`: the DS-002 `beforeAll` warm-up is removed. Its premise (the
  first compile of a route reloads the page) is contradicted by runs 2, 3 and full, and
  all four verification runs passed without it. The `nextjs-portal` removal in `shot()` stays.
- No global warm-up was added: it would not help, because a warmed `/login` loops the same way.

## Checks (2026-11-02)

| Command | Result |
|---|---|
| `npm run test:e2e`, run 1 (cache fix only) | exit 0, **123 passed** (1.8 min); the stale `570685b` cache on disk |
| `npm run test:e2e`, run 2 (right after) | exit 0, **123 passed** (1.7 min) |
| `E2E_PORT=3101 npm run test:e2e`, run 3 (with option A) | exit 0, **123 passed** (1.9 min); agent variables set; no notice line |
| `E2E_PORT=3101 npm run test:e2e`, run 4 (right after) | exit 0, **123 passed** (1.9 min); no notice line |
| `npm run dev` (no `ATLAS_ENV`), agent variables set | exit 1 after "Ready" with Next's notice: dev keeps it, as decided |
| `npm run check` (after option A) | exit 0: unit 377/377, lint, typecheck, guardrails, tokens, icons |

All e2e runs: compose database up, the main checkout's `.env` in the environment, the
stale cache on disk. Runs 1–2 (before the owner's decision) had `AI_AGENT`/`CLAUDECODE`
unset for the command, as in the owner's terminal, because Next's notice would otherwise
stop one of the two starts; runs 3–4 kept them set. Nothing listened on 3100 during runs
3–4 (sampled every 5 s). Not run: `npm run build`, `test:db`, `test:coverage` (no source,
migration or build path changed beyond dev/test-only config), CI (nothing pushed), and e2e
inside the main checkout (another session's tree; the stale cache was reproduced here
instead).

## Repair log

**Cycle 1:** "The first desktop tests fail because the e2e dev server restores the
persisted Turbopack dev cache in .next/dev/cache/turbopack written by a next dev on other
code, and pages served from it reload in a loop; with
experimental.turbopackFileSystemCacheForDev off for the e2e server (ATLAS_ENV=test), the
desktop account and catalog specs pass on the same stale cache that failed them in two runs
(7 and 8 failures)." Result: 15/15 on that cache, then the full suite twice — confirmed.

## Open

- Next.js 16.4.0 is listed in the npm security advisories (OPEN_GAPS §E item 6). The
  upgrade is the owner's decision; under a coding agent, `npm run dev` and `npm run build`
  still stop on every other start until then.
- `npm run dev` can hit the same reload loop after the code changes under its persisted
  cache (not tested here); deleting `.next/dev/cache/turbopack` while no dev server runs
  clears it.

**Rollback:** revert this task's commit; the old warm-up returns with it.
