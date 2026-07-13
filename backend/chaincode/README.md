# Chaincode (Hyperledger Fabric smart contracts) — ROADMAP Phase 5

Node.js chaincode (`fabric-contract-api`), deployed to the Fabric test-network.

- **identity/** — `IdentityContract`: `registerIdentity`, `verifyIdentity`, `revokeIdentity`, `getIdentity` (stores hashed anchors, never secrets).
- **audit/** — `AuditContract`: `logAccessEvent`, `getAuditEvent`, `getAuditTrail`, `verifyEventIntegrity` (append-only, hash-chained).

Function signatures mirror the backend's `LedgerService` interface so `FabricLedger` is a thin wrapper. Not yet implemented — built in Phase 5 after the network is up (Phase 4).
