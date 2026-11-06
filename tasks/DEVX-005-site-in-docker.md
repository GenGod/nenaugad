# DEVX-005: the whole site starts in Docker

**Status: implemented and tested locally (2026-11-06); running on this computer.
Committed on `feature/deploy-001-plan` at the owner's word ("Commit the working tree
changes"); not merged, not pushed, not accepted.** A first run made 25 paid extraction calls (about $0.016),
see "Incident" below. Owner change request 2026-11-06: "the whole site
should start inside a docker container without separate `npm dev` call". Owner answers the
same day: a built app (not a dev server with live reload), this computer only (the server
keeps the systemd units of DEPLOY-006), and the import worker starts with Docker too.

## Result and boundaries

**User result:** on this computer, with the `.env` that `npm run setup` writes, one command
`docker compose up -d --build` starts Postgres, applies the migrations and the synthetic
seed, and runs the built site on `http://127.0.0.1:3000` and the import worker. No
`npm run dev`, no npm on the host. Like the database, the site and the worker come back
with the Docker engine.

**Not included:**
- the server: [DEPLOY-006](DEPLOY-006-server-runbook.md) keeps its systemd units and Caddy;
  running the server on containers would be a separate owner decision;
- live reload: a code change needs `docker compose up -d --build`;
- any change to app code, config rules, tests, `package.json` or CI; publishing an image;
- running e2e or the DB tests against the containers (they keep their own servers).

**Context (read 2026-11-06 at `35458bf`).**
- [compose.yaml](../compose.yaml): only `db` (`pgvector/pgvector:0.8.6-pg17`, port
  `127.0.0.1:${POSTGRES_PORT:-54329}:5432`, named volume, `restart: unless-stopped`, owner
  decision 2026-09-25 that the DB comes back with the engine).
- [src/server/config.ts](../src/server/config.ts) `localDatabaseUrl`: the host must be
  `localhost`, `127.0.0.1` or `[::1]` (`LOCAL_DATABASE_REQUIRED`), the database
  `atlas_starter` or `atlas_starter_test`, no options, a user and a password. `readConfig`
  in `local` requires a loopback `NEXTAUTH_URL`; in `production` it refuses a loopback one.
  This task does not change either rule.
- [next.config.ts](../next.config.ts): `next start` runs `readConfig` and exits 1 on a
  refusal. `package.json` `start` binds `127.0.0.1`, which a published container port
  cannot reach, so the container runs `next start` itself.
- [scripts/worker.ts](../scripts/worker.ts) migrates at start, stops cleanly on SIGTERM
  (`worker_stop`, exit 0). [scripts/seed.ts](../scripts/seed.ts) is an upsert of the
  synthetic set (no deletes). Uploads are not written to disk (no file writes under `src/`).
- DEPLOY-001 (measured 2026-11-04): no route or worker path loads the local embedder, so
  the 14 GB `models/` folder stays out of the image. The only prerendered route is
  `/_global-error`, so a build without `.env` serves the same pages.
- `onnxruntime-node` 1.30.0 (via `@huggingface/transformers`) downloads CUDA binaries in
  its postinstall on Linux x64 unless `ONNXRUNTIME_NODE_INSTALL=skip`.
- `.claude/worktrees/` holds full checkouts; `models/`, `tools/`, `data/esco/`,
  `backups/`, `Reference/` and `.env` must never reach a build context.
- `.claude/launch.json` previews use ports 3200 and 3300; e2e uses 3100.

**Design.** The containers reach Postgres on `127.0.0.1:5432`: a `socat` forwarder inside
the app container listens on its own loopback and forwards to the compose service `db`,
whose name is fixed in the entrypoint, not read from the environment. The database is still
the local compose one, so `localDatabaseUrl` keeps its meaning and code. Chosen over sharing
the db container's network namespace, which makes the site unreachable whenever `db`
restarts and leaves the site's start after an engine restart to container start order.

**Risk: normal.** Local dev tooling only; no app code. The points that need care are the
secrets (`.env` must not enter an image) and keeping the database rule's meaning. Effort
`high` per CLAUDE.md.

