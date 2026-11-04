# DEPLOY-001: a single-VPS deploy plan

**Status: draft, waiting on owner decisions D3 and D7 (2026-11-04).** On 2026-11-04 the
owner chose one VPS over a managed PaaS ("Single VPS"), then decided D1, D2 and D4–D6
below. This file is the plan, not an implementation:
nothing is provisioned, bought or deployed, and no code has changed. Each slice below gets
its own task file when it starts, and that file fixes its acceptance criteria before any
code is written. The criteria here are drafts.

## Result and boundaries

**User result:** the service runs on a server the owner controls, so it no longer depends
on the development machine being on. The first stage is a private staging site: no
invited users yet. Admitting the first beta users is a separate owner decision (SP 1.0 §14,
stage S5).

**Not included:** a GPU host (scoring and letters stay closed by the personal-data
boundary), auto-deploy from CI, several app instances, a CDN, managed Postgres, opening
`UPLOADS_ENABLED` to real CVs, sign-up of any kind (D5), and the beta itself.

**Context: why the app cannot be deployed today (findings 2026-11-04).**
- `readConfig` ([src/server/config.ts](../src/server/config.ts)) accepts only
  `ATLAS_ENV=local|test` and otherwise throws `PRODUCTION_NOT_IMPLEMENTED`;
  `npm run doctor` throws `STARTER_CONFIGURATION_REJECTED`.
- `localDatabaseUrl` (same file) requires a loopback host, the database name
  `atlas_starter` and a URL without options. This rule stays: on one VPS, Postgres
  listens on 127.0.0.1, as [compose.yaml](../compose.yaml) already binds it.
- The CSP in [next.config.ts](../next.config.ts) is the local policy: inline scripts are
  allowed, and its comment says a production nonce-based CSP needs a separate task.
- Registration is open to anyone, with a service-wide limit (10 per 15 minutes, B55).
  SP 1.0 §14 admits only invited participants to the first beta. There is no password
  reset.
- Restore is not implemented (SP-T22). `account_deletions` (migration 0021) exists so a
  restore can delete those accounts again.
- `/api/health` is liveness only. Nothing alerts when the worker stops.
- **Loophole:** `ATLAS_ENV=local` on a VPS with Postgres on 127.0.0.1 would pass every
  guard. That gets around the guard instead of replacing it, so the plan adds a real
  `production` mode and closes the loophole (DEPLOY-002).
- All three live source policies expire on 2026-12-23
  ([src/server/source-policies.ts](../src/server/source-policies.ts)). After that a hosted
  worker stops importing (`permissionFor` returns `denied`). The renewal is a source-rights
  review, separate from this plan.

**What the server runs (measured 2026-11-04):** the Next.js server, the import worker
(`npm run worker`, 60 s tick, stops cleanly on SIGTERM) and Postgres 17 with pgvector 0.8.
The local database holds 83 MB. The 14 GB `models/` folder is not needed: no route or
worker path loads the local embedder (the dense leg is off), so the server neither fetches
nor holds it. Runtime secrets: `AUTH_SECRET`, `NEXTAUTH_URL`, the database password and,
if live AI is on, `OPENAI_API_KEY`.

**Risk: high,** for the slices that touch auth (DEPLOY-002, DEPLOY-004), deletion
(DEPLOY-003) and public exposure (DEPLOY-007). Each of those needs xhigh effort, a
`reviewer` pass and owner acceptance. This planning file itself is low risk: docs only.

**Data:** the server starts empty (see D4). The repository is **public** on GitHub, so no
secret, host name tied to a person, backup or `.env` file is ever committed.

## Target architecture (one VPS)

| Part | How | Notes |
|---|---|---|
| Host | One VPS, Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 40 GB disk, plus 2 GB swap | Sized from the measurements below; the build is the memory peak |
| Node | The version in `.nvmrc` (26.7.0) | Same as CI |
| Postgres | The existing `compose.yaml` service (`pgvector/pgvector:0.8.6-pg17`), port bound to 127.0.0.1, named volume | `localDatabaseUrl` stays unchanged |
| Web | `npm run build`, then `npm start` (already binds 127.0.0.1:3000) under a systemd unit, as an unprivileged `nenaugad` user | Next reads `.env` (mode 600, owned by that user) |
| Worker | `npm run worker` under a systemd unit, `Restart=always` | JSON logs go to journald |
| Proxy | Caddy: TLS from Let's Encrypt, HTTP to HTTPS, a request size limit, basic auth during the private stage | Next's self-hosting guide recommends a reverse proxy in front |
| Network | Firewall allows only 22 (SSH keys only, no root login) and 80/443 | Postgres is never exposed |
| Patching | `unattended-upgrades` for security updates | Node and npm packages are updated by tasks, as now |
| Backups | Nightly `pg_dump`, encrypted, copied off the server; tested restore | DEPLOY-003 and DEPLOY-006 |
| Monitoring | External uptime check on `/api/health`; a missed-heartbeat alert for the worker; a disk-space alert | Pings carry no personal data |

