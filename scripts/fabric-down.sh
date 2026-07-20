#!/usr/bin/env bash
#
# Tear the Fabric test-network down. Destroys the ledger and every generated identity —
# which for this prototype is the intended way to reset on-chain state, since the audit trail
# is append-only and identity anchors cannot be revoked back to a usable state.
#
# Usage:  scripts/fabric-down.sh

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
TEST_NETWORK="$FABRIC_SAMPLES/test-network"

[ -d "$TEST_NETWORK" ] || die "Fabric test-network not found at $TEST_NETWORK (set FABRIC_SAMPLES)."

step 'Stopping the Fabric test-network'
(cd "$TEST_NETWORK" && ./network.sh down)
ok 'Network stopped and its containers removed'

# The copied certificates now refer to an identity that no longer exists. Leaving them in place
# makes the next `LEDGER=fabric` start fail with a TLS error that looks like a config problem
# rather than the real cause, which is that the network was destroyed.
if [ -d "$BACKEND_DIR/fabric-network" ]; then
  rm -f "$BACKEND_DIR/fabric-network/tlsca-cert.pem" \
        "$BACKEND_DIR/fabric-network/user-cert.pem" \
        "$BACKEND_DIR/fabric-network/user-key.pem"
  ok 'Stale gateway credentials removed'
fi

warn 'On-chain identity anchors are gone. Re-seed the database before the next Fabric run,'
info 'or every login will be refused: the stored password hashes will no longer match anything.'
