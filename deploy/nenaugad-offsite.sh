#!/usr/bin/env bash
# Nenaugad off-site backup copy (DEPLOY-003; owner decisions 2026-11-04, age + Hetzner Storage
# Box, and 2026-11-05, the deletion ledger every 15 minutes). Run as root by
# nenaugad-offsite.timer every 15 minutes and after each deletion export; deploy/README.md,
# Off-site copy.
#
# Two kinds of file in BACKUP_DIR, each copied to its own directory on the box:
#   dumps      atlas_starter-<UTC>.dump      (db:backup)
#   deletions  account-deletions-<UTC>.json  (db:export-deletions: account ids and times only)
# Each run, for each file not yet copied:
#   1. lists BACKUP_DIR as the app user: root never opens a path that user controls;
#   2. skips a name whose time is not a real time or lies in the future, and one the box already
#      holds without this server's record (never overwritten);
#   3. reads the file as the app user, encrypts the stream with age to the owner's public key(s),
#      uploads it as <name>.age.part, renames it, compares its SHA-256 on the box with the local
#      one, and records the name, the hash and the time of the upload (root's own clock). A file
#      that fails is reported; the others still go, and the run fails at its end;
#   4. prunes the box from those records alone, never from the names, which the app user
#      chooses: every copy uploaded in the last 14 days stays; of dumps also the newest uploaded
#      in each of the last 8 ISO weeks, of deletion exports the 4 newest. A copy on the box that
#      this server did not record is never touched;
#   5. deletes here, as the app user, older files already copied: all but the 3 newest dumps and
#      the 2 newest exports.
# The server holds only the public key: it cannot decrypt its own copies. The SSH key for the box
# is root's alone: the web server's user can neither read it nor delete a copy on the box. It can
# still have files copied that crowd the box; the box's own snapshots, which no key on this
# server can delete, are the guard against that.
# Nothing here prints a row or a secret: file names, sizes, hashes.
#
# Install a root-owned copy: sudo install -m 755 -o root -g root deploy/nenaugad-offsite.sh /usr/local/sbin/nenaugad-offsite
set -euo pipefail
shopt -s inherit_errexit
umask 077

: "${OFFSITE_HOST:?OFFSITE_HOST is not set (see /etc/nenaugad/offsite.env)}"
: "${OFFSITE_USER:?OFFSITE_USER is not set (see /etc/nenaugad/offsite.env)}"
OFFSITE_PORT=${OFFSITE_PORT:-23}
OFFSITE_DIR=${OFFSITE_DIR:-nenaugad}
BACKUP_DIR=${BACKUP_DIR:-/srv/nenaugad/backups}
APP_USER=${APP_USER:-nenaugad}
CONFIG_DIR=${OFFSITE_CONFIG_DIR:-/etc/nenaugad/offsite}
STATE_DIR=${STATE_DIRECTORY:-/var/lib/nenaugad-offsite}
# The time of this run, in seconds; set only by a test of this script.
NOW=${OFFSITE_NOW_EPOCH:-$(date -u +%s)}
KEEP_DAYS=14
KEEP_WEEKLY=8
KEEP_REMOTE_DELETIONS=4
KEEP_LOCAL_DUMPS=3
KEEP_LOCAL_DELETIONS=2
# A name may run ahead of this clock by a little (clock skew), not by more.
FUTURE_SLACK=3600

KEY=$CONFIG_DIR/id_ed25519
KNOWN_HOSTS=$CONFIG_DIR/known_hosts
RECIPIENTS=$CONFIG_DIR/age-recipients.txt
UPLOADED=$STATE_DIR/uploaded
STAGE=$STATE_DIR/stage
# Only names the two commands write; anything else in either place is left alone.
DUMP_NAME='^atlas_starter-[0-9]{8}T[0-9]{6}Z\.dump$'
DELETIONS_NAME='^account-deletions-[0-9]{8}T[0-9]{6}Z\.json$'
SAFE_TEXT='^[A-Za-z0-9._-]+$'

