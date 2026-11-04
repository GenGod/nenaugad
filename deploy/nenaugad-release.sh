#!/usr/bin/env bash
# Nenaugad release script (DEPLOY-006): owner-run over SSH, never automatic, never from CI.
#
#   sudo nenaugad-release deploy <commit> --no-backup [--migrations]
#   sudo nenaugad-release rollback [<commit>] [--across-migrations]
#   sudo nenaugad-release status
#
# Install a root-owned copy; never run the file inside the checkout as root, because the
# checkout belongs to the nenaugad user:
#   sudo install -m 755 -o root -g root /srv/nenaugad/app/deploy/nenaugad-release.sh \
#     /usr/local/sbin/nenaugad-release
#
# Root runs only systemctl, flock, cmp and curl here. git and npm run as the nenaugad user.
# deploy/README.md explains each step.
set -euo pipefail
umask 077

APP_DIR=/srv/nenaugad/app
APP_USER=nenaugad
STATE_DIR=/var/lib/nenaugad-release
UNITS=(nenaugad-web.service nenaugad-worker.service)
HEALTH_URL=http://127.0.0.1:3000/api/health
SELF=/usr/local/sbin/nenaugad-release

say() { printf '==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die() { printf 'nenaugad-release: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '4,6p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# A command as the app user, in the checkout, with the app user's HOME (npm's cache lives there).
as_app() {
  sudo -u "$APP_USER" -H env -C "$APP_DIR" NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false "$@"
}

git_app() { as_app git "$@"; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "run it with sudo"
  [ -d "$APP_DIR/.git" ] || die "no checkout at $APP_DIR"
}

# Updates and rollbacks only: the first deploy follows deploy/README.md by hand.
require_installed() {
  systemctl cat "${UNITS[@]}" >/dev/null 2>&1 ||
    die "the units are not installed; the first deploy follows deploy/README.md"
}

lock() {
  install -d -m 700 "$STATE_DIR"
  exec 9>"$STATE_DIR/lock"
  flock -n 9 || die "another release is running"
}

# Refuse a dirty tree: a deploy from a tree nobody committed is not a deploy of a commit.
# .env, node_modules and .next are ignored by .gitignore, so they never count as dirty.
# next-env.d.ts is generated: the committed copy is the `next dev` form (.next/dev/types) and
# every `next build` rewrites it to .next/types (docs/OPEN_GAPS.md). That one rewrite is put back
# first; any other change stops the release.
require_clean_tree() {
  local dirty
  if git_app ls-files --error-unmatch -- next-env.d.ts >/dev/null 2>&1; then
    git_app checkout --quiet -- next-env.d.ts
  fi
  dirty=$(git_app status --porcelain)
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" >&2
    die "the checkout has uncommitted changes; the server tree is never edited by hand"
  fi
}

resolve_commit() {
  git_app rev-parse --verify --quiet "$1^{commit}" || die "unknown commit: $1"
}

# The installed Node must be the one the target commit's .nvmrc names (CI runs that version).
# Node is an apt package held at an exact version (deploy/README.md, step 6); a new .nvmrc is
# installed by hand first.
require_node_for() {
  local want have
  want=$(git_app show "$1:.nvmrc" | tr -d '[:space:]')
  have=$(node --version)
  [ "$have" = "v$want" ] ||
    die "$1 expects Node $want (.nvmrc) but $have is installed; deploy/README.md, Update, says how to change it"
}

# Migrations added between two commits (forward-only files under migrations/).
added_migrations() {
  git_app diff --name-only --diff-filter=A "$1" "$2" -- migrations/
}

# Written before the switch, so that after a failed run a bare `rollback` returns to the commit
# that was deployed before it, not to the one before that.
record() {
  printf '%s\n' "$1" > "$STATE_DIR/previous"
  printf '%s\n' "$2" > "$STATE_DIR/current"
}

wait_for_health() {
  local body
  for _ in $(seq 1 60); do
    if body=$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null); then
      case "$body" in
        *'"environment":"production"'*) say "health: $body"; return 0 ;;
        *) die "the server answers, but not in production mode: $body" ;;
      esac
    fi
    sleep 2
  done
  die "no answer from $HEALTH_URL after 2 minutes: journalctl -u nenaugad-web -n 50"
}

# The root-owned copies of files the checkout carries. A difference is reported, never installed
# by this script: unit files and the Caddyfile change only by the admin's explicit command.
report_drift() {
  local pair repo installed
  for pair in \
    "deploy/systemd/nenaugad-web.service:/etc/systemd/system/nenaugad-web.service" \
    "deploy/systemd/nenaugad-worker.service:/etc/systemd/system/nenaugad-worker.service" \
    "deploy/Caddyfile:/etc/caddy/Caddyfile" \
    "deploy/nenaugad-release.sh:$SELF"; do
    repo="$APP_DIR/${pair%%:*}"
    installed="${pair#*:}"
    [ -e "$repo" ] || continue
    if ! cmp -s "$repo" "$installed"; then
      warn "$installed differs from ${pair%%:*} at this commit; see deploy/README.md, Update"
    fi
  done
}

# Set while switch_to runs: any exit then (a failed command under set -e, or die) leaves web and
# worker possibly stopped on a half-switched tree, and says what to do.
SWITCHING=no
BEFORE=""
on_exit() {
  local status=$?
  if [ "$SWITCHING" = yes ] && [ "$status" -ne 0 ]; then
    warn "the release stopped (exit $status). Web and worker may be stopped."
    warn "Deployed before this run: ${BEFORE:-unknown}. Read the output above, then:"
    warn "  sudo nenaugad-release rollback ${BEFORE}"
  fi
}
trap on_exit EXIT

