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

/** Live signals the PDP scores on every login and every protected request (ROADMAP §4.1). */
export interface RiskSignals {
  /** Current device fingerprint differs from the one recorded for this context. */
  newDevice: boolean
  /** Current IP differs from the one recorded for this context. */
  newIpAddress: boolean
  /**
   * Reaching this location from the previous one would require travelling faster than the
   * configured maximum — the ROADMAP §4.1 "geovelocity / impossible travel" signal.
   * Stays false whenever either endpoint cannot be geolocated (see zerotrust/geo.ts).
   */
  impossibleTravel: boolean
  /** Outside configured business hours (policy.config.ts). */
  oddHour: boolean
  /** Session age is past the configured fraction of its total lifetime. */
  staleSession: boolean
  /** More requests in the configured window than the configured limit. */
  highRequestRate: boolean
  /**
   * This session touched more DISTINCT resources in the window than a normal user journey
   * covers — the ROADMAP §4.1 "navigation sequence" half of the behaviour-pattern signal.
   */
  abnormalNavigation: boolean
  /** The requested resource is one of the sensitive routes (fees, results). */
  sensitiveResource: boolean
}

/** PDP output for one evaluation (a login, or one protected request). */
export interface RiskEvaluation {
  riskScore: number
  decision: Decision
  /** Which signals fired, in RiskSignals key form — the human-readable "why". */
  reasons: (keyof RiskSignals)[]
}
