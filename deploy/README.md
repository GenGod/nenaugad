# Nenaugad server runbook

How the owner turns one fresh Hetzner Cloud server into the Nenaugad private stage, and how
later updates, rollbacks and secret rotations go. Written for DEPLOY-006
([task](../tasks/DEPLOY-006-server-runbook.md)) on 2026-11-04 from the
[single-VPS plan](../tasks/DEPLOY-001-single-vps-plan.md). **Nobody has run it on a server
yet:** the first run is DEPLOY-007, and its notes go back into this file.

The owner runs every command here. Nothing in the repository deploys by itself, and no coding
agent connects to the server.

**This repository is public.** Never put a secret, an IP address, a domain name or anything
personal into it: not in this file, not in a commit. The placeholders below are replaced in
your terminal only.

| Placeholder | Means |
|---|---|
| `YOUR_SERVER_IPV4` | the server's public IPv4 address from the Hetzner console |
| `YOUR_KEY` | the dedicated ed25519 key for this server, on your computer |
| `YOUR_ADMIN_USER` | your login name on the server (not `admin`, not `root`) |
| `YOUR_GITHUB_ACCOUNT` | the GitHub account that holds this repository |
| `YOUR_BASIC_AUTH_USER` | the user name for the private stage's password prompt |
| `example.org` | the domain (owner decision D3) |
| `COMMIT` | the commit to deploy: on `main`, with green CI |

## What this sets up, and what it does not

One Ubuntu 24.04 server running, as in the plan's "Target architecture":

- **Postgres 17 + pgvector** from [compose.yaml](../compose.yaml), listening on 127.0.0.1 only;
- **web**: `npm start` (Next.js on 127.0.0.1:3000) under systemd, as the unprivileged
  `nenaugad` user ([unit](systemd/nenaugad-web.service));
- **worker**: `npm run worker` under systemd, same user ([unit](systemd/nenaugad-worker.service));
- **Caddy** in front: HTTPS from Let's Encrypt, HTTP redirected to HTTPS, a 1 MB request
  limit, and basic auth on everything except `/api/health` ([Caddyfile](Caddyfile));
- `ATLAS_ENV=production` (DEPLOY-002): no sign-up, `Secure` session cookies, uploads off,
  live AI off (owner decision D6: until the restore drill passes).

**Not ready, and nothing here pretends otherwise:**

