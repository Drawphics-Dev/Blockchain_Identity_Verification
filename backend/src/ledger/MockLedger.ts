/**
 * MockLedger — DEV-ONLY stand-in for Hyperledger Fabric.
 *
 * ⚠️ Not part of the approved (Fabric-first) deployment — it exists so the backend can
 * run and be tested on Windows before the real Fabric ledger (Phases 4–5) is stood up.
 * The final reported results come from FabricLedger, not this.
 *
 * It mimics the ledger's guarantees in code:
 *   - append-only: there is NO update or delete path for audit records;
 *   - hash-chained: each record stores SHA-256(payload + prevHash), so altering any
 *     record breaks its own hash and every hash after it — exactly what makes the
 *     audit-integrity / tamper-detection metric work (ROADMAP §5).
 */
import type {
  AccessEvent,
  AuditRecord,
  IdentityAnchor,
} from '../types'
import type { LedgerService } from './LedgerService'
import { hashEvent } from './hashEvent'

const GENESIS_HASH = '0'.repeat(64)

export class MockLedger implements LedgerService {
  readonly kind = 'mock' as const

  private readonly identities = new Map<string, IdentityAnchor>()
  /** Append-only: only ever pushed to, never spliced or mutated. */
  private readonly auditLog: AuditRecord[] = []

  // ---- Identity ----

  async registerIdentity(
    studentId: string,
    credentialHash: string,
    publicKey: string,
  ): Promise<IdentityAnchor> {
    const anchor: IdentityAnchor = {
      studentId,
      credentialHash,
      publicKey,
      revoked: false,
      registeredAt: new Date().toISOString(),
    }
    this.identities.set(studentId, anchor)
    return anchor
  }

  async verifyIdentity(studentId: string, credentialHash: string): Promise<boolean> {
    const anchor = this.identities.get(studentId)
    return !!anchor && !anchor.revoked && anchor.credentialHash === credentialHash
  }

  async revokeIdentity(studentId: string): Promise<void> {
    const anchor = this.identities.get(studentId)
    if (anchor) this.identities.set(studentId, { ...anchor, revoked: true })
  }

  async getIdentity(studentId: string): Promise<IdentityAnchor | null> {
    return this.identities.get(studentId) ?? null
  }

  // ---- Audit ----

  async logAccessEvent(event: AccessEvent): Promise<AuditRecord> {
    const prevHash = this.auditLog.at(-1)?.hash ?? GENESIS_HASH
    const record: AuditRecord = {
      ...event,
      prevHash,
      hash: hashEvent(event, prevHash),
    }
    this.auditLog.push(record) // append-only — the sole write path
    return record
  }

  async getAuditEvent(eventId: string): Promise<AuditRecord | null> {
    return this.auditLog.find((r) => r.eventId === eventId) ?? null
  }

  async getAuditTrail(studentId?: string): Promise<AuditRecord[]> {
    const trail = studentId
      ? this.auditLog.filter((r) => r.studentId === studentId)
      : this.auditLog
    return [...trail] // copy so callers can't mutate the log
  }

  async verifyEventIntegrity(eventId: string, offchainHash: string): Promise<boolean> {
    const record = await this.getAuditEvent(eventId)
    if (!record) return false
    // Recompute from the on-chain payload; compare to the supplied off-chain hash.
    const expected = hashEvent(record, record.prevHash)
    return expected === record.hash && record.hash === offchainHash
  }
}
