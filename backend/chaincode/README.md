# Chaincode (Hyperledger Fabric smart contracts) — ROADMAP Phase 5

Node.js chaincode (`fabric-contract-api`), deployed to and executed by the Fabric peers — **not**
by the Express backend, which is why it has its own `package.json` and is packaged from this path.

## Contracts

- **`IdentityContract`** (`lib/identityContract.js`) — on-chain identity anchors (hash + public
  key, never a raw credential): `registerIdentity`, `verifyIdentity`, `revokeIdentity`,
  `getIdentity`.
- **`AuditContract`** (`lib/auditContract.js`) — append-only, hash-chained audit trail:
  `logAccessEvent`, `getAuditEvent`, `getAuditTrail`, `verifyEventIntegrity`.

The eight transaction signatures mirror the backend's `LedgerService` interface exactly, so
`src/ledger/FabricLedger.ts` becomes a thin wrapper (submit for writes, evaluate for reads,
mapping `''` → `null`).

## The load-bearing invariant

`lib/hashEvent.js` **must stay byte-for-byte identical** to the backend's
`src/ledger/hashEvent.ts` — the chaincode writes the on-chain hash and the backend's audit
verifier recomputes it from the off-chain mirror; if they drift, every integrity check breaks.
This parity is asserted by a cross-check during development and by the tamper-detection tests.

## Tests (run offline, no Fabric required)

```bash
cd chaincode
npm install        # brings fabric-contract-api + fabric-shim
npm test           # exercises both contracts against an in-memory stub — 26 checks
```

`test/contracts.test.js` verifies identity register/verify/revoke/re-anchor semantics (matching
MockLedger), audit sequencing + hash-chaining, per-student and full trails, append-only rejection
of duplicate event ids, input validation, and tamper detection.

## Deploy (ROADMAP Phases 1 + 4 — the Ubuntu step)

Chaincode only *runs* on a live Fabric peer, so it is authored on Windows but deployed on the
Ubuntu/WSL2 host once the test-network is up:

```bash
# from the Fabric test-network directory, with the network running (Phase 4)
peer lifecycle chaincode package ziam.tar.gz --path <repo>/backend/chaincode \
  --lang node --label ziam_0.1
# install on each org's peer, approve for both orgs, then commit:
peer lifecycle chaincode install ziam.tar.gz
peer lifecycle chaincode approveformyorg ... --name ziam --version 0.1 ...
peer lifecycle chaincode commit        ... --name ziam --version 0.1 ...
```

Then flip the backend to the real ledger: implement the method bodies in `FabricLedger.ts`
against `@hyperledger/fabric-gateway`, set `LEDGER=fabric` in `backend/.env`, and every layer
above `LedgerService` — auth, PEP, audit verifier, the Phase 8 simulation, the Phase 9 metrics —
runs unchanged against the real blockchain.

## State layout (for reference)

```
IdentityContract:  ('identity', studentId)                     -> IdentityAnchor JSON
AuditContract:     ('audit', <padSeq>)                         -> AuditRecord JSON (chain order)
                   ('auditEvent', eventId)                     -> padSeq          (O(1) by id)
                   ('auditStudent', studentId, <padSeq>)       -> padSeq          (per-student scan)
                   'audit:seq' -> next sequence   'audit:head' -> chain-tip hash
```
