#!/usr/bin/env bash
# Host-side web health monitor.
# If the site does not respond, restart the Docker Compose stack (or app service).
#
# Install cron (every 2 minutes), from the project directory on the server:
#   chmod +x docker/healthcheck-restart.sh
#   crontab -e
#   */2 * * * * /root/dock/bitbrick/deploy/healthcheck-restart.sh >> /root/dock/bitbrick/deploy/storage/logs/healthcheck-cron.log 2>&1
#
# Optional environment overrides:
#   HEALTH_URL              default https://bitbrick.worldprogramming.org/up
#   HEALTH_HOME_URL         default https://bitbrick.worldprogramming.org/
#   HEALTH_TIMEOUT          curl timeout for /up (default 10)
#   HEALTH_HOME_TIMEOUT     curl timeout for the homepage (default 20)
#   HEALTH_RETRIES          failed attempts before restart (default 3)
#   HEALTH_RETRY_SLEEP      seconds between retries (default 5)
#   HEALTH_POST_RESTART_SLEEP  seconds to wait after restart (default 15)
#   RESTART_TARGET          "app" (default) or "all"
#   COMPOSE_FILE            path to compose file
#   COMPOSE_PROJECT_DIR     directory containing the compose file
#   LOG_FILE                log path (default: <project>/storage/logs/healthcheck-restart.log)
#   HEALTH_CURL             curl binary (default curl)
#   HEALTH_DOCKER           docker binary (default docker)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$(cd "${SCRIPT_DIR}" && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose-prod.yml}"
HEALTH_URL="${HEALTH_URL:-https://bitbrick.worldprogramming.org/up}"
HEALTH_HOME_URL="${HEALTH_HOME_URL:-https://bitbrick.worldprogramming.org/}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-10}"
HEALTH_HOME_TIMEOUT="${HEALTH_HOME_TIMEOUT:-20}"
HEALTH_RETRIES="${HEALTH_RETRIES:-3}"
HEALTH_RETRY_SLEEP="${HEALTH_RETRY_SLEEP:-5}"
HEALTH_POST_RESTART_SLEEP="${HEALTH_POST_RESTART_SLEEP:-15}"
RESTART_TARGET="${RESTART_TARGET:-app}"
LOG_FILE="${LOG_FILE:-${PROJECT_DIR}/storage/logs/healthcheck-restart.log}"
LOCK_FILE="${LOCK_FILE:-/tmp/bitbrick-healthcheck-restart.lock}"
HEALTH_CURL="${HEALTH_CURL:-curl}"
HEALTH_DOCKER="${HEALTH_DOCKER:-docker}"

mkdir -p "$(dirname "${LOG_FILE}")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

compose() {
    if "${HEALTH_DOCKER}" compose version >/dev/null 2>&1; then
        "${HEALTH_DOCKER}" compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_DIR}" "$@"
    else
        docker-compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_DIR}" "$@"
    fi
}

is_healthy() {
    local url="$1"
    local timeout="${2:-$HEALTH_TIMEOUT}"
    local code

    code="$(
        "${HEALTH_CURL}" -sS -o /dev/null -w '%{http_code}' \
            --connect-timeout "${timeout}" \
            --max-time "${timeout}" \
            -L \
            "${url}" 2>/dev/null || true
    )"
    case "${code}" in
        2??|3??) return 0 ;;
        *) return 1 ;;
    esac
}

# Both /up and the homepage must succeed. /up can stay green while
# PHP-FPM is wedged on real pages, which is why the homepage is required.
check_web() {
    local failed=0

    echo "check web ${HEALTH_URL} ${HEALTH_HOME_URL}"

    if is_healthy "${HEALTH_URL}" "${HEALTH_TIMEOUT}"; then
        echo " - good: ${HEALTH_URL}"
    else
        echo " - bad: ${HEALTH_URL}"
        failed=1
    fi

    if is_healthy "${HEALTH_HOME_URL}" "${HEALTH_HOME_TIMEOUT}"; then
        echo " - good: ${HEALTH_HOME_URL}"
    else
        echo " - bad: ${HEALTH_HOME_URL}"
        failed=1
    fi

    if (( failed == 0 )); then
        return 0
    fi

    return 1
}

restart_stack() {
    log "Restarting Docker (target=${RESTART_TARGET}) using ${COMPOSE_FILE}"

    if [[ "${RESTART_TARGET}" == "all" ]]; then
        compose restart
    else
        compose restart app
    fi

    # Give the app a moment, then verify once.
    sleep "${HEALTH_POST_RESTART_SLEEP}"

    if check_web; then
        log "Health check recovered after restart"
        return 0
    fi

    log "WARNING: health check still failing after restart"
    return 1
}

# Prevent overlapping cron runs.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    log "Another healthcheck is already running; exiting"
    exit 0
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
    log "ERROR: compose file not found: ${COMPOSE_FILE}"
    exit 1
fi

if ! command -v "${HEALTH_CURL}" >/dev/null 2>&1; then
    log "ERROR: curl is required"
    exit 1
fi

if ! command -v "${HEALTH_DOCKER}" >/dev/null 2>&1; then
    log "ERROR: docker is required"
    exit 1
fi

attempt=1
while (( attempt <= HEALTH_RETRIES )); do
    if check_web; then
        if (( attempt > 1 )); then
            log "Health check OK on retry ${attempt}/${HEALTH_RETRIES} (${HEALTH_URL} ${HEALTH_HOME_URL})"
        fi
        exit 0
    fi

    log "Health check failed (${attempt}/${HEALTH_RETRIES}) for ${HEALTH_URL} ${HEALTH_HOME_URL}"
    if (( attempt < HEALTH_RETRIES )); then
        sleep "${HEALTH_RETRY_SLEEP}"
    fi
    attempt=$((attempt + 1))
done

log "Site unresponsive after ${HEALTH_RETRIES} attempts; restarting"
restart_stack
exit $?