- **Backups, the backup timer, restore and the restore drill wait on DEPLOY-003.** There is
  no backup on this server. See [Backups and the restore drill](#backups-and-the-restore-drill-waiting-on-deploy-003).
- The production Content-Security-Policy waits on DEPLOY-005 (the local policy, with inline
  scripts allowed, is what runs).
- Nobody can sign in: sign-up is closed in production, and the script that would create the
  owner's account from the server shell does not exist (the open D5 sub-question).
- The site-wide demo banner and metadata still carry the local wording (DEPLOY-007).

## Before you start

- **The server** (owner decisions D1, D2): Hetzner Cloud CX23 (x86, 2 vCPU, 4 GB, 40 GB) in
  Nuremberg or Helsinki, or CAX11 (Arm) if CX23 is out of stock. Ubuntu 24.04. Your
  dedicated ed25519 SSH key. Public IPv4 on (GitHub has no IPv6). **Hetzner backups off:**
  restoring a whole-disk image would bring back accounts deleted since the image, and only
  DEPLOY-003's restore deletes them again.
- **The Hetzner Cloud Firewall**, attached to the server: inbound TCP 22, 80 and 443 only.
  You may narrow 22 to your own address. Outbound stays open (apt, GitHub, the job sources,
  Let's Encrypt).
- **Processors (D7):** Hetzner processes data on your behalf; sign its data processing
  agreement (GDPR Art. 28) in the console. The monitoring services you pick later are
  processors too.
- **The domain (D3)** is needed from step 13 on. Steps 1–12 work without it.
- **The commit:** a commit on `main` with green CI that contains this `deploy/` folder. On
  your computer, `npm run ci:status` shows the runs for the commit you have checked out.

Each part of the stack comes from a signed apt repository or a pinned tag: Docker and Caddy
from their own repositories, Node 26.7.0 from NodeSource, held at that exact version (the
`.nvmrc` version, the one CI runs), Postgres as the image tag in `compose.yaml`.

## 1. First login and patching

On your computer:

```bash
ssh -i ~/.ssh/YOUR_KEY root@YOUR_SERVER_IPV4
```

On the server, as root:

```bash
apt update && apt full-upgrade -y
```

If apt asks about a changed configuration file (such as `sshd_config`), keep the version
currently installed: step 2 adds its own file instead. Then reboot if the upgrade asks for
it, and log in again as root:

```bash
[ -f /var/run/reboot-required ] && reboot
```

## 2. Accounts and SSH: keys only, no root login

Still as root. Your admin account, with sudo; `adduser` asks for a password: the one `sudo`
will ask for (SSH itself will not accept passwords). Keep it in your password manager.

```bash
ADMIN=YOUR_ADMIN_USER
adduser "$ADMIN"
usermod -aG sudo "$ADMIN"
install -d -m 700 -o "$ADMIN" -g "$ADMIN" "/home/$ADMIN/.ssh"
install -m 600 -o "$ADMIN" -g "$ADMIN" /root/.ssh/authorized_keys "/home/$ADMIN/.ssh/authorized_keys"
```

The service user `nenaugad`: a system account with no password, no login shell and no sudo.
Its home is `/srv/nenaugad`; the app lives in `/srv/nenaugad/app`.

```bash
useradd --system --user-group --create-home --home-dir /srv/nenaugad --shell /usr/sbin/nologin nenaugad
chmod 750 /srv/nenaugad
```

**Keep this root session open.** In a second terminal on your computer, log in as the admin
and check that sudo works:

```bash
ssh -i ~/.ssh/YOUR_KEY YOUR_ADMIN_USER@YOUR_SERVER_IPV4
```

```bash
sudo -v
```

From here on, every command runs in this admin session. Turn off root login and password
logins, and allow only your account. On Ubuntu 24.04 `sshd` reads
`/etc/ssh/sshd_config.d/*.conf` first and keeps the first value it sees, so `00-` wins over
the image's own files (such as `50-cloud-init.conf`):

```bash
sudo tee /etc/ssh/sshd_config.d/00-nenaugad.conf >/dev/null <<EOF
# Nenaugad (deploy/README.md, step 2): keys only, no root, only the admin account.
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
AllowUsers $USER
EOF
sudo sshd -t && sudo systemctl restart ssh
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|authenticationmethods|allowusers) '
sudo passwd -l root
```

The `sshd -T` lines must read `no`, `no`, `no`, `yes`, `publickey` and your account. Then, in
a third terminal on your computer, both of these must hold before you close the root session:

```bash
ssh -i ~/.ssh/YOUR_KEY YOUR_ADMIN_USER@YOUR_SERVER_IPV4 true && echo "admin login works"
ssh -i ~/.ssh/YOUR_KEY root@YOUR_SERVER_IPV4 true || echo "root login refused, as it should be"
```

## 3. Automatic security updates

Ubuntu 24.04 installs `unattended-upgrades` and turns it on. Check, do not assume:

```bash
systemctl is-enabled unattended-upgrades
systemctl is-active unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
systemctl list-timers 'apt-daily*' --no-pager
sudo unattended-upgrade --dry-run --debug 2>&1 | tail -n 20
```

Expected: `enabled`, `active`, both lines in `20auto-upgrades` set to `"1"`, two timers
scheduled, and a dry run that names its allowed origins (Ubuntu's `-security` among them)
without errors. If any of that is missing:

```bash
sudo apt install -y unattended-upgrades
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
```

Two things it does not do. It updates only Ubuntu's own packages: Docker, Caddy and Node come
from their own repositories, so run `sudo apt update && sudo apt upgrade` once a month (Node
stays put: it is held, step 6). And it never reboots: look for `/var/run/reboot-required`
weekly and reboot at a quiet hour ([After a reboot](#after-a-reboot)).

## 4. Swap: 2 GB

A cold `next build` peaked near 3 GB on the development machine (the plan's "Sizing"), more
than a 4 GB server has free next to everything else. Swap covers that peak.

```bash
swapon --show
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-nenaugad-swap.conf
sudo sysctl --system >/dev/null
free -h
```

`swapon --show` prints nothing on a fresh Hetzner image; if it lists a swap already, skip
this step. `free -h` then shows 2.0Gi of swap.

## 5. Docker Engine, from Docker's apt repository

From Docker's [Ubuntu install guide](https://docs.docker.com/engine/install/ubuntu/) (read
2026-11-04; Ubuntu 24.04 is supported on x86_64 and arm64). Remove anything that conflicts
(nothing, on a fresh image), add the repository, install:

```bash
sudo apt remove $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc | cut -f1)
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Container logs rotate with the `local` log driver (Docker's default `json-file` grows without
limit). Set it before the first container, then check the install:

```bash
echo '{ "log-driver": "local" }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
sudo docker run --rm hello-world
systemctl is-enabled docker
```

Nobody joins the `docker` group: membership is root by another name. Docker commands run
with `sudo`. (Docker's guide warns that published container ports bypass `ufw`; that does not
matter here, because `compose.yaml` publishes Postgres on 127.0.0.1 only and the firewall is
Hetzner's, outside the server.)

## 6. Node 26.7.0, pinned to the exact version

The version in `.nvmrc`, which CI runs. From NodeSource's apt repository: one system-wide
`/usr/bin/node` that systemd can run, from a signed repository, pinned to one exact version
and held there. (nvm installs per user, under a home directory: a poor fit for system
services.) NodeSource's `node_26.x` repository listed `26.7.0-1nodesource1` for amd64 and
arm64 on 2026-11-04; the steps are its
[manual installation](https://github.com/nodesource/distributions/wiki/Repository-Manual-Installation).

```bash
sudo apt install -y ca-certificates curl gnupg
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
sudo tee /etc/apt/sources.list.d/nodesource.sources <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_26.x/
Suites: nodistro
Components: main
Signed-By: /etc/apt/keyrings/nodesource.gpg
EOF
sudo apt update
apt-cache madison nodejs | grep 26.7.0
sudo apt install -y nodejs=26.7.0-1nodesource1
sudo apt-mark hold nodejs
node --version
```

`node --version` must print `v26.7.0`; `apt-mark showhold` lists `nodejs`. npm comes with it.
The release script refuses to deploy a commit whose `.nvmrc` names another version
([Update](#update-a-new-commit-from-main) says how to move).

## 7. Caddy, from its apt repository

From Caddy's [install guide](https://caddyserver.com/docs/install) (read 2026-11-04):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
caddy version
```

The package starts `caddy.service` (user `caddy`, config `/etc/caddy/Caddyfile`) with a
placeholder page on port 80. Step 13 replaces it.

## 8. The repository

Two shell helpers for this admin session (define them again in every new session, or add them
to your `~/.bashrc`): `app` runs a command as `nenaugad` inside the checkout, `dc` runs Docker
Compose on the checkout's `compose.yaml` and `.env`.

```bash
app() { sudo -u nenaugad -H env -C /srv/nenaugad/app NEXT_TELEMETRY_DISABLED=1 "$@"; }
dc() { sudo docker compose -f /srv/nenaugad/app/compose.yaml --env-file /srv/nenaugad/app/.env "$@"; }
```

Clone over HTTPS (the repository is public; the server holds no GitHub credential) and check
out the commit to deploy:

```bash
sudo apt install -y git
sudo -u nenaugad -H env -C /srv/nenaugad git clone https://github.com/YOUR_GITHUB_ACCOUNT/nenaugad.git app
app git checkout --detach COMMIT
app git log -1 --oneline
```

The server tree is never edited by hand: every change arrives as a commit through `main`.

## 9. The production `.env`

All server settings live in `/srv/nenaugad/app/.env` and nowhere else: Next reads `.env`,
and so do `npm run doctor`, the worker and the database scripts. Do not create
`.env.production` or `.env.local`: Next would read them, the scripts would not. Never run the
server with `ATLAS_ENV=local`: that mode has open sign-up and non-`Secure` cookies (and it
refuses a public `NEXTAUTH_URL` anyway, `NEXTAUTH_URL_NOT_LOOPBACK`).

`npm run setup` writes `.env` from `.env.example` with mode 600, a random database password
(in `POSTGRES_PASSWORD` and `DATABASE_URL`) and a random 32-byte `AUTH_SECRET`, prints no
secret and never overwrites an existing `.env`. It needs nothing installed yet. Then switch it
to production:

```bash
app npm run setup
DOMAIN=example.org
app sed -i \
  -e 's|^ATLAS_ENV=.*|ATLAS_ENV=production|' \
  -e 's|^DATA_BACKEND=.*|DATA_BACKEND=postgres|' \
  -e 's|^LIVE_AI_ENABLED=.*|LIVE_AI_ENABLED=false|' \
  -e 's|^UPLOADS_ENABLED=.*|UPLOADS_ENABLED=false|' \
  -e "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://$DOMAIN|" \
  .env
sudo stat -c '%a %U:%G %n' /srv/nenaugad/app/.env
app grep -E '^(ATLAS_ENV|DATA_BACKEND|LIVE_AI_ENABLED|LIVE_SOURCES_ENABLED|UPLOADS_ENABLED|NEXTAUTH_URL|NEXT_TELEMETRY_DISABLED|POSTGRES_DB|POSTGRES_PORT)=' .env
app npm run doctor
```

`stat` must print `600 nenaugad:nenaugad`. The `grep` shows only settings that are not secret;
never print the whole file. `npm run doctor` must report `"environment": "production"`,
`"backend": "postgres"`, `"authSecret": "set"`, `"signUp": "closed"`, `"uploads": false` and
`"realAi": false`. On a refusal it prints `CONFIGURATION_REJECTED: <CODE>` and nothing else;
the table says what each code means.

What production mode needs (checked against `src/server/config.ts`, `scripts/doctor.ts` and
`.env.example` at DEPLOY-002):

| Variable | On the server | Refused with |
|---|---|---|
| `ATLAS_ENV` | `production` | `INVALID_ATLAS_ENV` (anything but `local`, `test`, `production`) |
| `DATA_BACKEND` | `postgres` | `PRODUCTION_REQUIRES_POSTGRES`; `INVALID_DATA_BACKEND` |
| `AUTH_SECRET` | from `npm run setup`: 64 hex characters (32 random bytes) | `PRODUCTION_SECRET_REQUIRED` (unset or empty), `PRODUCTION_SECRET_TOO_SHORT` (under 32 bytes), `PRODUCTION_SECRET_PUBLIC` (a test secret committed in this repository) |
| `NEXTAUTH_SECRET` | **not set**: next-auth prefers it over `AUTH_SECRET`, and an empty one counts as no secret | the same codes as `AUTH_SECRET` |
| `NEXTAUTH_URL` | `https://example.org`, the address people open | `PRODUCTION_URL_REQUIRED`, `PRODUCTION_URL_INVALID`, `PRODUCTION_URL_NOT_HTTPS`, `PRODUCTION_URL_LOOPBACK` |
| `UPLOADS_ENABLED` | `false` | `PRODUCTION_UPLOADS_NOT_APPROVED` (`true`); `UPLOADS_ENABLED_NOT_IMPLEMENTED` (other values) |
| `LIVE_AI_ENABLED` | `false` until the restore drill passes (D6) | `LIVE_AI_ENABLED_INVALID` (not `true`/`false`) |
| `LIVE_SOURCES_ENABLED` | `false` (as written by setup) | `LIVE_SOURCES_ENABLED_NOT_IMPLEMENTED` (anything else): the source policies are the control |
| `DATABASE_URL` | from setup: `postgresql://atlas:…@127.0.0.1:54329/atlas_starter` | `DATABASE_URL_REQUIRED`, `INVALID_DATABASE_URL`, `INVALID_DATABASE_PROTOCOL`, `LOCAL_DATABASE_REQUIRED` (not loopback), `DATABASE_OPTIONS_NOT_ALLOWED`, `ISOLATED_DATABASE_REQUIRED` (not `atlas_starter`), `LOCAL_DATABASE_CREDENTIALS_REQUIRED` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | `atlas`, from setup, `atlas_starter`, `54329` | Compose refuses to start without the first two ("Run npm run setup") |
| `NEXT_TELEMETRY_DISABLED` | `1` | |
| `REGISTRATION_LIMIT` | empty (sign-up is closed in production anyway) | `REGISTRATION_LIMIT_INVALID` (only ever refuses registration) |
| `TEST_DATABASE_URL` | empty: never on the server | |
| `OPENAI_API_KEY` | absent until the owner switches live AI on (D6) | |

`npm run doctor` refuses on the first failing condition, in this order: `ATLAS_ENV`,
`LIVE_AI_ENABLED`, `LIVE_SOURCES_ENABLED`, `UPLOADS_ENABLED`, `DATA_BACKEND`, then the
production conditions. It does not check `DATABASE_URL`. In step 11 `db:migrate` fails on a
bad one with the bare `MIGRATION_FAILED`; `seed:budgets` (`{"ok":false,"code":...}`) and the
worker (`worker_failed`) name the code.

To make a secret by hand (rotation, below): `openssl rand -hex 32` gives 32 random bytes as 64
hex characters, the same as `npm run setup`.

## 10. Postgres, on 127.0.0.1 only

```bash
dc up -d db
dc ps
dc port db 5432
```

`dc ps` shows the `db` service `healthy` within a minute (repeat it until it does).
`dc port` must print `127.0.0.1:54329` and nothing on `0.0.0.0` or `[::]`. The data lives in the Docker volume
of this Compose project; `restart: unless-stopped` brings Postgres back with Docker after a
reboot.

## 11. Install, migrate, seed the budgets, build

```bash
app npm ci --no-audit --no-fund
app npm run db:migrate
app npm run seed:budgets
app npm run build
```

- `db:migrate` prints the number of migrations it applied (all of them, on the empty database:
  owner decision D4, start empty).
- `seed:budgets` creates the AI budget rows (the global budget and the extraction owner's
  quota); it is safe to run again and prints `"ok":true`. Live AI stays off regardless.
- `build` takes a few minutes on 2 vCPU and may use swap. If it is killed, check `free -h`
  and step 4.
- **Not on the server:** `npm run db:seed` (the synthetic local catalog), `npm run dev`, the
  test commands, and every `models:*`, `eval:*` or `embeddings:*` script (the 14 GB
  `models/` folder stays off the server).

After the build, `app git status --short` shows ` M next-env.d.ts`: Next rewrites that
generated file on every build (the committed copy is the `next dev` form). That is expected;
the release script puts it back before it checks the tree.

## 12. The services

Install root-owned copies of the units (never symlinks into the checkout, which `nenaugad`
can write), check them, start them:

```bash
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-web.service /srv/nenaugad/app/deploy/systemd/nenaugad-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/nenaugad-web.service /etc/systemd/system/nenaugad-worker.service
sudo systemctl enable --now nenaugad-web.service nenaugad-worker.service
systemctl status --no-pager nenaugad-web nenaugad-worker
curl -s http://127.0.0.1:3000/api/health; echo
journalctl -u nenaugad-worker -n 20 --no-pager
```

- `systemd-analyze verify` should print nothing; read anything it does print before going on
  (the units were checked only by reading when they were written).
- `/api/health` answers `{"status":"alive","environment":"production","data":"postgres",...}`.
- The worker logs `worker_start`, then its first attempts per source: the database starts
  empty and fills from the live sources (D4).
- For the record: `sudo systemd-analyze security nenaugad-web.service | tail -n 1` gives the
  unit's exposure score.

What the units do: web runs `npm start -- --keepAliveTimeout 130000` (Next's docs: Node's
keep-alive must outlast the proxy's, and Caddy keeps idle connections 2 minutes) with a
1024 MB heap cap (`NODE_OPTIONS=--max-old-space-size=1024`, from the measured 206–661 MB),
and stops within 30 s (Next drains in-flight requests on SIGTERM). The worker restarts
always, 30 s apart, and gets 5 minutes to finish an import on SIGTERM. Both run
`npm run doctor` first, so a refused configuration shows its code in the journal. Both are
sandboxed: read-only system, no home directories, no privileges, only `.next` writable for
web. `MemoryDenyWriteExecute` is off on purpose (V8's JIT needs it off), and no system call
filter is set yet (not tested against Node 26).

Install the release script, the only way to change the deployed commit from now on:

```bash
sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-release.sh /usr/local/sbin/nenaugad-release
sudo nenaugad-release status
```

## 13. Caddy: HTTPS and the private stage

Needs the domain (D3) with an A record pointing at `YOUR_SERVER_IPV4`. Check from the server
first; Let's Encrypt fails, and retries with backoff, while it does not resolve:

```bash
DOMAIN=example.org
getent hosts "$DOMAIN"
```

The private stage's password: make one, keep it in your password manager, then hash it.
`caddy hash-password` asks for it twice without echoing it and prints a bcrypt hash; the hash
goes into a root-owned file, never into the environment (the packaged `caddy.service` runs
`caddy run --environ`, which prints its environment to the journal) and never into the
repository.

```bash
openssl rand -base64 24
BASIC_USER=YOUR_BASIC_AUTH_USER
HASH=$(caddy hash-password)
case "$HASH" in '$2a$'*) echo "hash ok" ;; *) echo "unexpected output, stop here" ;; esac
sudo install -m 640 -o root -g caddy /dev/null /etc/caddy/nenaugad-private-stage.caddy
sudo tee /etc/caddy/nenaugad-private-stage.caddy >/dev/null <<EOF
# Nenaugad private stage (deploy/README.md, step 13): basic auth on everything but /api/health.
(nenaugad_private_stage) {
    basic_auth {
        $BASIC_USER $HASH
    }
}
EOF
unset HASH
```

The domain goes to Caddy through a drop-in, the Caddyfile is a verbatim copy of
[deploy/Caddyfile](Caddyfile), and `caddy validate` checks it as the `caddy` user before the
restart:

```bash
printf 'NENAUGAD_DOMAIN=%s\n' "$DOMAIN" | sudo tee /etc/caddy/nenaugad.env
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironmentFile=/etc/caddy/nenaugad.env\n' | sudo tee /etc/systemd/system/caddy.service.d/nenaugad.conf
sudo systemctl daemon-reload
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --envfile /etc/caddy/nenaugad.env
sudo systemctl restart caddy
journalctl -u caddy -n 30 --no-pager
```

The journal shows the certificate being obtained for your domain within a minute. Then check
what the outside sees:

```bash
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://$DOMAIN/"
curl -sI "https://$DOMAIN/" | head -n 1
curl -s "https://$DOMAIN/api/health"; echo
head -c 2000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' --data-binary @- "https://$DOMAIN/api/health"
curl -s -o /dev/null -w '%{http_code}\n' -u "$BASIC_USER" "https://$DOMAIN/"
curl -s -u "$BASIC_USER" -X POST -H 'Content-Type: application/json' -d '{}' "https://$DOMAIN/api/v1/auth/register"; echo
```

| Check | Expected |
|---|---|
| plain HTTP | `308 https://example.org/` (the redirect) |
| HTTPS without the password | `401` |
| `/api/health` | `{"status":"alive","environment":"production",...}`, no password asked |
| a 2 MB body | `413` |
| with the password (curl asks for it) | `200` |
| sign-up | `{"error":"REGISTRATION_CLOSED"}` (403) |

Then open `https://example.org` in your browser: the password prompt, then the site; the login
page offers no registration.

Caddy keeps no access log (no `log` directive), so visitors' IP addresses are not stored.

## Monitoring

Nothing here signs up for a service. Which monitoring services to use is part of owner
decision D7: each of them becomes a processor. Neither check sends personal data.

**Uptime check (web, TLS, DNS, Caddy).** An external monitor requests
`https://example.org/api/health` every 5 minutes and alerts when the answer is not `200` or
lacks `"status":"alive"`. The path is outside basic auth, so the monitor holds no password. It
answers only fixed facts (environment, backend, the AI and uploads switches). It is liveness
only: it does not touch Postgres.

**Worker heartbeat (worker, disk).** A dead man's switch: the monitor gives you a URL and
alerts when it is not called on time. A timer on the server calls it every 5 minutes, but only
while the worker has been running for at least 2 minutes (a crash loop never qualifies) and
the root disk is under 85 % full ([script](nenaugad-heartbeat.sh),
[service](systemd/nenaugad-heartbeat.service), [timer](systemd/nenaugad-heartbeat.timer)). Set
the monitor's period to 5 minutes and its grace to 15, so a deploy does not alert. Install it
once D7 has named the service:

```bash
sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-heartbeat.sh /usr/local/sbin/nenaugad-heartbeat
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-heartbeat.service /srv/nenaugad/app/deploy/systemd/nenaugad-heartbeat.timer /etc/systemd/system/
sudo install -d -m 700 /etc/nenaugad
sudo install -m 600 /dev/null /etc/nenaugad/heartbeat.env
sudoedit /etc/nenaugad/heartbeat.env
sudo systemctl daemon-reload
sudo systemctl start nenaugad-heartbeat.service; journalctl -u nenaugad-heartbeat -n 5 --no-pager
sudo systemctl enable --now nenaugad-heartbeat.timer
```

In `sudoedit`, write one line: `HEARTBEAT_URL=` followed by the monitor's URL. The URL is a
secret of sorts (anyone holding it can fake a ping), so it stays in that root-only file.

**What neither check sees:** whether imports succeed. A source whose policy lapsed or that
paused after repeated failures is skipped without a log line while the worker stays up. Check
by hand, weekly:

```bash
app npm run --silent worker -- --status
sudo nenaugad-release status
df -h /
free -h
```

`--status` prints one line per source: `"fetch":"allowed"` or `"denied"`, `paused`,
`consecutiveFailures`, `lastRunAt`, `nextDueAt`. A paused source resumes with
`app npm run worker -- --resume <source>` once the cause is understood.

## Update: a new commit from `main`

1. On your computer, confirm the commit is on `main` and its CI is green (`npm run ci:status`).
2. On the server:

```bash
sudo nenaugad-release deploy COMMIT --no-backup
```

The script refuses, without changing anything, when the checkout has uncommitted changes, the
commit is not on `origin/main`, it is not ahead of the deployed one, its `.nvmrc` names
another Node version, or it adds migrations you did not acknowledge (it lists them; rerun with
`--migrations` once you accept that they cannot be rolled back until DEPLOY-003). It also
refuses without `--no-backup` while DEPLOY-003 is not done, so each deploy without a backup is
your choice, stated each time.

Then it stops web and worker, checks out the commit, runs `npm ci`, `npm run doctor`,
`npm run db:migrate`, `npm run seed:budgets` and `npm run build`, starts both services and
waits for `/api/health` to answer in production mode. The site is down (Caddy answers 502)
from the stop to the end, a few minutes: `npm ci` and the build replace files the running
server reads, and the build needs the memory. If anything fails, the services may stay
stopped and the script prints the rollback command.

At the end it warns when a root-owned copy differs from the new commit's file. Read the
difference first (`sudo diff <installed> /srv/nenaugad/app/<file>`), then install it:

```bash
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-web.service /srv/nenaugad/app/deploy/systemd/nenaugad-worker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart nenaugad-web nenaugad-worker
```

```bash
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --envfile /etc/caddy/nenaugad.env && sudo systemctl reload caddy
```

```bash
sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-release.sh /usr/local/sbin/nenaugad-release
```

**A new Node version** (a task changed `.nvmrc`): install it before deploying the commit,
with the version the commit names in place of `X.Y.Z`:

```bash
sudo apt-mark unhold nodejs
sudo apt update
sudo apt install -y nodejs=X.Y.Z-1nodesource1
sudo apt-mark hold nodejs
node --version
```

A new major version needs the `node_XX.x` line of step 6 changed first. The running services
keep the old Node until the deploy restarts them.

## Rollback

```bash
sudo nenaugad-release rollback
```

goes back to the commit deployed before the last deploy (`sudo nenaugad-release status` shows
both); `sudo nenaugad-release rollback COMMIT` goes to a named one. Like a deploy, it refuses
on a dirty tree, a commit that is not on `origin/main` or a Node mismatch. It never migrates
and needs no network.

If the commit you leave added migrations, the rollback refuses and lists them: they stay
applied, and the older code would run on the newer schema. The older code ignores migrations
it does not know, so it often works; rerun with `--across-migrations` to accept that.
Returning the database itself to its state before a migration is a restore from a backup,
which needs DEPLOY-003.

## Secret rotation

Rotate when a secret may have leaked, when someone who knew it leaves, and otherwise once a
year. Each secret lives in exactly one place on the server.

**`AUTH_SECRET`** (signs sessions, keys the login attempt counters, B54). Everyone signed in
is signed out, and the attempt counters start over.

```bash
app sh -c 'NEW=$(openssl rand -hex 32) && sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$NEW|" .env'
sudo systemctl restart nenaugad-web nenaugad-worker
app npm run doctor
```

The new value never reaches your screen, your shell history or the sudo log.

**The database password.** Postgres keeps the password it was initialised with; changing
`POSTGRES_PASSWORD` in `.env` alone changes nothing, so change it in Postgres first.
`\password` sends it encrypted, so it lands in no log:

```bash
openssl rand -hex 24
dc exec db psql -U atlas -d atlas_starter -c '\password atlas'
sudoedit -u nenaugad /srv/nenaugad/app/.env
sudo systemctl restart nenaugad-web nenaugad-worker
app npm run doctor && curl -s http://127.0.0.1:3000/api/health; echo
journalctl -u nenaugad-worker -n 5 --no-pager
```

Paste the new password twice at the `psql` prompt, then in `sudoedit` put it into both
`POSTGRES_PASSWORD` and `DATABASE_URL` (between `atlas:` and `@`). Hex needs no escaping in
a URL.

**The private-stage password.** Repeat the hashing part of step 13 (`openssl rand`,
`caddy hash-password`, rewriting `/etc/caddy/nenaugad-private-stage.caddy`), then:

```bash
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile --envfile /etc/caddy/nenaugad.env && sudo systemctl reload caddy
```

**`OPENAI_API_KEY`** is not on the server until the owner switches live AI on after the
restore drill (D6). From then on: create the new key at the provider, put it in `.env` with
`sudoedit -u nenaugad /srv/nenaugad/app/.env`, restart web and worker, then revoke the old
key at the provider.

**The heartbeat URL:** make a new one in the monitor, `sudoedit /etc/nenaugad/heartbeat.env`,
delete the old one in the monitor.

**Your SSH key:** append the new public key to `~/.ssh/authorized_keys` on the server, log in
with it in a new terminal, then delete the old key's line.

## Source policies expire on 2026-12-23

All three live source policies (Himalayas, Jobicy, Remote First Jobs) are valid until
2026-12-23 00:00 UTC (`valid_until` in `src/server/source-policies.ts`). From then on the
worker skips them without a log line and the catalog stops refreshing, while every check above
stays green. **Renew them before that date:** a source-rights review task (re-read each
source's terms, then the owner approves new policy dates), merged into `main` and deployed by
an update. Put a reminder in your calendar for 2026-12-09. Afterwards,
`app npm run --silent worker -- --status` shows `"fetch":"allowed"` for each source again.

## Backups and the restore drill: waiting on DEPLOY-003

**Not implemented. No backup is taken on this server, and nothing can be restored.**

- There is no backup timer and no backup command yet. DEPLOY-003 adds them: a nightly
  `pg_dump`, encrypted and copied off the server (14 daily and 8 weekly kept), and a restore
  that deletes again every account listed in `account_deletions` before the database is used.
- Hetzner's own backups stay off for that reason: a disk image would bring deleted accounts
  back.
- Until then the release script demands `--no-backup` on every deploy, and a rollback across
  a migration cannot return the database to its earlier state.
- **The restore drill** (restore a real backup into a fresh database on this server and check
  it) is the condition for switching live AI on (D6) and part of DEPLOY-007. It cannot run
  before DEPLOY-003.

While the server has no users and an empty start, losing the database costs the imported
catalog (the worker imports it again) and the AI budget rows (`seed:budgets` recreates them).

## After a reboot

Everything comes back by itself: Docker and its Postgres container (`restart:
unless-stopped`), `nenaugad-web`, `nenaugad-worker` and `caddy` (enabled units). The worker
may fail once or twice while Postgres starts, and restarts 30 s later. Check with:

```bash
sudo nenaugad-release status
```

## Known limits at this commit

- No backup or restore (DEPLOY-003); the production CSP is the local one (DEPLOY-005).
- No account can sign in on the server (D5 sub-question), and the demo banner still carries
  the local wording (DEPLOY-007).
- `/api/health` is liveness only; the heartbeat proves the worker process and the disk, not
  that imports succeed.
- The heap cap and the timings come from the development machine; DEPLOY-007 measures the
  server, including the worker's peak during a real import (no cap until then).
- The units were checked by reading, not with `systemd-analyze` (written on Windows); step 12
  runs `systemd-analyze verify` on the server.
