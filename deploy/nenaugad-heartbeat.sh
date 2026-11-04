#!/usr/bin/env bash
# Nenaugad heartbeat (DEPLOY-006): pings an external dead-man's-switch URL when the worker has
# been running steadily and the disk has room. A missed ping is the alert; the monitor raises it.
# Run by nenaugad-heartbeat.timer every 5 minutes; off until owner decision D7 names the monitor.
#
# The ping is a bare GET to HEARTBEAT_URL: no body, no host name, no personal data.
# HEARTBEAT_URL comes from /etc/nenaugad/heartbeat.env (root, mode 600), read by systemd.
#
# What it proves: the worker process is up and has not restarted in the last few minutes, and
# the root disk is below the threshold. What it does not: that imports succeed (a source whose
# policy lapsed is skipped silently) or that Postgres answers. `npm run worker -- --status`
# shows both by hand (deploy/README.md, Monitoring).
set -euo pipefail

: "${HEARTBEAT_URL:?HEARTBEAT_URL is not set (see /etc/nenaugad/heartbeat.env)}"
MIN_ACTIVE_SECONDS=${HEARTBEAT_MIN_ACTIVE_SECONDS:-120}
MAX_DISK_PERCENT=${HEARTBEAT_MAX_DISK_PERCENT:-85}
UNIT=nenaugad-worker.service

state=$(systemctl show --property=ActiveState --value "$UNIT")
if [ "$state" != active ]; then
  echo "no ping: $UNIT is $state" >&2
  exit 1
fi

# A crash loop (Restart=always, RestartSec=30) is never active this long, so it never pings.
since=$(systemctl show --property=ActiveEnterTimestamp --value "$UNIT")
age=$(( $(date +%s) - $(date -d "$since" +%s) ))
if [ "$age" -lt "$MIN_ACTIVE_SECONDS" ]; then
  echo "no ping: $UNIT (re)started ${age}s ago" >&2
  exit 1
fi

used=$(df --output=pcent / | tail -n 1 | tr -dc '0-9')
if [ "$used" -ge "$MAX_DISK_PERCENT" ]; then
  echo "no ping: the root disk is ${used}% full" >&2
  exit 1
fi

curl -fsS --max-time 10 --retry 3 --output /dev/null "$HEARTBEAT_URL"
