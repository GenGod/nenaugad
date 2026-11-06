#!/bin/sh
# DEVX-005: inside the app containers Postgres is 127.0.0.1:5432, forwarded to the compose
# service `db`. localDatabaseUrl (src/server/config.ts) accepts only a loopback host; the
# database behind it is still the local compose one. The target is fixed here on purpose and
# never read from the environment, so this cannot point the app at another database.
set -eu

# Restart the forwarder if it ever exits; each connection resolves `db` again, so a
# restarted db container is found at its new address.
(
  while :; do
    socat TCP-LISTEN:5432,bind=127.0.0.1,reuseaddr,fork TCP:db:5432 || true
    sleep 1
  done
) &

# Wait until the forwarder listens (127.0.0.1:5432 in LISTEN state), at most 5 s.
tries=0
until grep -q '0100007F:1538 00000000:0000 0A' /proc/net/tcp; do
  tries=$((tries + 1))
  if [ "$tries" -ge 50 ]; then
    echo "DB_FORWARDER_NOT_LISTENING" >&2
    exit 1
  fi
  sleep 0.1
done

exec "$@"
