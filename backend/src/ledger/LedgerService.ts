/**
 * LedgerService — the single abstraction the backend depends on (ROADMAP §2, Phase 2).
 *
 * The rest of the backend (auth, PEP, audit verifier) talks ONLY to this interface,
 * never to Fabric internals. Two implementations sit behind it:
 *   - FabricLedger — the real Hyperledger Fabric ledger (Phases 4–5), the approved target.
 *   - MockLedger   — a dev-only, in-code stand-in so the backend can run before Fabric is up.
 *
 * Selected at startup by LEDGER=mock|fabric. The method signatures deliberately mirror
 * the IdentityContract + AuditContract chaincode (ROADMAP §6, Phase 5) so FabricLedger
 * becomes a thin wrapper.
 */
import type {
  AccessEvent,
  AuditRecord,
  IdentityAnchor,
  LedgerKind,
} from '../types'

export interface LedgerService {
  readonly kind: LedgerKind

  // ---- Identity (IdentityContract) ----

  /** Anchor a student's identity (hash + public key). Never stores the raw credential. */
  registerIdentity(
    studentId: string,
    credentialHash: string,
    publicKey: string,
  ): Promise<IdentityAnchor>

  /** True iff the submitted hash matches the anchored hash and the identity is not revoked. */
  verifyIdentity(studentId: string, credentialHash: string): Promise<boolean>

  /** Mark an identity revoked (Zero Trust instant revocation). */
  revokeIdentity(studentId: string): Promise<void>

  /** Read an identity anchor (no secrets), or null if none exists. */
  getIdentity(studentId: string): Promise<IdentityAnchor | null>

  // ---- Audit (AuditContract) ----

  /** Append one access decision to the immutable, hash-chained audit trail. */
  logAccessEvent(event: AccessEvent): Promise<AuditRecord>

  /** Read a single audit record by id, or null if not found. */
  getAuditEvent(eventId: string): Promise<AuditRecord | null>

  /** List audit records — all of them, or just one student's when studentId is given. */
  getAuditTrail(studentId?: string): Promise<AuditRecord[]>

  /**
   * Tamper check: recompute the on-chain record's hash and compare it to the supplied
   * off-chain hash. false => the off-chain mirror was tampered with (ROADMAP §5).
   */
  verifyEventIntegrity(eventId: string, offchainHash: string): Promise<boolean>
}
