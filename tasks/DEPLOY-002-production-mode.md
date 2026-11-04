# DEPLOY-002: production mode

**Status: accepted by the owner, 2026-11-04 ("Accept and commit").** Implemented, tested
locally and independently reviewed twice (no blocking finding) the same day; committed as
`b6f3581` on `feature/deploy-001-plan`, merged into `main` as `30690a8` and pushed at the
owner's word ("merge and push"); CI green on `30690a8` (run 41812488854). Not deployed.
The first code slice of the single-VPS plan
([DEPLOY-001](DEPLOY-001-single-vps-plan.md), section "Slices", draft criteria 1–6). The
criteria below are fixed before the code and are not adjusted to match the result.

## Result and boundaries

**User result:** on a server, `ATLAS_ENV=production` with a correct configuration starts the
app, an existing account can log in (with `Secure`, `__Secure-`-prefixed session cookies),
and nobody can sign up. A wrong configuration refuses to start and names its reason by a
fixed code, never by a value.

**Not included:** backups and restore (DEPLOY-003), sign-up of any kind (DEPLOY-004, D5),
the production CSP (DEPLOY-005), server files and the runbook (DEPLOY-006), a deploy
(DEPLOY-007), a script that creates the owner's account from the server shell (the open D5
sub-question), and the production wording of the site-wide banner and metadata («Демо-каталог
… остаются в локальной базе»), which belongs with the first deploy.

**Context.**
- [src/server/config.ts](../src/server/config.ts): `readConfig` accepts only `local|test`
  and throws `PRODUCTION_NOT_IMPLEMENTED` otherwise. `authSecret(env)` reads the secret as
  next-auth does (`NEXTAUTH_SECRET`, else `AUTH_SECRET`; empty is none). `localDatabaseUrl`
  stays unchanged: on the VPS Postgres listens on 127.0.0.1.
- [src/server/auth.ts](../src/server/auth.ts): next-auth 4.24.15, credentials only, JWT
  sessions, no `useSecureCookies`.
- next-auth 4.24.15 as installed (read in `node_modules/next-auth`, 2026-11-04):
  `core/init.js` takes `defaultCookies(authOptions.useSecureCookies ?? url.base.startsWith("https://"))`;
  `core/lib/cookie.js` `defaultCookies(true)` names the session cookie
  `__Secure-next-auth.session-token` (`secure`, `httpOnly`, `sameSite: lax`) and the CSRF
  cookie `__Host-next-auth.csrf-token`; `utils/detect-origin.js` returns `NEXTAUTH_URL`
  whenever it is set, so `AUTH_TRUST_HOST`/`VERCEL` only matter when it is not.
- [src/app/api/v1/auth/register/route.ts](../src/app/api/v1/auth/register/route.ts) and
  [src/components/auth-forms.tsx](../src/components/auth-forms.tsx) (opens in register mode,
  with a toggle) on [src/app/login/page.tsx](../src/app/login/page.tsx).
- [scripts/doctor.ts](../scripts/doctor.ts) reports `production: "blocked"` and prints
  `STARTER_CONFIGURATION_REJECTED` on any refusal; [/api/health](../src/app/api/health/route.ts)
  reports `config.environment`.
- Where `NEXTAUTH_URL` is set today: `.env.example` (`http://127.0.0.1:3000`), the owner's
  `.env` (loopback, classified without printing it). CI (`.github/workflows/ci.yml`),
  `playwright.config.ts` and `.claude/launch.json` do not set it.
