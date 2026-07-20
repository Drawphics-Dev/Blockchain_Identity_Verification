#!/usr/bin/env bash
#
# ROADMAP Phase 4 — "wrap start-up in a single script so the network launches with one command",
# plus the Phase 5 chaincode deployment and the credential copy the backend needs.
#
# Replaces this manual sequence, which previously had to be typed out by hand every time the
# network was recreated (and silently produced a broken backend if a step was missed):
#
#   cd ~/fabric-samples/test-network
#   ./network.sh down
#   ./network.sh up createChannel -c mychannel -ca
#   ./network.sh deployCC -ccn ziam -ccp <repo>/backend/chaincode -ccl javascript
#   cp organizations/.../tlsca.org1.example.com-cert.pem  <repo>/backend/fabric-network/tlsca-cert.pem
#   cp organizations/.../User1@org1.example.com/msp/signcerts/*.pem  .../user-cert.pem
#   cp organizations/.../User1@org1.example.com/msp/keystore/*       .../user-key.pem
#
# Usage:  scripts/fabric-up.sh [--recreate]
#           (default)    reuse a network that is already running; only start one if none is up
#           --recreate   tear the existing network DOWN first and build a fresh one
#
# REUSE IS THE DEFAULT, AND DELIBERATELY SO. `network.sh down` destroys the ledger: every identity
# anchor and every audit record, permanently. That must never be what happens when someone runs the
# ordinary "start my app" command — restarting the backend is a routine act, and wiping the
# blockchain is not. Destroying data is opt-in, by a flag whose name says what it does.
#
# FABRIC_SAMPLES may point at a fabric-samples checkout other than ~/fabric-samples.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
TEST_NETWORK="$FABRIC_SAMPLES/test-network"
CHANNEL="$(env_value "$BACKEND_DIR/.env" FABRIC_CHANNEL || true)"; CHANNEL="${CHANNEL:-mychannel}"
CHAINCODE="$(env_value "$BACKEND_DIR/.env" FABRIC_CHAINCODE || true)"; CHAINCODE="${CHAINCODE:-ziam}"
CRYPTO_DIR="$BACKEND_DIR/fabric-network"

RECREATE=false
case "${1:-}" in
  --recreate) RECREATE=true ;;
  --keep)     ;; # accepted for compatibility; reuse is now the default
  '')         ;;
  *)          die "Unknown option: $1  (use --recreate to tear the network down first)" ;;
esac

# Is a network already up? The orderer is the single container nothing works without.
network_is_running() {
  docker ps --format '{{.Names}}' | grep -q '^orderer\.example\.com$'
}

# ── Windows → WSL bridge ──────────────────────────────────────────────────────────────────
#
# On Windows the usual layout is: this repo on the Windows filesystem, but fabric-samples inside
# the WSL2 distribution — because `network.sh` is a Linux script driving Linux Docker, and the
# Fabric docs install it there. Run from Git Bash, this script therefore cannot see the
# test-network at all, which is exactly what happened the first time it ran here.
#
# Rather than tell the user to go and run it somewhere else, re-execute THIS script inside WSL,
# where fabric-samples is present and network.sh runs natively. The repo stays reachable from WSL
# as /mnt/<drive>/..., so the chaincode path and the credential copy both still resolve — the
# certificates land back on the Windows side where the backend expects them.
if [ ! -d "$TEST_NETWORK" ] && command -v wsl.exe >/dev/null 2>&1; then
  if wsl.exe -e bash -lc '[ -d "$HOME/fabric-samples/test-network" ]' >/dev/null 2>&1; then
    # Git Bash presents D:\ as /d/... ; WSL expects /mnt/d/...
    wsl_script="$(printf '%s' "$REPO_ROOT/scripts/fabric-up.sh" | sed -E 's|^/([a-zA-Z])/|/mnt/\1/|')"
    step 'Fabric samples live in WSL — continuing there'
    info "  $wsl_script"
    exec wsl.exe -e bash -lc "'$wsl_script' $*"
  fi
