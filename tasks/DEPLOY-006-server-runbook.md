# DEPLOY-006: server files and runbook

**Status: implemented and checked by reading and static checks (2026-11-04); committed on
`feature/deploy-001-plan` at the owner's word ("Commit it"). Not merged into `main`, not run
on any server, not accepted.** Pulled ahead of DEPLOY-003 at the owner's request, so
the owner can prepare the Hetzner server now. A slice of the single-VPS plan
([DEPLOY-001](DEPLOY-001-single-vps-plan.md), sections "Target architecture", "Deploy
procedure", "Sizing" and the DEPLOY-006 slice). The criteria below are fixed before the
files are written and are not adjusted to match the result.

## Result and boundaries

**User result:** the owner, holding a fresh Hetzner CX23 (or CAX11) with Ubuntu 24.04 and
an SSH key, follows `deploy/README.md` top to bottom with copy-paste commands and ends with
web, worker, Postgres and Caddy running as the plan describes: a private stage behind basic
auth, `ATLAS_ENV=production`, no sign-up, live AI and uploads off. Later updates and
rollbacks go through one owner-run script.

**Not included:**
- backups, the backup timer, restore and the restore drill (DEPLOY-003): the runbook marks
  them as waiting, and nothing here claims they work;
- the production CSP (DEPLOY-005), sign-up (DEPLOY-004), a script that creates the owner's
  account on the server (the open D5 sub-question), the production wording of the demo banner;
- running anything on a server, buying anything, creating accounts, choosing a monitoring
  service (D7) or a domain (D3), committing or pushing (the owner does all of these);
- any change to app code, tests, `package.json` or CI.

**Context (read 2026-11-04 at `e48c061`).**
- [src/server/config.ts](../src/server/config.ts): `ATLAS_ENV=production` requires
  `DATA_BACKEND=postgres` (`PRODUCTION_REQUIRES_POSTGRES`), a secret read as next-auth reads
  it, `NEXTAUTH_SECRET` else `AUTH_SECRET` (`PRODUCTION_SECRET_REQUIRED`), of at least 32
  bytes (`PRODUCTION_SECRET_TOO_SHORT`) and not a public test secret
  (`PRODUCTION_SECRET_PUBLIC`), a `NEXTAUTH_URL` (`PRODUCTION_URL_REQUIRED`) that parses
  (`PRODUCTION_URL_INVALID`), starts with `https://` (`PRODUCTION_URL_NOT_HTTPS`) and is not
  loopback or unspecified (`PRODUCTION_URL_LOOPBACK`), and `UPLOADS_ENABLED` not true
  (`PRODUCTION_UPLOADS_NOT_APPROVED`). `LIVE_AI_ENABLED` is `true`/`false`/unset, anything
  else `LIVE_AI_ENABLED_INVALID`; `LIVE_SOURCES_ENABLED` must be unset or `false`.
  `localDatabaseUrl` requires a loopback host, the database `atlas_starter`, no options, a
  user and a password. `signUpOpen` is false in production.
- [scripts/doctor.ts](../scripts/doctor.ts) reads `.env` only, prints no values and prints
  `CONFIGURATION_REJECTED: <CODE>` with exit 1 on a refusal.
  [next.config.ts](../next.config.ts): `next start` exits 1 on a refused configuration.
- [.env.example](../.env.example) and [scripts/setup.mjs](../scripts/setup.mjs): `npm run
  setup` writes `.env` with mode 600, a random database password (in `POSTGRES_PASSWORD` and
  `DATABASE_URL`, `127.0.0.1:54329/atlas_starter`) and a random 32-byte `AUTH_SECRET`; it
  never overwrites an existing `.env`.
- [compose.yaml](../compose.yaml): `pgvector/pgvector:0.8.6-pg17`, port bound to
  `127.0.0.1:${POSTGRES_PORT:-54329}`, `restart: unless-stopped`.
- [scripts/worker.ts](../scripts/worker.ts): SIGTERM sets a flag; the loop finishes the
  attempt in progress, logs `worker_stop` and exits 0. A source whose policy no longer allows
  fetching is skipped without a log line. The worker, `db:migrate` and `seed:budgets` call
  `readConfig` and `localDatabaseUrl`. `migrate()` applies only the files its own commit
  carries and ignores newer applied ones.
- [src/server/source-policies.ts](../src/server/source-policies.ts): all three live
  policies are `valid_until: 2026-12-23T00:00:00.000Z`.
- `package.json`: `start` is `next start --hostname 127.0.0.1`; `.nvmrc` is 26.7.0.
- Next 16.4.5 docs: `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md` (a reverse
  proxy in front; streaming needs an unbuffered proxy; SIGTERM drains in-flight requests,
  10–30 s recommended) and `.../03-api-reference/06-cli/next.md` (`--keepAliveTimeout` must
  exceed the proxy's keep-alive). `next start` serves in its own process; Next writes agent
  files only under `next dev` (`server/lib/app-info-log.js`).
- The sibling DEPLOY-002 hand-over: keep server settings in `.env` only (Next also reads
  `.env.production*`, the scripts do not); the scripts that run on the server are
  `db:migrate`, `seed:budgets` and `worker`, not `db:seed`; production mode only, never
  `ATLAS_ENV=local` behind a proxy.

**Risk: normal.** Docs and server config only; nothing touches app code. The files configure
SSH, basic auth and a public-facing proxy, but only the owner applies them, on a server
with no users yet. Effort `high` per CLAUDE.md.

**Data:** none. The repository is public: no secret, IP address, real host or domain name
or personal data goes into it. Placeholders only: `example.org`, `YOUR_SERVER_IPV4`,
`YOUR_ADMIN_USER`, `YOUR_GITHUB_ACCOUNT`.

## Acceptance (fixed before the files)

1. **Runbook.** `deploy/README.md` gives copy-paste commands in this order: first login and
   patching; an admin account with sudo and a non-root `nenaugad` service user; SSH keys
   only, root login and password authentication off (checked with `sshd -T`);
   `unattended-upgrades` checks; a 2 GB swap file; Docker Engine from Docker's apt
   repository; Node 26.7.0 by a method that pins that exact version; Caddy from its apt
   repository; the clone; the production `.env` (mode 600, owned by `nenaugad`) with every
   variable production mode requires and how the secret is generated; Postgres through the
   existing `compose.yaml`, still on 127.0.0.1; `npm ci`, `npm run db:migrate`,
   `npm run seed:budgets`, `npm run build`; enabling the services; update, rollback and
   secret rotation; renewing the source policies before 2026-12-23.
2. **Waiting on DEPLOY-003.** The backup timer and the restore drill appear only as waiting
   on DEPLOY-003. Until then the deploy command refuses to start without an explicit
   `--no-backup`, so a deploy without a backup is the owner's stated choice each time.
3. **Caddyfile.** Reverse proxy to `127.0.0.1:3000`; automatic HTTPS with HTTP→HTTPS from a
   domain site address; a request body size limit; basic auth (a hash from
   `caddy hash-password`, kept outside the repository) on every path except `/api/health`.
4. **Units.** Web runs `npm start` with `NODE_OPTIONS=--max-old-space-size=...` sized from
   the plan's measurements and a keep-alive above Caddy's; worker runs `npm run worker` with
   `Restart=always` and enough stop time for SIGTERM. Both run as `nenaugad`, with hardening
   that leaves V8's JIT working. Checked with `systemd-analyze verify` where available,
   otherwise by careful reading, and the report says which.
5. **Release script.** Owner-run `deploy` and `rollback`: refuses a dirty tree, a target not
   on `origin/main` and migrations the owner did not acknowledge; root never executes a file
   the `nenaugad` user can modify. Not committed, not run by the agent.
6. **Monitoring.** The external uptime check on `/api/health` and a worker heartbeat are
   described (heartbeat files provided, off until D7 names the service). No account is
   created anywhere.
7. **Facts checked at the source.** Every production variable and refusal code matches
   `src/server/config.ts`, `scripts/doctor.ts` and `.env.example`; the Next facts match the
   installed Next docs; the Docker, Caddy and NodeSource steps match their official docs or
   repositories as fetched on 2026-11-04.
8. **Public repository.** A grep over `deploy/` finds no IP address, real domain, e-mail
   address or secret; only the placeholders above.
9. **Scope.** `git status` shows only `deploy/`, this file, `tasks/current.json` and
   `IMPLEMENTATION_STATUS.md` changed, and `npm run check` passes.

## Plan

1. Read the code named under Context; fetch the official Docker, Caddy, NodeSource and
   systemd docs.
2. Write `deploy/README.md`, `deploy/Caddyfile`, `deploy/systemd/nenaugad-web.service`,
   `deploy/systemd/nenaugad-worker.service`, `deploy/nenaugad-release.sh` and the heartbeat
   script, service and timer.
3. Static checks: `bash -n`, `shellcheck` and `systemd-analyze verify` where available; a
   placeholder grep; `npm run check`.
4. Update this file and the `IMPLEMENTATION_STATUS.md` line; write the hand-off report.

Rollback: delete `deploy/` and this file, restore `tasks/current.json` and the status line.

## Approvals and limits

Local writing and checks only. No server, purchase, account, DNS change, commit, push or
deploy: the owner runs every command in the runbook. No provider call. Coding-host spend
unknown. Repairs: at most two cycles, each recorded with `npm run task -- repair` first.

## Checks and report

`npm run check`; `bash -n` on the shell scripts; `shellcheck` and `systemd-analyze verify`
if installed; a grep of `deploy/` for addresses and secrets. Report per AGENTS.md "Handoff".

## Result (2026-11-04)

**What exists:** `deploy/`, with nothing outside it changed except this file,
`tasks/current.json` and `IMPLEMENTATION_STATUS.md`.
- `deploy/README.md`: the runbook, in the order of criterion 1, plus monitoring, update,
  rollback, secret rotation, the source-policy renewal (reminder 2026-12-09, expiry
  2026-12-23), "Backups and the restore drill: waiting on DEPLOY-003", after a reboot, and
  known limits. Every production variable and refusal code is in a table taken from
  `src/server/config.ts`.
- `deploy/Caddyfile`: site address `{$NENAUGAD_DOMAIN}` (automatic HTTPS and the HTTP→HTTPS
  redirect), `request_body max_size 1MB`, HSTS, `/api/health` outside basic auth, everything
  else behind the snippet `nenaugad_private_stage`, with the private-stage password stripped
  before Next. No access log. The bcrypt hash lives in a root:caddy 640 file imported by the
  Caddyfile, not in the environment, because the packaged `caddy.service` runs
  `caddy run --environ`, which prints its environment to the journal.
- `deploy/systemd/nenaugad-web.service`: `npm start -- --keepAliveTimeout 130000` (above
  Caddy's 2 min upstream keep-alive, as Next's CLI docs require),
  `NODE_OPTIONS=--max-old-space-size=1024`, `TimeoutStopSec=30`.
  `deploy/systemd/nenaugad-worker.service`: `npm run worker`, `Restart=always`,
  `RestartSec=30`, no start limit, `TimeoutStopSec=300`, no heap cap (import peak not
  measured). Both: `User=nenaugad`, `npm run doctor` as `ExecStartPre`, `ProtectSystem=strict`
  (web writes only `.next`), no capabilities, `NoNewPrivileges`, the kernel/cgroup/clock
  protections, `AF_NETLINK` kept for glibc's `getaddrinfo`. Left off on purpose:
  `MemoryDenyWriteExecute` (V8's JIT) and `SystemCallFilter` (untested on Node 26).
- `deploy/nenaugad-release.sh`, installed root-owned as `/usr/local/sbin/nenaugad-release`:
  `deploy <commit> --no-backup [--migrations]`, `rollback [<commit>] [--across-migrations]`,
  `status`. It refuses a dirty tree, a commit not on `origin/main`, a deploy that is not ahead
  of the deployed commit, a Node version other than the target's `.nvmrc`, unacknowledged
  migrations, and any deploy without `--no-backup` until DEPLOY-003. Root runs only systemctl,
  flock, cmp and curl; git and npm run as `nenaugad`. It reports, never installs, drift
  between the checkout and the root-owned copies.
- `deploy/nenaugad-heartbeat.sh` with `nenaugad-heartbeat.service` and `.timer`: a ping every
  5 minutes while the worker has been up 2 minutes and the disk is under 85 %. Off until D7.

**Found while writing (not in the plan):**
- The committed `next-env.d.ts` is the `next dev` form; `next build` rewrites it (Next's
  `writeAppTypeDeclarations`, `docs/OPEN_GAPS.md`). On the server the tree would look dirty
  after the first build and every later deploy would refuse. The release script restores that
  one generated file before its clean-tree check; the runbook says so.
- `npm run db:migrate` prints only `MIGRATION_FAILED` on a bad `DATABASE_URL`; `seed:budgets`
  and the worker name the code. The runbook says where to look.
- The worker skips a source whose policy lapsed without a log line, so neither monitoring check
  sees the 2026-12-23 expiry; the runbook's weekly `worker -- --status` does.
- Node: NodeSource's `node_26.x` repository lists `26.7.0-1nodesource1` for amd64 and arm64,
  but its README (read 2026-11-04) still lists Node 18–24 only. The newest 26.x there is
  26.13.0; whether 26.7.0 still carries fixed security advisories is not checked here.

**Checks (2026-11-04, Windows development machine):**
- `npm run check`: exit 0 (unit 446/446, guardrails, lint, typecheck). The guardrails and
  the secret scan in `tests/unit/production-mode.test.ts` do not cover `deploy/`.
- `bash -n deploy/nenaugad-release.sh deploy/nenaugad-heartbeat.sh`: exit 0. No CRLF in any
  file.
- A grep of `deploy/` for IPv4 addresses, e-mail addresses, domains, bcrypt hashes, API keys,
  long hex strings and the owner's names: nothing but placeholders and the vendors' own hosts.
- **Not run:** `shellcheck` and `systemd-analyze verify` (neither is installed here, and
  getting them needs a download nobody approved), `caddy validate`, and the scripts
  themselves. The units, the Caddyfile and the scripts were checked by careful reading;
  runbook step 12 runs `systemd-analyze verify` on the server and step 13 `caddy validate`.

**Facts checked at the source:** `src/server/config.ts`, `scripts/doctor.ts`,
`.env.example`, `scripts/setup.mjs`, `scripts/worker.ts`, `scripts/migrate.ts`,
`scripts/db.ts`, `scripts/seed-ai-budgets.ts`, `compose.yaml`, `next.config.ts`,
`src/app/api/health/route.ts`, the register route and `src/server/source-policies.ts` at
`e48c061`; Next 16.4.5's `self-hosting.md` and CLI `next.md` in `node_modules`; Docker's
Ubuntu install guide, Caddy's install, running, command-line, `basic_auth`, `request_body`,
`import`, `reverse_proxy`, automatic-HTTPS and Caddyfile-concepts pages, Caddy's packaged
`caddy.service`, NodeSource's manual-installation wiki and its `node_26.x` package indexes,
and `systemd.exec(5)`, all fetched 2026-11-04.

**Mock/live:** nothing live; no server, no provider call. **Costs:** no spend; coding-host
spend unknown. **Rollback:** delete `deploy/` and this file; restore `tasks/current.json`
(previous task DEPLOY-002) and the two `IMPLEMENTATION_STATUS.md` edits.

**Next small task:** the owner reviews `deploy/` and, if satisfied, merges the branch into
`main` (the server clones `main`, so the files must be there first). Then DEPLOY-003
(backup and restore), which replaces the `--no-backup` refusal with a real backup step; or
the owner runs steps 1–12 now, before the domain exists.
