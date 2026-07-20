#!/usr/bin/env bash
# Shared helpers for the start/stop scripts. Sourced, never executed directly.

set -euo pipefail

# Repo root, resolved from this file's location so the scripts work from any cwd.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_DIM=$'\033[2m'; C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''
fi

step() { printf '%s▸ %s%s\n' "$C_BLUE" "$*" "$C_RESET"; }
ok()   { printf '%s  ✓ %s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '%s  ! %s%s\n' "$C_YELLOW" "$*" "$C_RESET"; }
info() { printf '%s    %s%s\n' "$C_DIM" "$*" "$C_RESET"; }
die()  { printf '%s✗ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

# `docker compose` (v2 plugin) with a fallback to the legacy `docker-compose` binary.
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif have docker-compose; then
    docker-compose "$@"
  else
    die 'Neither `docker compose` nor `docker-compose` is available.'
  fi
}

require_prerequisites() {
  have docker || die 'Docker is not installed or not on PATH. Install Docker, then re-run.'
  docker info >/dev/null 2>&1 || die 'Docker is installed but not running. Start Docker Desktop (or the daemon) and re-run.'
  have node || die 'Node.js is not installed or not on PATH. Node 20+ is required.'

  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 20 ] || die "Node 20+ is required (found $(node -v))."

  have npm || die 'npm is not on PATH.'
}

# Read a single KEY=value out of an env file, tolerating quotes and trailing whitespace.
env_value() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 1
  sed -n "s/^[[:space:]]*${key}=[[:space:]]*//p" "$file" \
    | tail -n 1 \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" -e 's/[[:space:]]*$//'
}

# Replace the password in a postgres:// URL with ****, for printing.
#
# Never echo a connection string raw. This script's output is read over shoulders during a
# demo, pasted into issue reports and captured in CI logs, and a DATABASE_URL carries a live
# credential in the clear. The rest of the URL is what makes the message useful — which host,
# which port, which database — and none of that needs the password to be legible.
redact_url() {
  printf '%s' "$1" | sed -E 's|(://[^:/@]+:)[^@]*@|\1****@|'
}

# Install dependencies only when they are actually missing — a no-op on every run after the
# first, so `start.sh` stays fast enough to use as the everyday entry point.
ensure_deps() {
  local dir="$1" label="$2"
  if [ -d "$dir/node_modules" ]; then
    info "$label dependencies already installed"
    return
  fi
  step "Installing $label dependencies (first run — this takes a minute)"
  if [ -f "$dir/package-lock.json" ]; then
    (cd "$dir" && npm ci)
  else
    (cd "$dir" && npm install)
  fi
  ok "$label dependencies installed"
}

# Block until the Postgres container reports healthy, rather than racing the migration.
wait_for_postgres() {
  local waited=0 timeout="${1:-90}"
  step 'Waiting for PostgreSQL to accept connections'
  while true; do
    local status
    status="$(docker inspect -f '{{.State.Health.Status}}' ziam-postgres 2>/dev/null || echo 'missing')"
    case "$status" in
      healthy) ok 'PostgreSQL is ready'; return 0 ;;
      missing) die 'The ziam-postgres container is not running — `docker compose up` did not start it.' ;;
    esac
    [ "$waited" -lt "$timeout" ] || die "PostgreSQL did not become healthy within ${timeout}s (last status: $status)."
    sleep 2
    waited=$((waited + 2))
  done
}
