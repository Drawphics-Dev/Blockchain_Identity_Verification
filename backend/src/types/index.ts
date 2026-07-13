/**
 * Shared domain & Zero Trust types.
 * These are the data shapes the LedgerService (and the future Fabric chaincode)
 * pass around. Kept implementation-agnostic so MockLedger and FabricLedger share them.
 */

/** Zero Trust access decision (ROADMAP §4.2). */
export type Decision = 'ALLOW' | 'STEP_UP' | 'DENY' | 'TERMINATE'

/** Which ledger implementation is active. */
export type LedgerKind = 'mock' | 'fabric'

/**
 * Identity anchor stored on-chain (IdentityContract).
 * Never contains the raw credential — only a hash + public key (ROADMAP §5).
 */
export interface IdentityAnchor {
  studentId: string
  /** hash(studentId + credential + salt) — proves identity without revealing it. */
  credentialHash: string
  publicKey: string
  revoked: boolean
  /** ISO-8601 timestamp of registration. */
  registeredAt: string
}

/** The payload logged for one access decision (input to logAccessEvent). */
export interface AccessEvent {
  eventId: string
  studentId: string
  /** The resource/endpoint that was requested, e.g. 'GET /api/fees'. */
  resource: string
  decision: Decision
  riskScore: number
  /** ISO-8601 timestamp of the decision. */
  timestamp: string
}

/**
 * An audit record as stored in the append-only ledger:
 * the event plus its cryptographic linkage (AuditContract).
 */
export interface AuditRecord extends AccessEvent {
  /** SHA-256 over the event payload + prevHash — the tamper fingerprint. */
  hash: string
  /** Hash of the previous record, chaining the log together. */
  prevHash: string
}

/** Result of an integrity check for a single audit event. */
export interface IntegrityResult {
  eventId: string
  valid: boolean
  expectedHash: string
  actualHash: string
}
