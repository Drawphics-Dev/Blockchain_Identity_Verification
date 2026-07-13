/**
 * FabricLedger — the approved target implementation (ROADMAP Phases 4–5).
 * A thin wrapper that forwards LedgerService calls to the deployed IdentityContract +
 * AuditContract via @hyperledger/fabric-gateway.
 *
 * Stubbed for now so the project compiles against the LedgerService interface; the
 * methods are implemented once the Fabric test-network + chaincode exist.
 */
import type {
  AccessEvent,
  AuditRecord,
  IdentityAnchor,
} from '../types'
import type { LedgerService } from './LedgerService'

const NOT_YET = 'FabricLedger: implement in ROADMAP Phases 4–5 (Fabric network + chaincode).'

export class FabricLedger implements LedgerService {
  readonly kind = 'fabric' as const

  async registerIdentity(
    _studentId: string,
    _credentialHash: string,
    _publicKey: string,
  ): Promise<IdentityAnchor> {
    throw new Error(NOT_YET)
  }

  async verifyIdentity(_studentId: string, _credentialHash: string): Promise<boolean> {
    throw new Error(NOT_YET)
  }

  async revokeIdentity(_studentId: string): Promise<void> {
    throw new Error(NOT_YET)
  }

  async getIdentity(_studentId: string): Promise<IdentityAnchor | null> {
    throw new Error(NOT_YET)
  }

  async logAccessEvent(_event: AccessEvent): Promise<AuditRecord> {
    throw new Error(NOT_YET)
  }

  async getAuditEvent(_eventId: string): Promise<AuditRecord | null> {
    throw new Error(NOT_YET)
  }

  async getAuditTrail(_studentId?: string): Promise<AuditRecord[]> {
    throw new Error(NOT_YET)
  }

  async verifyEventIntegrity(_eventId: string, _offchainHash: string): Promise<boolean> {
    throw new Error(NOT_YET)
  }
}
