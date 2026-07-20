#!/usr/bin/env bash
#
# Stop everything scripts/start.sh started.
#
#   scripts/stop.sh              stop PostgreSQL (data is preserved in the named volume)
#   scripts/stop.sh --fabric     also tear down the Fabric test-network
#   scripts/stop.sh --purge      stop PostgreSQL AND delete its volume (all data lost)

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

PURGE=false
STOP_FABRIC=false

while [ $# -gt 0 ]; do
  case "$1" in
    --purge)  PURGE=true ;;
    --fabric) STOP_FABRIC=true ;;
    -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Unknown option: $1  (try --help)" ;;
  esac
  shift
done

if [ "$PURGE" = true ]; then
  step 'Stopping PostgreSQL and deleting its data volume'
  compose -f "$REPO_ROOT/docker-compose.yml" down -v
  ok 'PostgreSQL stopped, volume removed — the next start will re-seed from scratch'
else
  step 'Stopping PostgreSQL'
  compose -f "$REPO_ROOT/docker-compose.yml" down
  ok 'PostgreSQL stopped (data preserved in the ziam-postgres-data volume)'
fi

if [ "$STOP_FABRIC" = true ]; then
  "$REPO_ROOT/scripts/fabric-down.sh"
fi
