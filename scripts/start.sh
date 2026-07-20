#!/usr/bin/env bash
#
# ROADMAP Phase 9 — "Package the full stack for one-command start-up and prepare the live
# showcase."
#
# Replaces the manual sequence that previously had to be performed in order, by hand, every
# time: start Postgres → migrate → seed → start the Fabric network → deploy chaincode → copy
# three certificates → start the backend → start the frontend.
#
#   scripts/start.sh                     use whatever LEDGER the backend .env specifies
#   scripts/start.sh --mock              force MockLedger (fast; no blockchain needed)
#   scripts/start.sh --fabric            start on Fabric, REUSING a running network if there is one
#   scripts/start.sh --fabric --recreate tear the Fabric network down first — DESTROYS the ledger
#   scripts/start.sh --seed              force a database re-seed (see the warning below)
#   scripts/start.sh --no-seed           never seed, even on an empty database
#
# Reuse is the default for the Fabric network: restarting the app is routine, and destroying the
# blockchain is not. Teardown happens only behind --recreate.
#
# SEEDING IS NOT AUTOMATIC ON FABRIC, AND THAT IS DELIBERATE. prisma/seed.ts regenerates every
# student's password hash, and an identity anchor is a commitment to that hash. It clears the
# MockLedger's anchor table to stay consistent — but on a real Fabric network the anchors are
# on-chain and cannot be deleted. Re-seeding there leaves every stored hash disagreeing with
# its anchor, and every login is refused with `identity_mismatch`: a permanent lockout that
# looks exactly like the tampering the system is designed to detect. On Fabric this script
# therefore seeds only an EMPTY database, and `--seed` prints what it is about to do first.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

LEDGER_OVERRIDE=''
FABRIC_KEEP=''
SEED_MODE='auto'   # auto | force | never

while [ $# -gt 0 ]; do
  case "$1" in
    --mock)     LEDGER_OVERRIDE='mock' ;;
    --fabric)   LEDGER_OVERRIDE='fabric' ;;
    --recreate) FABRIC_KEEP='--recreate' ;;
    --keep)     ;; # reuse is the default now; accepted so old instructions still work
    --seed)    SEED_MODE='force' ;;
    --no-seed) SEED_MODE='never' ;;
    -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         die "Unknown option: $1  (try --help)" ;;
  esac
  shift
done

printf '\n%s══ Zero Trust Identity Verification — starting the full stack ══%s\n\n' "$C_BLUE" "$C_RESET"

require_prerequisites
ok "Docker and Node $(node -v) present"

# ── 1. Backend environment ────────────────────────────────────────────────────────────────
ENV_FILE="$BACKEND_DIR/.env"
POSTGRES_USER='ziam'
POSTGRES_PASSWORD='ziam_dev_password'
POSTGRES_DB='blockchain'
# Deliberately not 5432 — see the comment on the ports mapping in docker-compose.yml.
POSTGRES_PORT='55432'
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"

if [ ! -f "$ENV_FILE" ]; then
  step 'Creating backend/.env (first run)'
  cp "$BACKEND_DIR/.env.example" "$ENV_FILE"

  # A real random signing key, not the placeholder. Leaving the example value in place would
  # mean every deployment of this prototype shares a JWT secret.
  JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  # The DATABASE_URL must match what docker-compose.yml actually creates.
  #   `|` as the sed delimiter: the URL contains `/` throughout.
  sed -i.bak \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=\"${DB_URL}\"|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=\"${JWT_SECRET}\"|" \
    "$ENV_FILE"
  rm -f "$ENV_FILE.bak"
  ok 'backend/.env created with a generated JWT secret and the compose database URL'
else
  info 'backend/.env already exists — left untouched'

  # An existing .env is never rewritten (it may hold real, deliberate settings). But if it
  # points somewhere other than the database this script starts, the container comes up and
  # then sits there unused while the app talks to a different server — the two look identical
  # from the outside until the data is wrong. Say so rather than let it pass silently.
  CURRENT_URL="$(env_value "$ENV_FILE" DATABASE_URL || true)"
  case "$CURRENT_URL" in
    *"localhost:${POSTGRES_PORT}"*|*"127.0.0.1:${POSTGRES_PORT}"*)
      ok "backend/.env points at the compose database (port ${POSTGRES_PORT})"
      ;;
    *)
      warn "backend/.env points at a DIFFERENT database than this script starts."
      info "  .env:    $(redact_url "${CURRENT_URL:-<unset>}")"
      info "  compose: $(redact_url "${DB_URL}")"
      info 'The containerised PostgreSQL will start but go unused. To switch, set DATABASE_URL'
      info 'in backend/.env to the compose URL above (or delete .env to have it regenerated).'
      ;;
  esac
fi

# Resolve the ledger: explicit flag wins, otherwise whatever .env says, otherwise mock.
LEDGER="$LEDGER_OVERRIDE"
if [ -z "$LEDGER" ]; then
  LEDGER="$(env_value "$ENV_FILE" LEDGER || true)"
  LEDGER="${LEDGER:-mock}"
fi
[ "$LEDGER" = 'mock' ] || [ "$LEDGER" = 'fabric' ] || die "LEDGER must be 'mock' or 'fabric' (got '$LEDGER')."

if [ -n "$LEDGER_OVERRIDE" ]; then
  sed -i.bak "s|^LEDGER=.*|LEDGER=${LEDGER}|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
