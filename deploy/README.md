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
| `YOUR_STORAGE_BOX_USER` | the Storage Box login the server uses for the off-site copies (`u123456`, or a sub-account's `u123456-sub1`) |
| `YOUR_STORAGE_BOX_HOST` | the Storage Box's address (`u123456.your-storagebox.de`) |
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
  live AI off (owner decision D6: until the restore drill passes);
- **database backups** (DEPLOY-003): `npm run db:backup` every night and before every deploy,
  and `npm run db:restore`, which deletes again every account deleted after the backup was
  taken ([Backups and restore](#backups-and-restore)).

**Not ready, and nothing here pretends otherwise:**

- **The encrypted off-site copy of the backups** needs the Storage Box, which you order
  ([Off-site copy](#off-site-copy-age-and-a-hetzner-storage-box)). Until it runs, every backup
  stays on this server's disk, and a lost server takes its backups with it.
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
  `npm run db:restore` deletes them again ([Backups and restore](#backups-and-restore)).
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
  -e 's|^BACKUP_DIR=.*|BACKUP_DIR=/srv/nenaugad/backups|' \
  -e 's|^PG_BIN_DIR=.*|PG_BIN_DIR=/usr/lib/postgresql/17/bin|' \
  -e 's|^PG_TOOLS_CONTAINER=.*|PG_TOOLS_CONTAINER=|' \
  .env
sudo stat -c '%a %U:%G %n' /srv/nenaugad/app/.env
app grep -E '^(ATLAS_ENV|DATA_BACKEND|LIVE_AI_ENABLED|LIVE_SOURCES_ENABLED|UPLOADS_ENABLED|NEXTAUTH_URL|NEXT_TELEMETRY_DISABLED|POSTGRES_DB|POSTGRES_PORT|BACKUP_DIR|PG_BIN_DIR|PG_TOOLS_CONTAINER)=' .env
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
| `BACKUP_DIR` | `/srv/nenaugad/backups` | `db:backup`: `BACKUP_DIR_REQUIRED`, `BACKUP_DIR_NOT_ABSOLUTE`, `BACKUP_DIR_INSIDE_REPOSITORY` |
| `PG_BIN_DIR` | `/usr/lib/postgresql/17/bin` (PGDG's client, [Backups and restore](#backups-and-restore)) | `PG_BIN_DIR_NOT_ABSOLUTE`; `PG_TOOL_NOT_FOUND` when the client is missing |
| `PG_TOOLS_CONTAINER` | empty: `docker exec` needs root here | `PG_TOOLS_AMBIGUOUS` (set together with `PG_BIN_DIR`) |

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

Then set up the backups ([Install once](#install-once)): every later deploy takes one first.

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
journalctl -t nenaugad-backup -n 3 --no-pager
journalctl -t nenaugad-deletions -n 1 --no-pager
journalctl -t nenaugad-offsite -n 3 --no-pager
systemctl --failed --no-pager
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
sudo nenaugad-release deploy COMMIT
```

The script refuses, without changing anything, when the checkout has uncommitted changes, the
commit is not on `origin/main`, it is not ahead of the deployed one, its `.nvmrc` names
another Node version, or it adds migrations you did not acknowledge (it lists them; rerun with
`--migrations` once you accept that going back past them means restoring this deploy's
backup). It also refuses when `nenaugad-backup.service` is not installed.

Then it stops web and worker and **backs up the database** by starting
`nenaugad-backup.service` (the nightly backup's unit), so the dump holds every write up to the
deploy; it prints the dump's JSON line (`"file":"/srv/nenaugad/backups/atlas_starter-….dump"`):
note the file name, it is the one a [restore](#restore-replacing-the-database) after this
deploy uses. If the backup fails, the script starts web and worker again on the commit they
ran, changes nothing else and stops (`journalctl -u nenaugad-backup -n 30` says why).
`--no-backup` skips the backup; use it only knowingly, for example when the deployed commit is
older than `npm run db:backup` itself.

Then it checks out the commit, runs `npm ci`, `npm run doctor`,
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
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-backup.service /srv/nenaugad/app/deploy/systemd/nenaugad-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart nenaugad-backup.timer
```

```bash
sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-offsite.sh /usr/local/sbin/nenaugad-offsite
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-offsite.service /srv/nenaugad/app/deploy/systemd/nenaugad-offsite.timer /srv/nenaugad/app/deploy/systemd/nenaugad-deletions.service /srv/nenaugad/app/deploy/systemd/nenaugad-deletions.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart nenaugad-offsite.timer nenaugad-deletions.timer
```

A deletion export that runs while the deploy's `npm ci` replaces `node_modules` can fail once
and show in `systemctl --failed`; the next one, 15 minutes later, clears it.

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
Returning the database itself to its state before a migration is a restore of the backup that
deploy took ([Restore](#restore-replacing-the-database), case "back to an older commit"):
everything written since that deploy is lost, except account deletions, which the restore
applies again.

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

## Backups and restore

Written for DEPLOY-003 ([task](../tasks/DEPLOY-003-backup-restore.md)); tested against the
isolated test database, not yet on a server (DEPLOY-007 runs the first drill there).

- **`npm run db:backup`** writes one `pg_dump` custom-format file,
  `atlas_starter-<UTC time>.dump`, mode 600, into `/srv/nenaugad/backups` (outside the
  checkout: a directory inside it, or one others can read, is refused). The file gets that
  name only after the dump has been read back whole; it prints one JSON line (file, size,
  SHA-256), never a row or a secret.
- **`nenaugad-backup.service`** runs it as `nenaugad` ([unit](systemd/nenaugad-backup.service));
  **`nenaugad-backup.timer`** starts it every night at 03:15 UTC plus up to 15 minutes
  ([timer](systemd/nenaugad-backup.timer)); `nenaugad-release deploy` starts it before every
  deploy, with web and worker stopped.
- **`nenaugad-offsite.timer`** copies every new dump, encrypted with age to your public key, to
  a Hetzner Storage Box, and keeps there every copy of the last 14 days and the newest of each of
  the last 8 weeks (so the oldest is about 8 weeks old); **`nenaugad-deletions.timer`** exports the deletion ledger every 15
  minutes when it changed (and once after each dump), and it is copied the same way ([Off-site copy](#off-site-copy-age-and-a-hetzner-storage-box)).
- **`npm run db:restore -- FILE --drill|--replace`** restores into a fresh database,
  `atlas_starter_restore`. There it deletes again every account listed in `account_deletions`:
  in the backup, in the live database (whose ledger holds the deletions made after the backup)
  and in any newer backup you name. It also empties the login attempt counters. Then it checks
  that none of those accounts, none of their rows and no row whose parent is gone is left.
  Only then `--drill` drops it, or `--replace` swaps it in for `atlas_starter`. Any failure
  drops it and leaves the live database as it was.
- **Why `pg_dump` runs on the host, not in the container:** `docker exec` is root on this
  server, and the backup should run as `nenaugad` like every other npm script. So the host
  gets PGDG's `postgresql-client-17`, the Postgres project's own signed repository, the same
  package CI tests with. Its major version must be the server's (17); the commands check that
  (`PG_CLIENT_VERSION_MISMATCH`).

### Install once

PGDG's client, as on [postgresql.org](https://www.postgresql.org/download/linux/ubuntu/)
(manual configuration, read 2026-11-04). The key must show the fingerprint
`B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`:

```bash
sudo apt install -y curl ca-certificates gpg
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
gpg --show-keys /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
```

```bash
sudo tee /etc/apt/sources.list.d/pgdg.sources <<EOF
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF
sudo apt update
sudo apt install -y --no-install-recommends postgresql-client-17
/usr/lib/postgresql/17/bin/pg_dump --version
```

`pg_dump --version` prints `pg_dump (PostgreSQL) 17.x`. Only the client is installed: the
server stays in Docker. Like Docker, Caddy and Node, it is updated by the monthly
`sudo apt upgrade` (step 3), not by `unattended-upgrades`.

The settings (step 9 writes them on a new server; a `.env` from before DEPLOY-003 lacks them,
so add them with `sudoedit -u nenaugad /srv/nenaugad/app/.env`), the directory, and a first
backup by hand:

```bash
app grep -E '^(BACKUP_DIR|PG_BIN_DIR|PG_TOOLS_CONTAINER)=' .env
sudo install -d -m 700 -o nenaugad -g nenaugad /srv/nenaugad/backups /srv/nenaugad/restore
app npm run --silent db:backup
sudo ls -l /srv/nenaugad/backups
```

The `grep` shows `BACKUP_DIR=/srv/nenaugad/backups`, `PG_BIN_DIR=/usr/lib/postgresql/17/bin`
and an empty `PG_TOOLS_CONTAINER=`. The backup prints
`{"ok":true,"file":"/srv/nenaugad/backups/atlas_starter-….dump",...,"postgresMajor":17}`, and
`ls` shows the file as `-rw-------` owned by `nenaugad`. (`/srv/nenaugad/restore` is where
copies brought back from the box go, apart from the dumps the timers handle.) Then the units,
a run through systemd, and the timer:

```bash
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-backup.service /srv/nenaugad/app/deploy/systemd/nenaugad-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/nenaugad-backup.service /etc/systemd/system/nenaugad-backup.timer
sudo systemctl start nenaugad-backup.service
journalctl -t nenaugad-backup -n 5 --no-pager
sudo systemctl enable --now nenaugad-backup.timer
systemctl list-timers nenaugad-backup.timer --no-pager
```

**When a backup fails,** `journalctl -t nenaugad-backup` shows one line with a code:

| Code | Means |
|---|---|
| `BACKUP_DIR_REQUIRED`, `BACKUP_DIR_NOT_ABSOLUTE`, `BACKUP_DIR_INSIDE_REPOSITORY` | `BACKUP_DIR` in `.env` is missing, relative, or inside the checkout |
| `BACKUP_DIR_NOT_PRIVATE` | the directory is readable by others: `sudo chmod 700 /srv/nenaugad/backups` |
| `PG_TOOL_NOT_FOUND` | the client is not installed, or `PG_BIN_DIR` names the wrong directory |
| `PG_CLIENT_VERSION_MISMATCH` | `"client"` and `"server"` majors differ: install the client the server's major needs |
| `PG_DUMP_FAILED` | `pg_dump` exited with an error; its own message is not printed (it can quote a row): run it by hand in a terminal you do not record |
| `BACKUP_UNREADABLE`, `BACKUP_INCOMPLETE` | the written archive did not read back whole, or lacks `users` or `account_deletions`; no file was named |
| `BACKUP_FAILED` with `"sqlstate"` or `"cause"` | the database refused (`28P01`: wrong password in `.env`) or did not answer (`ECONNREFUSED`: Postgres is down, step 10) |
| `LEDGER_MISSING`, `LINEAGE_MISSING` (`db:export-deletions`, `journalctl -t nenaugad-deletions`) | the database lacks a migration: `app npm run db:migrate` |

A unit that failed shows in `systemctl --failed`. Nothing alerts on it yet: look weekly, with
the checks in [Monitoring](#monitoring).

### Off-site copy: age and a Hetzner Storage Box

Owner decision 2026-11-04 (part of D7): every dump is encrypted with
[age](https://github.com/FiloSottile/age) to your public key and copied to a Hetzner Storage
Box over SFTP. Hetzner already processes data for the server, so the list of processors does
not grow, but the copies depend on the same Hetzner account as the server: an account problem
takes both ([Known limits](#known-limits-at-this-commit)).

[`nenaugad-offsite`](nenaugad-offsite.sh) runs every 15 minutes
([service](systemd/nenaugad-offsite.service), [timer](systemd/nenaugad-offsite.timer)). For each
dump not yet copied it encrypts, uploads, compares the SHA-256 on the box with its own and
records the upload with root's own clock. Then the box keeps every dump copied in the last 14
days and the newest copied in each of the last 8 ISO weeks (counted from now: the oldest copy
is about 8 weeks old); the server keeps its
3 newest dumps and deletes older ones once they are copied. A run with nothing new connects to
nothing. The server holds only your public key, so it cannot read its own copies. Root touches
the dumps only as `nenaugad`.

**What a compromised server can do to the copies.** The box's SSH key is root's: the web
server's user can neither read it nor delete a copy on the box. It can put files of its own
into `/srv/nenaugad/backups` to be copied. Retention follows only the upload records, never the
names; names dated in the future are skipped, and a name the box already holds without this
server's record is never overwritten. So such files cannot push out a dump or an export copied in
the last 14 days. They can take the weekly slot of each week they are planted in. Whoever has root on
the server has the box's key and can delete everything there. Against both, the box's own
**snapshots** (step 2), which no key on the server can delete, are the protection: they are
required, not optional.

**The deletion ledger, every 15 minutes** (owner decision 2026-11-05):
`nenaugad-deletions.timer` runs `npm run db:export-deletions` as `nenaugad`
([service](systemd/nenaugad-deletions.service), [timer](systemd/nenaugad-deletions.timer)).
When `account_deletions` changed since the last export, or a dump was written after it, it
writes `account-deletions-<UTC time>.json` (account ids and deletion times only: no email, no
content), and the off-site copy follows at once. On the box every export copied in the last 14
days is kept, and at least the 4 newest (each holds the whole ledger); here the 2 newest. Each
export records its database's lineage (migration 0027, one random id the database keeps through
dumps and restores), so a restore can tell its exports from another database's. After losing the server, the newest export brings back the
deletions made after the newest dump, so at most about 15 minutes of deleted accounts come back
instead of up to a day.

**1. On your computer: the age key pair.** Install age (Windows:
`winget install FiloSottile.age`; macOS: `brew install age`; Linux: the `age` package), then:

```bash
age-keygen -o nenaugad-backup-key.txt
```

It prints `Public key: age1…`. The file holds the private key. Keep it in your password manager
and on an offline medium, and never put it on the server: without it no copy can be decrypted,
and whoever has it can read every copy.

**2. In the Hetzner console: the Storage Box.** BX11 (1 TB) cost €3.20 a month excluding VAT on
2026-11-04: check the price when ordering. Pick a location other than the server's (for
example, the server in Nuremberg and the box in Falkenstein). In the box's settings, turn on SSH
support, and set up:

- **automatic snapshots, required:** daily, keeping 7 (BX11 has 10 automatic slots). No key
  on the server can delete them, so a compromised server cannot take the copies with it. Seven
  days is the time to notice: past that, its damage is in the snapshots too. Longer would keep
  deleted accounts on the box longer;
- recommended: a **sub-account** for the server, limited to its own directory, so its key
  reaches nothing else on the box.

Keep the box's login and password in your password manager. Below, `YOUR_STORAGE_BOX_USER` is
the login the server uses (`u123456`, or a sub-account's `u123456-sub1`) and
`YOUR_STORAGE_BOX_HOST` is `u123456.your-storagebox.de`.

**3. On the server: age, a key for the box, the box's host key pinned.** In your admin session:

```bash
sudo apt install -y age
sudo install -d -m 700 -o root -g root /etc/nenaugad /etc/nenaugad/offsite
sudo ssh-keygen -t ed25519 -N '' -C nenaugad-offsite -f /etc/nenaugad/offsite/id_ed25519
BOX_USER=YOUR_STORAGE_BOX_USER
BOX_HOST=YOUR_STORAGE_BOX_HOST
ssh-keyscan -p 23 "$BOX_HOST" 2>/dev/null | sudo tee /etc/nenaugad/offsite/known_hosts >/dev/null
sudo ssh-keygen -lf /etc/nenaugad/offsite/known_hosts
```

Hetzner publishes no fingerprints for the box, so compare: on your own computer,
`ssh-keyscan -p 23 YOUR_STORAGE_BOX_HOST | ssh-keygen -lf -` must print the same `SHA256:` lines.
The same key seen from two networks is the check. Then install the server's public key on the
box. Hetzner's `install-ssh-key` asks for the box's password once and keeps the keys already
there:

```bash
sudo cat /etc/nenaugad/offsite/id_ed25519.pub | ssh -p 23 -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/etc/nenaugad/offsite/known_hosts "$BOX_USER@$BOX_HOST" install-ssh-key
```

Your public key (the `age1…` line from step 1, which is not a secret) and the box's address:

```bash
echo 'age1PASTE_YOUR_PUBLIC_KEY' | sudo tee /etc/nenaugad/offsite/age-recipients.txt
printf 'OFFSITE_HOST=%s\nOFFSITE_USER=%s\n' "$BOX_HOST" "$BOX_USER" | sudo tee /etc/nenaugad/offsite.env
sudo chmod 600 /etc/nenaugad/offsite/* /etc/nenaugad/offsite.env
```

`OFFSITE_PORT` (23) and `OFFSITE_DIR` (`nenaugad`, a directory in what the login sees) may be
added to that file; the defaults fit.

**4. The script, the units, a first run, the timer:**

```bash
sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-offsite.sh /usr/local/sbin/nenaugad-offsite
sudo install -m 644 -o root -g root /srv/nenaugad/app/deploy/systemd/nenaugad-offsite.service /srv/nenaugad/app/deploy/systemd/nenaugad-offsite.timer /srv/nenaugad/app/deploy/systemd/nenaugad-deletions.service /srv/nenaugad/app/deploy/systemd/nenaugad-deletions.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/nenaugad-offsite.service /etc/systemd/system/nenaugad-offsite.timer /etc/systemd/system/nenaugad-deletions.service /etc/systemd/system/nenaugad-deletions.timer
sudo systemctl start nenaugad-deletions.service
journalctl -t nenaugad-deletions -n 2 --no-pager
journalctl -t nenaugad-offsite -n 20 --no-pager
sudo systemctl enable --now nenaugad-deletions.timer nenaugad-offsite.timer
```

The export prints `{"ok":true,"written":true,"file":"/srv/nenaugad/backups/account-deletions-….json","entries":N,...}`
(on a ledger unchanged since the last export, `"written":false`). Starting it starts the
off-site copy, whose journal shows `copied account-deletions-….json: …` and
`copied atlas_starter-….dump: N bytes encrypted, sha256 …` for each file; a later run with
nothing new says `nothing to copy`. If it stops instead:

| It says | Means |
|---|---|
| `the copy on the box does not match (sha256)` | the upload arrived damaged; nothing was recorded, the next run tries again |
| `… is missing or empty` | a file of step 3 is missing |
| `Host key verification failed` | the box presented another host key: check the fingerprint again as in step 3; never just replace `known_hosts` |
| `Permission denied (publickey)` | the server's key is not on the box (step 3, `install-ssh-key`) |
| `skipped NAME: its time is in the future` or `… is not a real time` | a file in `/srv/nenaugad/backups` that no command of this repository wrote with that name: nothing is copied or pruned for it. Find out who put it there; it is a sign of a compromised app user |
| `NAME: the box already holds a copy this server did not record; left alone` | the box has a copy of that name this server never made (another server's, or this server's records were lost): it is not overwritten. Check which is which before you move either |
| `NAME: not a regular file`, `… could not be read and encrypted` | that file was not copied; the others were, and the run ends `failed` so `systemctl --failed` shows it |
| `the box could not be listed; nothing copied to …` / `nothing pruned in …` | the connection to the box failed (ssh exited 255): nothing was copied or deleted there; the next run tries again |
| `N file(s) or step(s) failed (above); everything else was done` | the run's last line when anything above failed; the unit ends `failed` |
| `a setting … has an unexpected character` | `/etc/nenaugad/offsite.env` holds something other than letters, digits, `.`, `_`, `-` |

**Bringing a copy back** (for the drill below, or after losing the server). On your computer,
fetch it with the box's own login, decrypt it, and send it to the server:

```bash
sftp -P 23 YOUR_STORAGE_BOX_USER@YOUR_STORAGE_BOX_HOST:nenaugad/dumps/atlas_starter-YYYYMMDDTHHMMSSZ.dump.age .
age -d -i nenaugad-backup-key.txt -o atlas_starter-YYYYMMDDTHHMMSSZ.dump atlas_starter-YYYYMMDDTHHMMSSZ.dump.age
scp -i ~/.ssh/YOUR_KEY atlas_starter-YYYYMMDDTHHMMSSZ.dump YOUR_ADMIN_USER@YOUR_SERVER_IPV4:
```

On the server, move it where the restore reads it and the timers do not:

```bash
sudo install -m 600 -o nenaugad -g nenaugad ~/atlas_starter-YYYYMMDDTHHMMSSZ.dump /srv/nenaugad/restore/
rm ~/atlas_starter-YYYYMMDDTHHMMSSZ.dump
```

When you are done, delete the decrypted file on your computer and in `/srv/nenaugad/restore`:
it holds every account as it was on that day.

### The restore drill

Run it monthly, after any change to this section, and before switching live AI on (D6). It
runs beside the live site, which keeps working: it only reads the live ledger. Once a month,
drill a copy brought back from the box (above), so the age key and the box are tested too:

```bash
sudo ls -1t /srv/nenaugad/backups /srv/nenaugad/restore
app npm run --silent db:restore -- /srv/nenaugad/backups/atlas_starter-YYYYMMDDTHHMMSSZ.dump --drill
app ls migrations | tail -n 1
```

It passes when it prints `"ok":true` with:

- `"liveLedger":"read"` (the live database's deletions were applied);
- `"accountsDeletedAgain"`: the accounts deleted since that backup was taken (0 if none);
- `"accountsRestored"`: the accounts the backup holds, less those;
- `"latestMigration"`: the newest migration in the backup; on a current backup, the same name
  as the last line of `ls migrations`;
- `"aiOperationsRolledBack"` and `"aiBudgetsRolledBack"`: how much of the AI spending ledger a
  `--replace` of this backup would undo (below); 0 while live AI is off.

Note the date, the file and the result in your own records, not in this repository.

### Restore: replacing the database

Use it after data damage, to return to the state before a deploy, or on a new server.
`--replace` swaps the restored database in for `atlas_starter` and parks the one the site used
as `atlas_starter_before_restore`, closed to connections. It refuses while anything else is
connected, so stop everything first:

```bash
sudo systemctl stop nenaugad-backup.timer nenaugad-deletions.timer nenaugad-offsite.timer nenaugad-web nenaugad-worker
systemctl is-active nenaugad-backup.service
app npm run --silent db:restore -- /srv/nenaugad/backups/FILE.dump --replace
```

`is-active` must say `inactive` (or `failed`); `activating` is a backup in progress: wait for
it. The restore prints
`"ok":true,"mode":"replace","replaced":true,"previousDatabase":"atlas_starter_before_restore"`.
Then, depending on why you restored:

- **Same commit** (data damage): apply any migration the backup predates, then start:

  ```bash
  app npm run db:migrate
  sudo systemctl start nenaugad-web nenaugad-worker nenaugad-backup.timer nenaugad-deletions.timer nenaugad-offsite.timer
  ```

- **Back to an older commit** (a deploy went wrong; restore the backup that deploy took): roll
  the code back too. The script still lists the newer migrations, so it needs
  `--across-migrations`, although the restored schema is the older one now. It starts web and
  worker itself:

  ```bash
  sudo nenaugad-release rollback PREVIOUS_COMMIT --across-migrations
  sudo systemctl start nenaugad-backup.timer nenaugad-deletions.timer nenaugad-offsite.timer
  ```

Check with `sudo nenaugad-release status` and the site. Then drop the parked database, which
holds the data as it was right before the restore. The next `--replace` refuses while it
exists:

```bash
dc exec db psql -U atlas -d postgres -c 'DROP DATABASE atlas_starter_before_restore'
```

**Never rename the parked database back** once the site has run on the restored one: accounts
deleted in between would come back. To undo a restore, restore again.

**The AI spending ledger is not carried forward** (`ai_budgets`, `ai_operations`;
[docs/OPEN_GAPS.md](../docs/OPEN_GAPS.md)): a restore of an older backup would give back money
spent since and forget attempts. `--replace` refuses with `AI_LEDGER_WOULD_ROLL_BACK` (and
counts) while the live ledger differs from the backup's. While live AI is off on the server
(D6) there is nothing to roll back. If it does say so, `--accept-ai-ledger-rollback` goes on;
afterwards keep live AI off until the budgets are reconciled with the provider's own usage
page.

**When a restore stops,** it prints a code; the live database is as it was, unless the table
says otherwise:

| Code | Means, and what to do |
|---|---|
| `LIVE_DATABASE_IN_USE` | something is connected to `atlas_starter`: stop web, worker and the three timers (backup, deletions, off-site); `dc exec db psql -U atlas -d postgres -c "SELECT application_name, state FROM pg_stat_activity WHERE datname = 'atlas_starter'"` shows what |
| `LIVE_LEDGER_CHANGED` | a deletion landed while the restore ran, though nothing should have been connected: find out what, then retry |
| `PARKED_DATABASE_EXISTS` | an earlier restore's parked database: check it is not needed, drop it (above) |
| `LIVE_DATABASE_BLOCKED` | a `--replace` stopped between closing the live database and the swap (power loss, a kill). Open it again, then retry: `dc exec db psql -U atlas -d postgres -c 'ALTER DATABASE atlas_starter WITH ALLOW_CONNECTIONS true'` |
| `NEWER_DELETIONS_REQUIRED` | the live database cannot vouch for the newest ledger: it is gone, or it does not know `"accountsUnknownToLive"` of the backup's accounts (a new server after its migrations, a database restored from another backup). Name the newest export or dump: [After losing the server](#after-losing-the-server) |
| `DELETIONS_SOURCE_FOREIGN` | a `--deletions-from` file is another database's: another name, or another lineage (a new server's own export or dump). Take the old server's. A backup from before migration 0027 has no lineage, so no file can vouch for it: only `--newest-backup` restores it |
| `DELETIONS_SOURCE_NOT_NEWER`, `DELETIONS_SOURCE_INCOMPLETE` | a `--deletions-from` file is not a later copy of the backup's ledger: made before the backup, or missing a deletion the backup itself holds |
| `DELETIONS_SOURCE_UNREADABLE`, `DELETIONS_SOURCE_UNDATED`, `DELETIONS_SOURCE_NOT_FOUND` | a `--deletions-from` file is damaged, has no time, or is not there |
| `RESTORE_DELETED_ACCOUNT_PRESENT` | after the deletion, the restored data still held an account the ledger lists, or a row of one (`"table"`): something in the dump kept it. Do not use this file |
| `RESTORE_ORPHAN_ROWS` | rows whose parent row is gone (`"table"`): a cascade did not run. Do not use this file |
| `AI_LEDGER_WOULD_ROLL_BACK` | above |
| `PG_RESTORE_FAILED` | `pg_restore` stopped: a damaged or foreign file, or a full disk (`df -h`). Try the next file |
| `BACKUP_SCHEMA_UNSUPPORTED` | the archive has no `users` or `account_deletions`: not a Nenaugad backup |
| `LIVE_LEDGER_MISSING` | the live database has accounts but no deletion ledger: stop and find out why before any restore |
| `RESTORE_FILE_NOT_FOUND`, `RESTORE_FILE_NOT_ABSOLUTE`, `RESTORE_ARGUMENTS_INVALID` | one absolute file path, exactly one of `--drill`, `--replace`, and the options spelled as here |
| `RESTORE_FAILED` with `"sqlstate"` | the database refused a step (`XX000` with a rule in the dump: Postgres itself stopped a cascade the dump would have broken). Do not use this file |
| `"restoreDatabaseLeft"` in any failure | the cleanup could not drop `atlas_starter_restore`, which may hold deleted accounts: `dc exec db psql -U atlas -d postgres -c 'DROP DATABASE atlas_starter_restore WITH (FORCE)'` (the next restore drops it too) |
| `"liveDatabaseBlocked"` in any failure | the cleanup could not open `atlas_starter` again: the `ALTER DATABASE` line above |

### After losing the server

Restore before the new server makes a backup or an export of its own: those would land in the
same directories on the box, newer than everything there, holding an empty database. (The
restore refuses them anyway, `DELETIONS_SOURCE_FOREIGN`: they carry the new database's lineage.)
In this order:

1. Steps 1–12, then `sudo systemctl stop nenaugad-web nenaugad-worker` (step 12 started them).
2. From [Install once](#install-once): the client, the settings and the directories only. No
   first backup by hand, no units yet.
3. From the [off-site copy](#off-site-copy-age-and-a-hetzner-storage-box): steps 1–3 (a new box
   key for the new server; your age key stays the same). Not step 4 yet.
4. Bring back from the box, into `/srv/nenaugad/restore`, the newest dump (`nenaugad/dumps/`)
   and the newest deletion export the old server made before the loss
   (`nenaugad/deletions/account-deletions-….json.age`, decrypted the same way).
5. Move the old server's copies aside on the box, so the new server starts its own directory and
   its retention never meets them (it prunes only what it recorded itself). From your computer,
   with the box's own login:

   ```bash
   echo 'rename nenaugad nenaugad-lost-YYYYMMDD' | sftp -P 23 -b - YOUR_STORAGE_BOX_USER@YOUR_STORAGE_BOX_HOST
   ```

   Put a date 8 weeks from now in your calendar. Then delete that directory with the box's
   file manager in the Hetzner console, or over SFTP file by file. Until then it holds deleted
   accounts' data, like any backup.
6. Restore, as below. Then the units of Install once and off-site step 4.

The newest ledger of deletions was in the lost database. The new database, though migrated,
knows none of the backup's accounts, so the restore refuses (`NEWER_DELETIONS_REQUIRED`) until
you name where the newest ledger is now:

- **the newest export** (the usual case: exports run every 15 minutes, dumps nightly):

  ```bash
  app npm run --silent db:restore -- /srv/nenaugad/restore/NEWEST.dump --replace --deletions-from=/srv/nenaugad/restore/NEWEST-DELETIONS.json
  ```

  An export older than the dump is refused (`DELETIONS_SOURCE_NOT_NEWER`): then the dump itself
  holds the newest ledger, and the next case applies.

- **nothing newer than the dump**: you state that, and the report says
  `"deletionGapAccepted":true`. An export follows every dump within 15 minutes, even when the
  ledger did not change. So no export after the newest dump means the export or its copy was
  failing, and deletions since the export before it may come back: an unknown window, not 15
  minutes:

  ```bash
  app npm run --silent db:restore -- /srv/nenaugad/restore/NEWEST.dump --replace --newest-backup
  ```

- **an older dump** (the newest is damaged, say): name the newest export, or the newest dump,
  with `--deletions-from` (it may be given more than once).

Then `app npm run db:migrate`, start the services and the timers, and delete the decrypted
files. **Accounts deleted after the newest export come back:** their deletions were recorded
only in the lost database. The window is the time from that export to the loss: up to 15
minutes, plus the moments until the export reached the box.

If the restore says `AI_LEDGER_WOULD_ROLL_BACK` here, the new server's seeded budget limits
are lower than the old server's. Live AI is off on a new server, so nothing was spent there;
`--accept-ai-ledger-rollback` brings back the old server's approved limits. Check them against
your current decisions before switching live AI on.

### Backups and deleted accounts

A deleted account's data stays in every backup taken before the deletion until that file is
deleted. Every restore deletes it again before the site sees the database (the profile page
says so: «чтобы восстановление из резервной копии не вернуло ваши данные»). How long:

- here, the 3 newest dumps;
- on the box, up to 8 weeks (the oldest weekly copy), plus the snapshot retention you set
  (step 2); after a lost server, the old server's copies until you delete the directory you
  moved them to (8 weeks, [After losing the server](#after-losing-the-server)).

The deletion exports hold no account's data, only the ids and times of deletions; like the
ledger in the database (B11-001), they are kept for as long as backups exist that could bring
those accounts back.

Hetzner's own server backups stay off for this reason: a disk image has no such step. Until the
off-site copy runs, nothing deletes old dumps here. This deletes all but the 14 newest, as
`nenaugad` (never as root: the file names are that user's), by count rather than age, so a
timer that stopped for weeks never leaves you with none:

```bash
app sh -c 'ls -1t /srv/nenaugad/backups/atlas_starter-*.dump | tail -n +15 | xargs -r rm -v --'
```

## After a reboot

Everything comes back by itself: Docker and its Postgres container (`restart:
unless-stopped`), `nenaugad-web`, `nenaugad-worker` and `caddy` (enabled units). The worker
may fail once or twice while Postgres starts, and restarts 30 s later. Check with:

```bash
sudo nenaugad-release status
```

## Known limits at this commit

- The off-site copies sit with the same company, under the same account, as the server: a
  Hetzner account problem takes both (owner decision 2026-11-04: age + Storage Box, no second
  store). Nothing alerts on a failed backup or off-site copy yet (`systemctl --failed`, weekly).
- A compromised app user can have files copied that take the box's weekly slots of the weeks it
  is active; root on the server can delete the box's copies. The box's snapshots (7 days) are
  the protection, so a compromise must be noticed within a week.
- A restore rolls the AI spending ledger back to the backup's; `--replace` refuses unless
  accepted ([Restore](#restore-replacing-the-database)). Carrying it forward must be fixed
  before live AI is switched on here (D6; docs/OPEN_GAPS.md).
- On a lost server, accounts deleted after the newest deletion export come back (up to about
  15 minutes); the production CSP is the local one (DEPLOY-005).
- No account can sign in on the server (D5 sub-question), and the demo banner still carries
  the local wording (DEPLOY-007).
- `/api/health` is liveness only; the heartbeat proves the worker process and the disk, not
  that imports succeed.
- The heap cap and the timings come from the development machine; DEPLOY-007 measures the
  server, including the worker's peak during a real import (no cap until then).
- The units were checked by reading, not with `systemd-analyze` (written on Windows); step 12
  runs `systemd-analyze verify` on the server.