# Stop, check out, install, (migrate,) build, start, check. Web and worker stay stopped from
# `npm ci` to the end: npm ci replaces node_modules and next build replaces .next, both of which
# a running server reads, and a 4 GB server needs the memory for the build (DEPLOY-001, Sizing).
switch_to() {
  local target=$1 migrate=$2
  say "stopping web and worker"
  systemctl stop "${UNITS[@]}"
  say "checking out $target"
  git_app checkout --quiet --detach "$target"
  say "npm ci"
  as_app npm ci --no-audit --no-fund
  say "configuration check (npm run doctor)"
  as_app npm run --silent doctor
  if [ "$migrate" = yes ]; then
    say "npm run db:migrate"
    as_app npm run --silent db:migrate
    say "npm run seed:budgets (idempotent)"
    as_app npm run --silent seed:budgets
  fi
  say "npm run build"
  as_app npm run build
  say "starting web and worker"
  systemctl start "${UNITS[@]}"
  wait_for_health
  systemctl is-active --quiet nenaugad-worker.service || die "the worker is not running: journalctl -u nenaugad-worker -n 50"
}

cmd_deploy() {
  local target_arg="" no_backup=no allow_migrations=no current target migrations
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-backup) no_backup=yes ;;
      --migrations) allow_migrations=yes ;;
      -*) usage ;;
      *) [ -z "$target_arg" ] || usage; target_arg=$1 ;;
    esac
    shift
  done
  [ -n "$target_arg" ] || usage
  require_root
  require_installed
  lock
  require_clean_tree
  say "fetching origin"
  git_app fetch --prune --quiet origin
  target=$(resolve_commit "$target_arg")
  current=$(git_app rev-parse HEAD)
  BEFORE=$current
  [ "$target" != "$current" ] || die "$target is already deployed"
  git_app merge-base --is-ancestor "$target" origin/main ||
    die "$target is not on origin/main; deploy only commits merged into main with green CI"
  git_app merge-base --is-ancestor "$current" "$target" ||
    die "$target is not ahead of the deployed $current; going back is: nenaugad-release rollback"
  require_node_for "$target"
  migrations=$(added_migrations "$current" "$target")
  if [ -n "$migrations" ]; then
    printf '%s\n' "$migrations"
    if [ "$allow_migrations" != yes ]; then
      die "this deploy adds the migrations above. They only go forward, and until DEPLOY-003 there is no restore: a rollback past them runs old code on the new schema. Rerun with --migrations to accept that."
    fi
  fi
  # DEPLOY-003 (backup and restore) is not done: there is no backup command to run yet. Each
  # deploy without a backup is the owner's explicit choice. Once DEPLOY-003 lands, this step
  # runs its backup instead and the flag goes.
  if [ "$no_backup" != yes ]; then
    die "no backup can be taken yet (DEPLOY-003 is not done). Rerun with --no-backup to deploy without one."
  fi
  warn "deploying without a database backup (DEPLOY-003 not done)"
  record "$current" "$target"
  SWITCHING=yes
  switch_to "$target" yes
  SWITCHING=no
  say "deployed $target (previous: $current)"
  report_drift
}

cmd_rollback() {
  local target_arg="" across=no current target migrations
  while [ $# -gt 0 ]; do
    case "$1" in
      --across-migrations) across=yes ;;
      -*) usage ;;
      *) [ -z "$target_arg" ] || usage; target_arg=$1 ;;
    esac
    shift
  done
  require_root
  require_installed
  lock
  require_clean_tree
  if [ -z "$target_arg" ]; then
    [ -s "$STATE_DIR/previous" ] || die "no previous deploy recorded; name the commit"
    target_arg=$(cat "$STATE_DIR/previous")
  fi
  target=$(resolve_commit "$target_arg")
  current=$(git_app rev-parse HEAD)
  BEFORE=$current
  [ "$target" != "$current" ] || die "$target is already deployed"
  # Checked against origin/main as last fetched: a rollback needs no network.
  git_app merge-base --is-ancestor "$target" origin/main ||
    die "$target is not on origin/main; roll back only to commits that were deployed from main"
  require_node_for "$target"
  # The deployed commit's migrations stay applied: old code then runs on a newer schema.
  migrations=$(added_migrations "$target" "$current")
  if [ -n "$migrations" ]; then
    printf '%s\n' "$migrations"
    if [ "$across" != yes ]; then
      die "the deployed commit added the migrations above, which stay applied. Restoring the database from before them needs DEPLOY-003. Rerun with --across-migrations to run $target on the newer schema anyway."
    fi
    warn "rolling back across migrations; the schema stays at the newer version"
  fi
  record "$current" "$target"
  SWITCHING=yes
  switch_to "$target" no
  SWITCHING=no
  say "rolled back to $target (from $current)"
  report_drift
}

cmd_status() {
  require_root
  printf 'deployed: %s\n' "$(git_app rev-parse HEAD)"
  printf 'previous: %s\n' "$(cat "$STATE_DIR/previous" 2>/dev/null || echo none)"
  systemctl --no-pager --lines=0 status "${UNITS[@]}" || true
  curl -fsS --max-time 5 "$HEALTH_URL" || warn "no answer from $HEALTH_URL"
  echo
  report_drift
}

case "${1:-}" in
  deploy) shift; cmd_deploy "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  status) shift; cmd_status "$@" ;;
  *) usage ;;
esac