**Deploy procedure** (run by the owner over SSH, never automatically): back up the
database first, check out a commit from `main` that has green CI, `npm ci`,
`npm run db:migrate`, `npm run build`, restart web and worker, check `/api/health`.
Rollback: check out the previous commit, build, restart. Migrations only go forward, so a
rollback across a migration restores the dump taken before the deploy.

## Sizing (measured 2026-11-04)

Measured on the development machine (Windows, 16 CPU threads), on `main` after DEPLOY-002,
with the local database (3,582 to 4,080 postings) and `NODE_ENV=production`. Memory is the
working set summed over each process tree. A VPS will differ; the numbers that matter are
re-measured on the first deploy (DEPLOY-007).

| Part | Measured | Notes |
|---|---|---|
| `next build`, cold (no `.next`) | 2,990 MB peak, 11 s | 17 Node processes: Next starts one build worker per CPU thread. A 2-vCPU server runs fewer, so its peak should be lower (not measured). |
| `next build`, warm | 1,682 MB peak | With the build cache |
| Web server (`npm start`) | 206 MB at start; 386 MB after one hit per page; 661 MB after 160 more requests | Node reclaims memory lazily, so 661 MB is not a ceiling. DEPLOY-006 sets a heap cap (`--max-old-space-size`). |
| Worker | 75 MB on a `--status` run | An import's peak is not measured: an import calls the live sources and, with live AI on locally, pays for extraction |
| Postgres | 149 MiB in use; database 83 MB, data directory 223 MB; `shared_buffers` 128 MB (default) | A compressed `pg_dump` is 13 MB, test accounts included |

- **Steady state:** Postgres, web, worker, Caddy and the OS together come to about
  1–1.7 GB. On 4 GB the build is the only tight moment, which the 2 GB swap covers. The
  alternative is to build elsewhere and copy `.next`.
- **Disk:** under 10 GB of 40 GB. `node_modules` is 919 MB, of which 426 MB is the ONNX
  runtime: only the offline embedding scripts use it, but `npm ci` installs it anyway. The build output is 78 MB; 14 daily
  plus 8 weekly dumps come to about 300 MB; the OS and the Postgres image take a few GB.
  The 14 GB `models/` folder stays off the server.
- **CPU:** warm page times here: `/jobs` 344–364 ms (175 KB), the other measured pages
  14–31 ms. A shared vCPU is slower (not measured). The heaviest page is `/matched`,
  which scans every posting per request: 3.9 s cold and 1.3 s repeat at 3,582 postings
  (PERF-001). With no sign-up, only the owner uses it at first.
- **Traffic:** negligible against a VPS's included traffic.

## Owner decisions (open)

- **D1 Region and audience: decided 2026-11-04.** The owner: first users live "Outside
  Russia". So the server goes in an EU region (for Hetzner: Falkenstein, Nuremberg or
  Helsinki), under GDPR, which the personal-data boundary is already written around.
  Russian data-localization law (152-FZ) does not shape this plan. Inviting users in
  Russia later would reopen D1.
- **D2 Provider: decided 2026-11-04,** "Hetzner Cloud EU": a 4 GB shared-vCPU plan in
  Falkenstein, Nuremberg or Helsinki, picked when ordering. Its page showed plans "from
  €5.99" and "from €6.49" a month excluding VAT on 2026-11-04, after two price rises in
  2026. Confirm the price in the console before ordering. Off-site backup storage costs
  extra and is chosen in DEPLOY-006.
- **D3 Domain name.** It is needed for TLS. The owner buys it and points it at the server.
- **D4 Starting data: decided 2026-11-04,** "Start empty": `db:migrate` and
  `seed:budgets` on the server, and the worker imports fresh. No local row moves: no
  users, profiles, letters, CVs, events or AI ledger (the local database holds e2e test
  accounts), and no job tables either. Extraction of the fresh postings is paid again,
  within the B34 cap of 25 calls per source per import. The himalayas pass takes several
  days to cover its catalog at 25 pages a run.