**Data:** the local database (kept in its named volume, never `down -v`). Nothing leaves
the machine except the image and package downloads the build needs and the worker's fetches
from the three approved sources, which `npm run worker` already makes.

## Acceptance (fixed before the files)

1. **One command.** With `.env` present, `docker compose up -d --build` ends with `db`
   healthy, a one-shot `init` that exited 0 after `db:migrate` and `db:seed`, `web` healthy
   on `/api/health` at `127.0.0.1:${WEB_PORT:-3000}` and serving the catalog from Postgres,
   and `worker` running and logging. Nothing runs on the host.
2. **Guards unchanged.** No file under `src/`, `scripts/`, `tests/` or `migrations/`
   changes. Web, worker and init use `DATABASE_URL=...@127.0.0.1:5432/atlas_starter` and pass
   `localDatabaseUrl` and `readConfig` as they are. `ATLAS_ENV` comes from `.env`, not from
   compose; `NEXTAUTH_URL` is forced to loopback, so a `production` `.env` makes the site
   refuse to start instead of running. Every published port binds `127.0.0.1` only.
3. **No secrets in images.** `.dockerignore` admits only the listed paths; `.env` is not in
   the image (checked with a file search inside the image) and the image's own environment
   holds no secret; containers get `.env` at run time through `env_file`.
4. **Small context.** `models/`, `tools/`, `data/`, `.claude/`, `Reference/`, `backups/`,
   `node_modules/` and `.next/` stay out of the build context; the context size is reported.
5. **Restarts.** Web and worker have `restart: unless-stopped` and run as the non-root
   `node` user. After `docker compose restart db` the site answers again without touching
   web; `docker compose stop worker` logs `worker_stop` and exits 0. A restart of Docker
   Desktop itself is tested only if the owner allows it (it also restarts other projects'
   containers); otherwise the report says it was not tested.
6. **Docs and checks.** `README.md` gets the Docker path next to the `npm run dev` path,
   including how to rebuild after a code change and that `docker compose down` keeps the
   data; `npm run check` passes; `git status` shows only the new Docker files,
   `compose.yaml`, `README.md`, this file, `tasks/current.json` and
   `IMPLEMENTATION_STATUS.md`.
7. **No paid calls (added after the incident below, not part of the original six).** The
   app containers run with `LIVE_AI_ENABLED=false` whatever `.env` says; `/api/health`
   reports `realAi: false`, and a worker tick creates no `ai_operations` row.

## Plan

1. `Dockerfile` (Node 26.7.0 trixie-slim, `socat`, `npm ci` with the CUDA download skipped,
   `next build`, `npm prune --omit=dev`, user `node`), an allowlist `.dockerignore` and
   `docker/entrypoint.sh` (the forwarder, then `exec` the command).
2. `compose.yaml`: `init`, `web`, `worker` on one image; `db` unchanged.
3. Build and run locally; check every criterion above; README; status lines.

Rollback: `docker compose stop web worker` (or `rm` them) and delete the new files; `db`
and its volume are untouched.

## Incident during the first run (2026-11-06): paid AI calls

The local `.env` has `LIVE_AI_ENABLED=true` and a provider key (AGENTS.md and the status
say live AI is off; the file says otherwise). The first `docker compose up` passed it to
the worker as it was. After its first Himalayas import (12:12:33 UTC) the worker ran the
guarded C1 extraction pass against the provider: **25 calls, 22 extracted and 3 rejected,
settled 15 728 micro-USD (about $0.016)** per `ai_operations` and the worker log; no
operation left `in_flight`. This was not approved for an unattended container: the owner's
"start the worker too" answered a question that described only fetching jobs.

What was done: `docker compose stop worker` as soon as `realAi: true` showed in
`/api/health`. The pass is not cancellable and finished its 25 calls within the stop;
killing it would have left uncertain-billing holds. The stop's 5 minutes ran out in the
stale-analysis pass after it, so the worker was killed (exit 137) without `worker_stop`;
nothing AI-related was in flight. Then compose forces `LIVE_AI_ENABLED: "false"` for every
app container (criterion 7, added after the incident), and the stack was recreated:
`/api/health` reports `realAi: false` and no `ai_operations` row was created after
12:17:30 UTC. `npm run worker` on the host still follows `.env`, so the same calls happen
there whenever it runs with this `.env`.