say() { printf '%s\n' "$*"; }
die() { printf 'nenaugad-offsite: %s\n' "$*" >&2; exit 1; }

[[ $NOW =~ ^[0-9]+$ ]] || die "OFFSITE_NOW_EPOCH is not a number of seconds"
for value in "$OFFSITE_HOST" "$OFFSITE_USER" "$OFFSITE_PORT" "$OFFSITE_DIR" "$APP_USER"; do
  [[ $value =~ $SAFE_TEXT ]] || die "a setting in /etc/nenaugad/offsite.env has an unexpected character"
done
for file in "$KEY" "$KNOWN_HOSTS" "$RECIPIENTS"; do
  [ -s "$file" ] || die "$file is missing or empty (deploy/README.md, Off-site copy)"
done
install -d -m 700 "$STATE_DIR" "$STAGE"
touch "$UPLOADED"

# The app user's view of BACKUP_DIR: listing, reading and deleting go through it.
as_app() { setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups -- "$@"; }

# No user configuration, no agent, no password prompt; the box's host key must be the pinned one.
SSH_OPTIONS=(-F /dev/null -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$KNOWN_HOSTS" -o ConnectTimeout=20 -o ServerAliveInterval=15)
remote() { ssh "${SSH_OPTIONS[@]}" -p "$OFFSITE_PORT" "$OFFSITE_USER@$OFFSITE_HOST" "$@"; }
remote_batch() { sftp "${SSH_OPTIONS[@]}" -P "$OFFSITE_PORT" -b - "$OFFSITE_USER@$OFFSITE_HOST" >/dev/null; }

is_uploaded() { awk -v n="$1" '$1 == n { found = 1 } END { exit found ? 0 : 1 }' "$UPLOADED"; }

# Lines of $1 that match the pattern $2, newest name first. No match is an empty list.
matching() { printf '%s\n' "$1" | { grep -E "$2" || true; } | sort -r; }

# The UTC time in a name, in seconds; nothing when it is not a real time (20261399T…).
name_epoch() {
  local day time epoch
  [[ $1 =~ -([0-9]{8})T([0-9]{6})Z\. ]] || return 0
  day=${BASH_REMATCH[1]}
  time=${BASH_REMATCH[2]}
  epoch=$(date -u -d "${day:0:4}-${day:4:2}-${day:6:2} ${time:0:2}:${time:2:2}:${time:4:2}" +%s 2>/dev/null) || return 0
  # date normalises some impossible times (24:00:00); the round trip must give the name back.
  [ "$(date -u -d "@$epoch" +%Y%m%dT%H%M%S)" = "${day}T${time}" ] && printf '%s' "$epoch"
  return 0
}

# A name worth copying: a real time, not later than this run (with a little slack).
plausible() {
  local epoch
  epoch=$(name_epoch "$1")
  if [ -z "$epoch" ]; then
    say "skipped $1: its time is not a real time"
    return 1
  fi
  if [ "$epoch" -gt $((NOW + FUTURE_SLACK)) ]; then
    say "skipped $1: its time is in the future"
    return 1
  fi
  return 0
}

# One line on stderr for a file that was not copied; the run goes on and fails at its end.
warn() { printf 'nenaugad-offsite: %s\n' "$*" >&2; }

# upload <name> <directory on the box>: copies one file, or says why not and returns non-zero.
# Every step is checked here, not left to errexit (which a caller's "||" switches off).
upload() {
  local name=$1 staged="$STAGE/$1.age" target="$OFFSITE_DIR/$2/$1.age" sum remote_sum bytes
  rm -f -- "$staged"
  # As the app user: a directory, a FIFO or a file it cannot read under the name is its own
  # problem, not root's; a read that hangs ends after 10 minutes.
  if ! as_app test -f "$BACKUP_DIR/$name"; then
    warn "$name: not a regular file; not copied"
    return 1
  fi
  if ! as_app timeout 600 cat -- "$BACKUP_DIR/$name" | age -R "$RECIPIENTS" -o "$staged"; then
    rm -f -- "$staged"
    warn "$name: could not be read and encrypted; not copied"
    return 1
  fi
  sum=$(sha256sum -- "$staged" | cut -d ' ' -f 1) || return 1
  bytes=$(stat -c %s -- "$staged") || return 1
  # A leading "-" lets sftp go on past that line's failure: the directories may exist, an earlier
  # attempt may have left a part. The copy itself is never removed or replaced: "rename -l" is the
  # plain SFTP rename, which fails when the target exists (OpenSSH's default, posix-rename,
  # would replace it).
  if ! remote_batch <<EOF
-mkdir $OFFSITE_DIR
-mkdir $OFFSITE_DIR/$2
-rm $target.part
put $staged $target.part
rename -l $target.part $target
EOF
  then
    rm -f -- "$staged"
    warn "$name: the upload failed; not copied"
    return 1
  fi
  if ! remote_sum=$(remote sha256sum "$target" | cut -d ' ' -f 1) || [ "$remote_sum" != "$sum" ]; then
    rm -f -- "$staged"
    warn "$name: the copy on the box does not match (sha256); not recorded"
    return 1
  fi
  printf '%s %s %s\n' "$name" "$sum" "$NOW" >> "$UPLOADED" || return 1
  rm -f -- "$staged"
  say "copied $name: $bytes bytes encrypted, sha256 $sum"
}

# The recorded copies whose name matches $1: "upload-time name" lines, newest upload first, each
# name once (its newest upload).
records() {
  local lines
  lines=$(awk 'NF >= 3 && $3 ~ /^[0-9]+$/ { print $3, $1 }' "$UPLOADED" | sort -rn)
  local seen=" " epoch name
  while read -r epoch name; do
    [ -n "$name" ] && [[ $name =~ $1 ]] || continue
    [[ $seen == *" $name "* ]] && continue
    seen="$seen$name "
    printf '%s %s\n' "$epoch" "$name"
  done <<< "$lines"
}

# The names in a directory on the box, each between newlines, ending in a "." line: a command
# substitution drops trailing newlines, and the dot keeps the last name matchable (review 4). A
# directory that is not there lists empty; a connection that fails (ssh exits 255) fails.
box_listing() {
  local out status=0
  out=$(remote ls -1 "$OFFSITE_DIR/$1" 2>/dev/null) || status=$?
  [ "$status" -ne 255 ] || return 1
  [ "$status" -eq 0 ] || out=""
  printf '\n%s\n.' "$(printf '%s\n' "$out" | sed 's|.*/||')"
}

# prune_box <directory on the box> <name pattern> <how many newest to keep besides: 0 for none>.
# Kept: every copy uploaded in the last KEEP_DAYS days; for dumps also the newest uploaded in each
# of the last KEEP_WEEKLY ISO weeks (counted from now, so the weeks of the last 14 days are among
# them); for exports also the newest N. Deleted: the rest of what this server recorded.
prune_box() {
  local listing epoch name week weeks=" " kept_weeks=0 kept=0 keep
  if ! listing=$(box_listing "$1"); then
    warn "the box could not be listed; nothing pruned in $1"
    FAILED=$((FAILED + 1))
    return 0
  fi
  while read -r epoch name; do
    [ -n "$name" ] || continue
    # Only a copy that is there and that this server made and recorded.
    [[ $listing == *$'\n'"$name.age"$'\n'* ]] || continue
    keep=no
    [ "$epoch" -ge $((NOW - KEEP_DAYS * 86400)) ] && keep=yes
    if [ "$1" = dumps ]; then
      week=$(date -u -d "@$epoch" +%G-W%V)
      if [[ $weeks != *" $week "* ]] && [ "$kept_weeks" -lt "$KEEP_WEEKLY" ]; then
        weeks="$weeks$week "; kept_weeks=$((kept_weeks + 1)); keep=yes
      fi
    else
      kept=$((kept + 1))
      [ "$kept" -le "$3" ] && keep=yes
    fi
    if [ "$keep" = no ]; then
      remote rm "$OFFSITE_DIR/$1/$name.age"
      say "deleted from the box: $name.age"
    fi
  done <<< "$(records "$2")"
}

# prune_here <newest-first list> <how many to keep>: an older file goes only once it is copied.
prune_here() {
  local name count=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    count=$((count + 1))
    [ "$count" -le "$2" ] && continue
    if is_uploaded "$name"; then
      as_app rm -f -- "$BACKUP_DIR/$name"
      say "deleted here (copied to the box): $name"
    fi
  done <<< "$1"
}

# Files of this run that were not copied, counted, not returned (an exit status wraps at 256).
FAILED=0

# copy_all <directory on the box> <names, oldest first...>: each one this server has not copied
# and the box does not hold. A name the box holds that this server never recorded is left alone,
# never overwritten (review 3): it is someone else's copy, or a sign of a planted file.
copy_all() {
  local dir=$1 listing name
  shift
  if ! listing=$(box_listing "$dir"); then
    warn "the box could not be listed; nothing copied to $dir"
    FAILED=$((FAILED + $#))
    return 0
  fi
  for name in "$@"; do
    if [[ $listing == *$'\n'"$name.age"$'\n'* ]]; then
      warn "$name: the box already holds a copy this server did not record; left alone"
      FAILED=$((FAILED + 1))
      continue
    fi
    if ! upload "$name" "$dir"; then FAILED=$((FAILED + 1)); fi
  done
}

main() {
  local listing dumps deletions name pending_dumps=() pending_deletions=() i ordered
  # The listing is taken whole first: a failed one stops the run instead of reading as empty.
  listing=$(as_app ls -1 -- "$BACKUP_DIR")
  dumps=$(matching "$listing" "$DUMP_NAME")
  deletions=$(matching "$listing" "$DELETIONS_NAME")
  while IFS= read -r name; do
    [ -n "$name" ] && ! is_uploaded "$name" && plausible "$name" && pending_dumps+=("$name")
  done <<< "$dumps"
  while IFS= read -r name; do
    [ -n "$name" ] && ! is_uploaded "$name" && plausible "$name" && pending_deletions+=("$name")
  done <<< "$deletions"
  if [ "${#pending_dumps[@]}" -eq 0 ] && [ "${#pending_deletions[@]}" -eq 0 ]; then
    say "nothing to copy"
    return 0
  fi
  # The ledger first (it is small and the newest deletions matter most), then the dumps; oldest
  # first within each, so an interrupted run has copied the older ones.
  if [ "${#pending_deletions[@]}" -gt 0 ]; then
    ordered=()
    for ((i = ${#pending_deletions[@]} - 1; i >= 0; i--)); do ordered+=("${pending_deletions[$i]}"); done
    copy_all deletions "${ordered[@]}"
    prune_box deletions "$DELETIONS_NAME" "$KEEP_REMOTE_DELETIONS"
    prune_here "$deletions" "$KEEP_LOCAL_DELETIONS"
  fi
  if [ "${#pending_dumps[@]}" -gt 0 ]; then
    ordered=()
    for ((i = ${#pending_dumps[@]} - 1; i >= 0; i--)); do ordered+=("${pending_dumps[$i]}"); done
    copy_all dumps "${ordered[@]}"
    prune_box dumps "$DUMP_NAME" 0
    prune_here "$dumps" "$KEEP_LOCAL_DUMPS"
  fi
  [ "$FAILED" -eq 0 ] || die "$FAILED file(s) or step(s) failed (above); everything else was done"
}

main "$@"