- **D5 Access: decided 2026-11-04.** The owner: "No registration yet, Google auth and
  email/password sign up in future". So production has no sign-up of any kind: the
  registration endpoint refuses and the UI offers no way to register (DEPLOY-002). Sign-up
  comes later, as its own tasks (DEPLOY-004): Google sign-in, and email/password sign-up.
  Invite codes are dropped. **Open sub-question:** whether the owner needs an account on
  the private stage to try the signed-in pages; if so, a script that creates one from the
  server shell (not a public path).
- **D6 Switches on the server: decided 2026-11-04,** "After restore drill":
  `LIVE_AI_ENABLED=false` for the first deploy, switched on for job-text extraction once
  the restore drill passes on the server; from then the OpenAI key lives on the server.
  `UPLOADS_ENABLED=false` until the beta decision.
- **D7 Who processes data.** On a server, the "contour" becomes the owner's VPS. The
  hosting provider, the backup store and the monitoring services become processors. Sign
  the provider's GDPR data processing agreement (Art. 28), and accept that list or shorten
  it.

## Slices (in order; each is its own task)

**DEPLOY-002 Production mode (high: auth, config).** Draft criteria:
1. `ATLAS_ENV=production` is accepted only with `DATA_BACKEND=postgres`, a secret of at
   least 32 bytes and an `https://` `NEXTAUTH_URL` whose host is not loopback. Each
   missing condition refuses with its own code and never prints a value.
2. In production there is no sign-up (D5): `POST /api/v1/auth/register` refuses every
   request before touching the database, and the login form
   (`src/components/auth-forms.tsx`) offers no registration. Login for existing accounts
   still works. Local and test keep registration as now.
3. In `local` and `test`, a set `NEXTAUTH_URL` must be loopback (this closes the loophole).
   Check CI, Playwright and `.env.example` first.
4. Session cookies are `Secure` and `__Secure-`-prefixed in production. Check next-auth's
   default against the installed version, not from memory.
5. `npm run doctor` and `/api/health` report `production` without secrets.
6. Unit tests cover each refusal. No security test is weakened.

**DEPLOY-003 Backup and restore, SP-T22 (high: deletion).** Draft criteria:
1. `npm run db:backup` writes a `pg_dump` custom-format file outside the repository.
2. `npm run db:restore` restores into a fresh database and deletes every account listed
   in `account_deletions` before the database can be used. If any account is still
   present, the command fails.
3. An integration test on the isolated test database: create an account, back up, delete
   the account, restore the older backup, and the account is absent with its profile,
   letters, CV text, events and vectors.
4. Backups and restores print no row contents and no connection string.

**DEPLOY-004 Sign-up, later (high: auth).** Not part of the first stage (D5). When the
owner opens it, it splits into its own tasks, each with owner decisions first:
- *Google sign-in:* next-auth's Google provider next to the existing credentials login;
  the owner creates the Google OAuth client; how a Google identity links to an account
  with the same email; what Google learns and what Nenaugad stores (Google becomes a
  processor, D7).
- *Email/password sign-up:* the existing registration path, plus email verification and a
  password reset, which neither exist today. Both need an email-sending service, one
  more processor (D7).
- The registration limit (B55) and the attempt limits (B53) stay in force.

**DEPLOY-005 Production CSP (normal).** A nonce-based policy without `'unsafe-inline'`
scripts. Read Next's CSP and `proxy` guides in `node_modules/next/dist/docs/` first.
Measure the page-time cost: nonces force dynamic rendering.

**DEPLOY-006 Server files and runbook (normal).** A `deploy/` folder holding the
Caddyfile, systemd units, a backup timer (dump, encrypt, copy off-site, keep 14 daily and
8 weekly) and `deploy/README.md`. The runbook covers provisioning, first deploy, update,
rollback, restore drill, secret rotation, and renewing the source policies before
2026-12-23. No secrets or real host names go in the repository.

**DEPLOY-007 First deploy to a private stage (owner-run; outward-facing).** The owner buys
the server and the domain and provisions them from the runbook. The site sits behind basic
auth with no real users, `LIVE_AI_ENABLED=false` and `UPLOADS_ENABLED=false`. A restore
drill runs on the server; once it passes, the owner may switch live AI on for extraction
(D6). Only after that does the owner decide on the beta (S5).

## Approvals and limits

The coding agent writes code, tests and files. The agent never buys anything, never
creates accounts, never changes DNS and never deploys. The owner provisions the server,
holds the secrets and runs every deploy. Publishing the local app through a tunnel stays
forbidden (SAFETY_GATES). Coding-host spend is unknown.

## Checks

For this file: none, since it is docs only. Each slice runs `npm run check` and
`npm run test:coverage`, plus `npm run build` and `npm run test:e2e` where pages or auth
change.
