/**
 * MockLedger — Track A stand-in for Hyperledger Fabric (skeleton).
 * Will mimic the ledger's guarantees in code: append-only + SHA-256 hashing,
 * so the app layer and audit-integrity metric work on Windows with no Fabric.
 */
import type { LedgerService } from './LedgerService'

export class MockLedger implements LedgerService {
  readonly kind = 'mock' as const
  // TODO: implement LedgerService methods.
}