fi

[ -d "$TEST_NETWORK" ] || die "Fabric test-network not found at $TEST_NETWORK.
    Install the Fabric 2.5 samples (ROADMAP Phase 1), or point FABRIC_SAMPLES at your checkout:
      FABRIC_SAMPLES=/path/to/fabric-samples scripts/fabric-up.sh
    On Windows, install fabric-samples inside WSL and this script will hand off to it
    automatically."

step "Fabric test-network  (channel: $CHANNEL, chaincode: $CHAINCODE)"
info "samples: $FABRIC_SAMPLES"

cd "$TEST_NETWORK"

if [ "$RECREATE" = true ]; then
  warn 'Recreating the network — the existing ledger will be DESTROYED.'
  info 'Every identity anchor and audit record on it is lost permanently.'
  step 'Tearing down the existing network'
  ./network.sh down >/dev/null 2>&1 || true
  ok 'Previous network removed'

  step 'Starting 2-org network with CAs and creating the channel'
  # -ca issues identities through Fabric CAs rather than cryptogen, which is what ROADMAP
  # Phase 4 specifies ("CA-issued identities").
  ./network.sh up createChannel -c "$CHANNEL" -ca
  ok "Network up, channel '$CHANNEL' created"
elif network_is_running; then
  ok 'Network already running — reusing it (ledger preserved)'
  info 'Use --recreate to tear it down and start a fresh chain.'
else
  step 'No network running — starting 2-org network with CAs and creating the channel'
  ./network.sh up createChannel -c "$CHANNEL" -ca
  ok "Network up, channel '$CHANNEL' created"
fi

# Is the chaincode already running on this network? Fabric names the container after the
# chaincode and its version, so its presence means an approved, committed definition exists.
chaincode_is_deployed() {
  docker ps --format '{{.Names}}' | grep -q "dev-peer0\.org1\.example\.com-${CHAINCODE}_"
}

if [ "$RECREATE" = false ] && chaincode_is_deployed; then
  ok "Chaincode '$CHAINCODE' already deployed on this network — skipping deploy"
  info 'Redeploying would require a sequence bump and takes minutes for no gain.'
  info "Deploy a genuinely new version with: scripts/fabric-up.sh --recreate"
else
  step 'Deploying IdentityContract + AuditContract'
  # The chaincode is packaged from its own path with its own package.json — it runs on the peers,
  # not in the Express process (see the deviation note in ROADMAP §6).
  ./network.sh deployCC -c "$CHANNEL" -ccn "$CHAINCODE" -ccp "$BACKEND_DIR/chaincode" -ccl javascript
  ok 'Chaincode deployed and committed to both orgs'
fi

# ── Credential copy ────────────────────────────────────────────────────────────────────────
# network.sh regenerates all crypto material on every `up`, so these must be re-copied each
# time or the gateway authenticates with certificates that no longer exist.
step 'Copying gateway credentials into backend/fabric-network/'
ORG_DIR="$TEST_NETWORK/organizations/peerOrganizations/org1.example.com"
USER_MSP="$ORG_DIR/users/User1@org1.example.com/msp"

[ -d "$USER_MSP" ] || die "Expected user MSP at $USER_MSP but it does not exist — did the network start correctly?"

mkdir -p "$CRYPTO_DIR"
cp "$ORG_DIR/tlsca/tlsca.org1.example.com-cert.pem" "$CRYPTO_DIR/tlsca-cert.pem"
# Globs: the filenames carry generated hashes, so they cannot be named literally.
cp "$USER_MSP"/signcerts/*.pem "$CRYPTO_DIR/user-cert.pem"
cp "$USER_MSP"/keystore/* "$CRYPTO_DIR/user-key.pem"
ok "Credentials copied ($(basename "$CRYPTO_DIR")/tlsca-cert.pem, user-cert.pem, user-key.pem)"

printf '\n'
ok 'Fabric network ready.'
info "Verify the backend can reach it with:  cd backend && npm run test:fabric"
