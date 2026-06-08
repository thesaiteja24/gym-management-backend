#!/usr/bin/env sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE="$ROOT_DIR/.env"
TAG="${1:-}"

if [ -z "$TAG" ]; then
  echo "usage: $0 <pump-api-image-tag>"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "missing .env"
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

if [ -z "${MASTER_URL:-}" ] || [ -z "${REDIS_URL:-}" ] || [ -z "${SESSION_SECRET:-}" ] || [ -z "${GOOGLE_WEB_CLIENT_ID:-}" ]; then
  echo "missing required production environment variables in .env"
  exit 1
fi

if [ -z "${PORT:-}" ] || [ -z "${PUMP_DOMAIN:-}" ] || [ -z "${CADDY_EMAIL:-}" ]; then
  echo "missing required deploy variables in .env"
  exit 1
fi

if grep -q '^PUMP_API_IMAGE_TAG=' "$ENV_FILE"; then
  sed -i.bak "s/^PUMP_API_IMAGE_TAG=.*/PUMP_API_IMAGE_TAG=$TAG/" "$ENV_FILE"
else
  printf '\nPUMP_API_IMAGE_TAG=%s\n' "$TAG" >> "$ENV_FILE"
fi
rm -f "$ENV_FILE.bak"

cd "$ROOT_DIR"

docker compose --env-file ./.env pull pump-api pump-reminder-worker pump-api-migrate caddy
docker compose --env-file ./.env run --rm pump-api-migrate
docker compose --env-file ./.env up -d pump-api pump-reminder-worker caddy

docker compose --env-file ./.env exec -T pump-api \
  wget -qO- "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null

docker compose --env-file ./.env exec -T pump-api \
  wget -qO- "http://127.0.0.1:${PORT}/docs/json" >/dev/null

echo "Pump deploy succeeded with image tag: $TAG"
