/**
 * LedgerService — the single abstraction the backend depends on (ROADMAP §2, Phase 2).
 *
 * The rest of the backend (auth, PEP, audit verifier) talks ONLY to this interface,
 * never to Fabric internals. Two implementations sit behind it:
 *   - FabricLedger — the live Hyperledger Fabric 2.5 network (Phases 4–5). The deployment
 *     target, and the source of every reported result.
 *   - MockLedger   — a PostgreSQL-backed implementation for running without a blockchain.
 *     Not a throwaway: durable, append-only and hash-chained, so the engine behaves the same.
 *
 * Selected at startup by LEDGER=mock|fabric. The method signatures deliberately mirror
 * the IdentityContract + AuditContract chaincode (ROADMAP §6, Phase 5) so FabricLedger
 * becomes a thin wrapper.
 *
 * Keeping BOTH is what makes Phase 2's requirement checkable rather than merely stated: the
 * same engine, scenarios and metrics run unmodified on either, and the measured difference
 * between them is the cost-of-immutability result (TECHNICAL_REPORT §9.2).
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

  /**
   * True iff the submitted hash matches the anchored hash and the identity is not revoked —
   * with the comparison performed ON-CHAIN, inside the chaincode, rather than here.
   *
   * Note that login does NOT use this: it calls `getIdentity` and compares in application code,
   * because it must distinguish `revoked` from `credential_mismatch` (an administrative act
   * versus a tampering indicator) and a bare boolean cannot carry that difference. This method
   * is for the audit path — `GET /api/admin/identity/:studentId/verify` — where the stronger
   * claim is wanted: not "this server compared two values", but "the ledger itself confirms it".
   */
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