Other data effects of that first worker tick, as the worker would make them on the host:
retention turned 1 139 Himalayas and 201 Jobicy snapshots whose `last_seen_at` was past the
retention window into tombstones (RET-001), and the three imports refreshed 496 + 1 000 +
496 postings.

## Result and checks (2026-11-06)

Files: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`, `compose.yaml` (`db`
unchanged; `init`, `web`, `worker` added), `README.md` ("Run everything in Docker").

| # | Check | Result |
|---|---|---|
| 1 | `docker compose up -d --build` | exit 0; `init` exit 0 (`migrationsApplied: 0`, `syntheticRecordsChanged: 0`); `web` healthy; `/api/health` `environment: local`, `data: postgres`; `/jobs` 200 with the 4 synthetic cards and "1–24 из 3841" external postings, no console errors; worker imported all three sources |
| 2 | Guards | no file under `src/`, `scripts/`, `tests/`, `migrations/` changed; inside the worker `DATABASE_URL` is `postgresql://…@127.0.0.1:5432/atlas_starter`, user `node`; ports `127.0.0.1:3000` and `127.0.0.1:54329` only. A `production` `.env` was not tried (read from `readConfig`: a loopback `NEXTAUTH_URL` is `PRODUCTION_URL_NOT_HTTPS`) |
| 3 | Secrets | `find` in the image: no `.env*`, `*.pem`, `*.key` outside `node_modules`; image env holds only `PATH`, `NODE_VERSION`, `NEXT_TELEMETRY_DISABLED`, `ONNXRUNTIME_NODE_INSTALL`, `NPM_CONFIG_UPDATE_NOTIFIER`; the DB password and `AUTH_SECRET` occur 0 times in the `web`, `worker` and `init` logs |
| 4 | Context | 1.51 MB transferred; `/app` holds only the allowlisted paths. Image 1.73 GB (`node_modules` 853 MB, mostly `@huggingface/transformers` and onnxruntime, which the site does not load) |
| 5 | Restarts | `docker compose restart db`: `web` kept running (same start time) and served `/jobs` from Postgres right after; `worker` crashed on the dropped idle connection (pg `terminating connection due to administrator command`, no pool `error` listener in `scripts/db.ts`) and Docker restarted it in seconds (restart count 1). `docker compose stop worker` while it sleeps: `worker_stop`, exit 0, 1.5 s. `docker compose stop web` frees port 3000. **Not tested:** a restart of Docker Desktop or the PC |
| 6 | Checks | `npm run check` exit 0 (unit 446/446, lint and typecheck clean) |
| 7 | No paid calls | `/api/health` `realAi: false`; worker env `LIVE_AI_ENABLED=false`; 0 `ai_operations` rows after 12:17:30 UTC |

Two things found on the way, neither changed here (app code is out of scope):
- **The worker's batch path matches every stored profile on every tick** even though
  `isBatchEnabled()` returns `false`: 365 profiles (most of the 1 758 local accounts are
  e2e leftovers) at about 2 s each, about 13 minutes a tick, so a stop always ran out its
  grace time. The container passes `--no-batch`; `npm run worker` on the host and the
  server unit do not. The fix belongs in `checkForStaleAnalyses` (return early when batch
  is off).
- **The worker dies when Postgres drops an idle connection** (no `pool.on("error")`). In
  Docker the restart policy covers it; on the host the process just exits.

Not run: e2e and `test:db` (no app code changed; they keep their own servers), the Docker
Desktop restart, `shellcheck` on the entrypoint (not installed; it ran under `sh` in all
three containers). Mock/live: live sources (the three approved feeds, as `npm run worker`);
live AI during the incident only, off since. Costs: $0.016 to the AI provider from the
incident (ledger figure); coding-host spend unknown.
