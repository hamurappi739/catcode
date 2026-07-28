#!/usr/bin/env bash
set -euo pipefail

project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$project_dir"

set -a
source .env
if [[ -f .monitor.env ]]; then
  source .monitor.env
fi
set +a

notify_failure() {
  logger -t catcode-license "License API health check failed."
  if [[ -n "${HEALTHCHECK_PING_URL:-}" ]]; then
    curl --fail --silent --show-error --max-time 10 "${HEALTHCHECK_PING_URL%/}/fail" >/dev/null || true
  fi
}
trap notify_failure ERR

: "${API_DOMAIN:?API_DOMAIN is required}"
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --max-time 15 \
  "https://${API_DOMAIN}/healthz" | grep -qx '{"ok":true}'

container_id="$(docker compose ps --quiet license-api)"
test -n "$container_id"
test "$(docker inspect --format='{{.State.Health.Status}}' "$container_id")" = "healthy"

if [[ -n "${HEALTHCHECK_PING_URL:-}" ]]; then
  curl --fail --silent --show-error --max-time 10 "$HEALTHCHECK_PING_URL" >/dev/null
fi

logger -t catcode-license "License API health check passed."