- Next 16.4.5 docs (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`,
  `.../04-functions/connection.md`): a server component reads a runtime variable only while
  rendering dynamically; `await connection()` makes that explicit. Every page is dynamic
  today anyway (the root layout's header reads the session).

**Risk: high (auth, config).** xhigh effort, an independent `reviewer` pass on the diff, and
the owner's acceptance before it counts as done.

**Data:** synthetic only. The manual check logs in to a production build with a synthetic
account (`@example.invalid`, random password, never printed) created in the local database,
as the e2e suite does. `.env` is never printed. No provider call, no spend.

## Acceptance (fixed before the code)

1. **Production refusals.** `readConfig` with `ATLAS_ENV=production` returns
   `environment: "production"` only when all of these hold, and otherwise throws a
   `ConfigurationError` whose message is the code alone:
   - `DATA_BACKEND=postgres`, else `PRODUCTION_REQUIRES_POSTGRES` (unset means fixture);
   - the secret as next-auth reads it is set (`PRODUCTION_SECRET_REQUIRED`), is at least 32
     UTF-8 bytes (`PRODUCTION_SECRET_TOO_SHORT`), and is not one of the test secrets
     committed in this public repository (`PRODUCTION_SECRET_PUBLIC`; a test reads them out
     of `ci.yml` and `playwright.config.ts`, so the list cannot drift);
   - `NEXTAUTH_URL` is set and not empty (`PRODUCTION_URL_REQUIRED`), parses
     (`PRODUCTION_URL_INVALID`), starts with `https://` (`PRODUCTION_URL_NOT_HTTPS`), and its
     host is neither loopback nor unspecified (`PRODUCTION_URL_LOOPBACK`): `localhost`,
     `*.localhost`, a trailing-dot form of these, `127.0.0.0/8` in any form the URL parser
     normalises, `[::1]`, IPv4-mapped loopback, `0.0.0.0/8` and `[::]`;
   - `UPLOADS_ENABLED` is not `true` (`PRODUCTION_UPLOADS_NOT_APPROVED`): owner decision D6
     keeps uploads off until the beta decision, and opening them is a high-risk activation of
     its own. `LIVE_AI_ENABLED` stays the owner's switch (D6).
   Any other `ATLAS_ENV` (`""`, `prod`, `PRODUCTION`, `staging`) refuses `INVALID_ATLAS_ENV`.
   No refusal message contains the secret, the URL or any part of them.
2. **No sign-up in production (D5).** `POST /api/v1/auth/register` answers 403
   `{ "error": "REGISTRATION_CLOSED" }` to every request (a valid body and malformed JSON
   alike) before it reads the body or opens a database pool: tested with no `DATABASE_URL`
   set. The login page offers login only: no «Создать аккаунт» control, no «регистрация» in
   its heading, `autocomplete="current-password"`. An existing account logs in (manual check
   on a production build). In local and test, registration and the `/login` page are as
   before: the e2e account specs and the visual baselines pass unchanged.
3. **The local loophole.** In `local` and `test`, an unset or empty `NEXTAUTH_URL` is
   accepted as now (next-auth then assumes `http://localhost:3000`); a set one must parse
   (`NEXTAUTH_URL_INVALID`) and have a loopback host (`NEXTAUTH_URL_NOT_LOOPBACK`). CI,
   Playwright, `.env.example`, `.claude/launch.json` and the owner's `.env` stay valid.
4. **Cookies.** In production `authOptions.useSecureCookies` is `true`; in local and test it
   is left unset (next-auth's default). A unit test pins next-auth 4.24.15's
   `defaultCookies(true)`: `__Secure-next-auth.session-token` with `secure`, `httpOnly` and
   `sameSite: lax`, and `__Host-next-auth.csrf-token` with `secure`, so an upgrade that
   changes the default fails the test. Manual: a production build answers a login with
   `Set-Cookie: __Secure-next-auth.session-token=…; … Secure`.
5. **Reports.** `npm run doctor` reports `environment: "production"` and `signUp: "closed"`
   (`"open"` in local and test), and on a refused configuration prints
   `CONFIGURATION_REJECTED: <CODE>`. `/api/health` reports `environment: "production"`.
   Neither output contains the secret, `NEXTAUTH_URL` or the database URL (unit test with
   marker values).
6. **Tests and checks.** Unit tests cover each refusal of 1 and 3, the route of 2, the cookie
   pin of 4 and the reports of 5. The existing test "production cannot be enabled through one
   environment switch" stays and asserts the specific refusal; no security test is weakened.
   `npm run check`, `npm run test:coverage` (thresholds not lowered), `npm run build` and
   `npm run test:e2e` pass; an independent `reviewer` pass finds no blocking issue.

**Known limit (recorded, not fixed here; widened after the review):** `ATLAS_ENV=local` with
`NEXTAUTH_URL` unset *or set to a loopback address* still runs behind a reverse proxy:
next-auth then takes the loopback origin, the login form signs in without a redirect, the
cookies are not `Secure` and sign-up is open. The rule closes only the natural mistake,
setting the public address in local mode. Requiring `NEXTAUTH_URL` in local and test would
break CI and fresh checkouts; checking the `Host` header depends on the proxy. The runbook
(DEPLOY-006) must say production mode only.

## Plan

1. Tests first: `tests/unit/production-mode.test.ts` (1, 3, 4, the route of 2), the existing
   production test in `tests/unit/safety.test.ts`, the reports in
   `tests/unit/status-reporting.test.ts` (5).
2. `src/server/config.ts` (the mode, the URL rules, `signUpOpen`, `secureCookies`),
   `src/server/auth.ts`, the register route, `src/app/login/page.tsx` and
   `src/components/auth-forms.tsx`, `scripts/doctor.ts`.
3. Docs: `.env.example`, `README.md`, the config note in `docs/ARCHITECTURE.md`,
   `IMPLEMENTATION_STATUS.md`.
4. Checks, the manual production-build check, the `reviewer` pass, the report.

**Allowed areas:** the files above. **Rollback:** `git revert`; no migration, no data change.
Nothing runs in production until the owner deploys (DEPLOY-007).

## Approvals and limits

Local coding and tests only. No provider, model, budget or source change. Live AI, uploads,
real CVs and deploy stay off. Coding-host spend is not visible: unknown. Repairs: at most two
cycles, each with a new hypothesis recorded first (`npm run task -- repair`).

## Checks and report

`npm run check`, `npm run test:coverage`, `npm run build`, `npm run test:e2e`; the manual
production-build check (health, register refusal, login page, login cookies). Report: what
works, files, commands with exit codes, limitations, mock/live, costs, owner decision.

## Result (2026-11-04)

**Change.**
- [src/server/config.ts](../src/server/config.ts): `production` in `readConfig` with the refusals
  of criterion 1 (`assertProductionReady`), the loopback rule for local and test, and
  `signUpOpen` and `secureCookies`. Unknown `ATLAS_ENV` values are now `INVALID_ATLAS_ENV`
  (was `PRODUCTION_NOT_IMPLEMENTED`). `localDatabaseUrl` is unchanged.
- [src/server/auth.ts](../src/server/auth.ts): `useSecureCookies: secureCookies(process.env)`.
- [register route](../src/app/api/v1/auth/register/route.ts): config first; production answers
  403 `REGISTRATION_CLOSED`; a refused configuration answers 500 `REGISTRATION_FAILED` and logs
  its code, both before the body is read.
- [src/app/login/page.tsx](../src/app/login/page.tsx) (`await connection()`, then the mode) and
  [src/components/auth-forms.tsx](../src/components/auth-forms.tsx) (`signUp` prop): production
  shows «Вход», «Регистрация пока закрыта.», no toggle, no local-demo note,
  `autocomplete="current-password"`. Local and test render exactly as before (login mode keeps
  `new-password`, as before).
- [next.config.ts](../next.config.ts) (added after the review): the config is a function; in
  `phase-production-server` it calls `readConfig`, so `next start` exits 1 on a refused
  configuration without answering a request. Before this, `next start` ran the
  instrumentation check only on the first request (`NextServer.prepare` skips it in
  production) and stayed up, answering 500 to everything.
- [scripts/doctor.ts](../scripts/doctor.ts): `signUp`, `production: "mode_only"`, and
  `CONFIGURATION_REJECTED: <CODE>` on a refusal.
- Tests: [tests/unit/production-mode.test.ts](../tests/unit/production-mode.test.ts) (new, 14
  tests), [safety.test.ts](../tests/unit/safety.test.ts) (the production test now asserts the
  anchored code and a second refusal), [status-reporting.test.ts](../tests/unit/status-reporting.test.ts)
  (`production` `"blocked"` → `"mode_only"`, `signUp`, a production report test with markers).
- Docs: `.env.example`, `README.md`, the config note in `docs/ARCHITECTURE.md`,
  `IMPLEMENTATION_STATUS.md`.

**Beyond the draft criteria (stricter, easy to drop):** `PRODUCTION_SECRET_PUBLIC` covers all
four committed test secrets (CI, e2e and, after the review, the B11 and B54 integration
tests; the test scans `tests/`, `scripts/`, `.github/` and the root configs);
`PRODUCTION_UPLOADS_NOT_APPROVED` (D6); `ip6-localhost`, `ip6-loopback`,
`localhost.localdomain`, IPv4-compatible loopback and IPv4-mapped 0.0.0.0/8 are refused too;
a scheme-less `name:port` is `*_INVALID`; the `next start` refusal above.

**Checks** (Windows, Node 26.7.0; exit codes):
- `npm run check:agent` 0 while iterating. **Final `npm run check` 0** (tokens, icons,
  guardrails, unit 446/446, lint, typecheck), after the last change.
- `npm run test:coverage`: first run exit 1, two tests failed. Repair cycle 1, hypothesis
  recorded first: the two tests that copy a production env into `process.env` inherited
  `UPLOADS_ENABLED=true` from the local `.env` that `test:coverage` loads, so `readConfig`
  correctly refused. Confirmed (reproduced with `--env-file-if-exists=.env`); fixed by stating
  every flag in the fixtures (the re-review found one more such spot, in the `next.config`
  test, fixed the same way; the file also passes with `NEXTAUTH_SECRET=short` in the
  environment). **Final run exit 0: 587/587, 87.02 / 89.40 / 94.29.** The lines ratchet is
  raised 86 → 87 (`package.json`), as AGENTS.md asks when coverage rises; branches 89 and
  functions 94 unchanged.
- `npm run build` 0 (twice; the second after `next.config.ts` changed): every route dynamic
  (`ƒ`), `/login` included.
- **Final `npm run test:e2e` 126/126** (after the `next.config.ts` change; also 126/126
  before the review), no visual baseline changed. (`next build` rewrites the generated
  `next-env.d.ts` to `.next/types`; the e2e run's `next dev` wrote back the committed form.)
- Manual path, a real `next start` of the build with `ATLAS_ENV=production`,
  `NEXTAUTH_URL=https://nenaugad.example`, a fresh random secret, the local Postgres
  (scratch script, not in the repository):
  - `/api/health` 200 `environment: "production"`, `realAi: false`, `uploads: false`;
  - `POST /api/v1/auth/register` 403 `{"error":"REGISTRATION_CLOSED"}`;
  - `/login`: «Вход», the closed note, no «Создать аккаунт» or «У меня есть аккаунт», no
    `new-password`, no local-demo note; checked in the browser at desktop and 375 px, no
    console error;
  - a synthetic `@example.invalid` account (created in the local database, as the e2e suite
    does) logs in: `Set-Cookie: __Secure-next-auth.session-token; Path; Expires; HttpOnly;
    Secure; SameSite`, and the CSRF cookie is `__Host-next-auth.csrf-token; … Secure`. The
    session resolves (`/api/v1/digest` 409 `NO_PROFILE`, anonymous 401); the same token under
    the unprefixed name is not accepted (401). The account then deleted itself through
    `DELETE /api/v1/account` (200; the row is gone);
  - a refused configuration (`UPLOADS_ENABLED=true`): `next start` exits 1, every probe during
    its start is refused or reset, the log names `PRODUCTION_UPLOADS_NOT_APPROVED` and holds no
    secret, address or database URL;
  - no server log line held the secret.
- Independent `reviewer` (fresh context, Opus): no blocking finding. Should-fix 1 (two
  committed integration secrets were accepted) and 2 (`next start` stayed up on a refused
  configuration) are fixed above; nits 3, 6 and 8 are fixed above. A second pass over those
  fixes: no blocking finding; it confirmed that only `next start` loads `next.config.ts` with
  `phase-production-server` (build, its workers and dev use other phases) and found no false
  positive in the host rules; its two should-fix items (the `next.config` test's `.env`
  dependence, these unfilled check lines) are fixed.

**Limitations and follow-ups (not fixed here).**
- The known limit above (local mode behind a proxy).
- The secret's length is checked, not its randomness: 32 spaces or `x`×32 pass. The runbook
  generates it (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- `useSecureCookies` is checked by its source line, not by loading `src/server/auth.ts` (it
  loads only under Next's bundler). The manual check cannot tell the flag from next-auth's own
  https default, because production requires an https `NEXTAUTH_URL`: both give `Secure`.
- `npm run doctor` reads only `.env`; `next start` also reads `.env.production*`. The runbook
  (DEPLOY-006) should keep the server's settings in `.env` only.
- `output: "standalone"` would skip `next.config.ts` at start, and with it the start-time
  refusal (only the first-request instrumentation check would remain). DEPLOY-006 should keep
  `npm run build` + `npm start`, or add the check to its start command.
- The committed-secret scan reads `tests/`, `scripts/`, `.github/` and the root configs, and
  only whitespace-free strings on lines that name a `*SECRET`; a secret built elsewhere would
  pass it.
- Production now passes every script's `readConfig` gate (`db:seed`, the worker, the
  imports); which of them the server runs, and that `db:seed` (synthetic demo jobs) does not,
  is DEPLOY-006's runbook.
- Production wording for the first deploy: the site-wide banner and metadata, and
  «Войти или зарегистрироваться» on [src/app/profile/page.tsx](../src/app/profile/page.tsx).
- `reports/checks.json` still says `"production": "blocked"`; it is a dated report.

**Mock/live:** no mocks in the product path; no provider call, no source call, no spend.
**Coding-host spend:** unknown. **Rollback:** `git revert`; no migration, no data change.
**Owner decision, 2026-11-04:** "Accept and commit": accepted, and committed as `b6f3581` on
`feature/deploy-001-plan`. Then "merge and push": merged into `main` as `30690a8` (together
with the DEPLOY-001 plan, `7c8cade`) and pushed.

**CI on the merge `30690a8`** (run 41812488854, push, about 3.5 min): Code quality, Build and
Tests green; unit and DB tests 587/587 with the coverage ratchet, 87.02 / 89.40 / 94.29
(identical to local, so the lines ratchet 87 holds on Linux); e2e 126/126.
