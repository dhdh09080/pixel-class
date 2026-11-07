#!/bin/sh
set -eu
if [ ! -s /run/secrets/staging_access ]; then
  echo 'A non-empty staging access secret is required.' >&2
  exit 1
fi
# A missing/empty auth snippet must never silently publish the application.
if ! caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile 2>/dev/null | grep -q '"handler":"authentication"'; then
  echo 'The Caddy configuration must include authentication.' >&2
  exit 1
fi
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
