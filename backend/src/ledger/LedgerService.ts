/**
 * LedgerService — the abstraction the backend depends on (IMPLEMENTATION.md §1.1).
 * Two implementations sit behind it: MockLedger (Track A) and FabricLedger (Track B).
 * Swapping them is a one-line config change (LEDGER=mock|fabric).
 *
 * Skeleton — flesh out the signatures in the ledger phase.
 */
export interface LedgerService {
  readonly kind: 'mock' | 'fabric'

  // TODO: registerIdentity, verifyIdentity, revokeIdentity, getIdentity
  // TODO: logAccessEvent, getAuditEvent, getAuditTrail, verifyEventIntegrity
}
