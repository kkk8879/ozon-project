#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/ozon-project"
SKIP_WEB="false"
NO_PULL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --skip-web)
      SKIP_WEB="true"
      shift
      ;;
    --no-pull)
      NO_PULL="true"
      shift
      ;;
    -h|--help)
      cat <<'HELP'
Usage:
  bash scripts/ops-cloud-recover.sh [--project-dir /opt/ozon-project] [--skip-web] [--no-pull]

Options:
  --project-dir   Project directory containing docker-compose.yml
  --skip-web      Only recover postgres + api (skip web)
  --no-pull       Do not run git pull --ff-only
HELP
      exit 0
      ;;
    *)
      echo "[cloud-recover] Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[cloud-recover] $*"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "[cloud-recover] docker not found" >&2
  exit 1
fi

cd "$PROJECT_DIR"

if [[ ! -f docker-compose.yml ]]; then
  echo "[cloud-recover] docker-compose.yml not found in $PROJECT_DIR" >&2
  exit 1
fi

if [[ "$NO_PULL" != "true" && -d .git ]]; then
  log "Pulling latest code (fast-forward only)"
  git pull --ff-only
fi

log "Stopping compose services"
docker compose stop || true

SERVICES=("postgres" "api")
if [[ "$SKIP_WEB" != "true" ]]; then
  SERVICES+=("web")
fi

log "Starting with --no-build: ${SERVICES[*]}"
docker compose up -d --no-build "${SERVICES[@]}"

log "Container status"
docker compose ps

log "Health checks"
timeout 10s curl -fsS http://127.0.0.1:3001/health >/dev/null \
  && log "OK api health" \
  || log "WARN api health failed"

if [[ "$SKIP_WEB" != "true" ]]; then
  timeout 10s curl -fsS -I http://127.0.0.1:3000 >/dev/null \
    && log "OK web health" \
    || log "WARN web health failed"
fi

log "Recent logs"
docker compose logs --tail=80 api || true
if [[ "$SKIP_WEB" != "true" ]]; then
  docker compose logs --tail=80 web || true
fi

log "Cloud recover finished."