fi
ok "Ledger: $LEDGER"

# ── 2. Dependencies ───────────────────────────────────────────────────────────────────────
ensure_deps "$BACKEND_DIR" 'Backend'
ensure_deps "$FRONTEND_DIR" 'Frontend'

# ── 3. PostgreSQL ─────────────────────────────────────────────────────────────────────────
step 'Starting PostgreSQL (Docker)'
POSTGRES_USER="$POSTGRES_USER" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
POSTGRES_DB="$POSTGRES_DB" POSTGRES_PORT="$POSTGRES_PORT" \
  compose -f "$REPO_ROOT/docker-compose.yml" up -d postgres
wait_for_postgres

# ── 4. Fabric (only when asked for) ───────────────────────────────────────────────────────
if [ "$LEDGER" = 'fabric' ]; then
  # shellcheck disable=SC2086
  "$REPO_ROOT/scripts/fabric-up.sh" $FABRIC_KEEP
fi

# ── 5. Schema + data ──────────────────────────────────────────────────────────────────────
step 'Applying database migrations'
(cd "$BACKEND_DIR" && npx prisma migrate deploy && npx prisma generate >/dev/null)
ok 'Schema up to date'

# How many students are in the database — asked of the CONTAINER, which is only the same
# database the app uses when .env points at it. When it does not (an existing .env aimed at a
# local PostgreSQL, say), this count describes a different server entirely, and deciding whether
# to seed from it would mean seeding, or skipping, based on the wrong database. So the auto path
# is used only when the two are known to agree; otherwise seeding must be asked for explicitly.
student_count() {
  docker exec ziam-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    'SELECT COUNT(*) FROM "Student";' 2>/dev/null | tr -d '[:space:]'
}

CURRENT_URL="$(env_value "$ENV_FILE" DATABASE_URL || true)"
case "$CURRENT_URL" in
  *"localhost:${POSTGRES_PORT}"*|*"127.0.0.1:${POSTGRES_PORT}"*) USES_COMPOSE_DB=true ;;
  *) USES_COMPOSE_DB=false ;;
esac

if [ "$USES_COMPOSE_DB" = true ]; then
  COUNT="$(student_count)"
  COUNT="${COUNT:-0}"
else
  COUNT='unknown'
  [ "$SEED_MODE" = 'auto' ] && SEED_MODE='never'
fi

case "$SEED_MODE" in
  never)
    if [ "$USES_COMPOSE_DB" = false ]; then
      info 'Not seeding: backend/.env points at a database this script does not manage,'
      info 'so it cannot tell whether that database is empty. Use --seed to seed it explicitly.'
    else
      info "Skipping seed (--no-seed). Students in database: $COUNT"
    fi
    ;;
  force)
    if [ "$LEDGER" = 'fabric' ] && [ "$COUNT" != '0' ]; then
      warn 'Re-seeding against a LIVE FABRIC LEDGER.'
      info 'Every password hash will be regenerated, but the on-chain identity anchors commit'
      info 'to the OLD hashes and cannot be deleted. Every student will then be refused login'
      info "with 'identity_mismatch'. Tear the network down first (scripts/fabric-down.sh)"
      info 'if that is not what you want.'
      printf '%s    Continue? [y/N] %s' "$C_YELLOW" "$C_RESET"
      read -r reply
      case "$reply" in [yY]*) ;; *) die 'Aborted before seeding.' ;; esac
    fi
    step 'Seeding the database'
    (cd "$BACKEND_DIR" && npm run db:seed)
    ok 'Database seeded'
    ;;
  auto)
    if [ "$COUNT" = '0' ]; then
      step 'Seeding the database (it is empty)'
      (cd "$BACKEND_DIR" && npm run db:seed)
      ok 'Database seeded'
    else
      info "Database already has $COUNT students — not re-seeding (use --seed to force)"
    fi
    ;;
esac

# ── 6. Backend + frontend ─────────────────────────────────────────────────────────────────
# Both run in the foreground of this script, and the trap makes Ctrl-C stop the pair rather
# than orphaning one of them.
cleanup() {
  printf '\n'
  step 'Shutting down'
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  ok 'Backend and frontend stopped'
  info 'PostgreSQL is still running — stop it with scripts/stop.sh'
}
trap cleanup INT TERM

step 'Starting the backend (port 3000)'
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!

# Give Express time to bind before Vite proxies anything at it, and fail loudly if it died
# on startup (a bad DATABASE_URL or an unreachable peer both surface here).
sleep 4
kill -0 "$BACKEND_PID" 2>/dev/null || die 'The backend exited during startup — see the output above.'

step 'Starting the frontend (port 5173)'
(cd "$FRONTEND_DIR" && npm run dev) &
FRONTEND_PID=$!

printf '\n%s══ Running ══%s\n' "$C_GREEN" "$C_RESET"
printf '  Portal      http://localhost:5173\n'
printf '  API         http://localhost:3000\n'
printf '  API docs    http://localhost:3000/docs\n'
printf '  Ledger      %s\n' "$LEDGER"
printf '\n  Sign in as   SU/CS/2023/0187   password  demo1234\n'
printf '  Admin view   SU/IT/ADMIN/001   password  demo1234\n'
printf '\n%sCtrl-C stops the backend and frontend.%s\n\n' "$C_DIM" "$C_RESET"

wait
