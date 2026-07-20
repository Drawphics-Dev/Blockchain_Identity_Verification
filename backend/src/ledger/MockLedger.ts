/**
 * MockLedger — a PostgreSQL-backed implementation of LedgerService, for running the system
 * without a blockchain.
 *
 * ⚠️ NOT the deployment target and NOT the source of any reported result. The system runs on
 * `LEDGER=fabric` (FabricLedger, live 2-org network) and every published figure was measured
 * there. This exists so the portal and the Zero Trust engine can be developed and demonstrated
 * on a machine with no Fabric network — `LEDGER=mock` starts in seconds rather than minutes.
 *
 * It also earns its place in the evaluation. Having two working implementations behind one
 * interface is what turns ROADMAP Phase 2's claim — "the backend never depends on Fabric
 * internals" — from an assertion into something demonstrable: the same engine, the same six
 * scenarios and the same metrics code run unmodified on either, and the only figure that moves
 * is latency. That comparison is precisely the cost-of-immutability finding in
 * TECHNICAL_REPORT §9.2 (login 0.30 s off-chain vs 3.31 s on-chain).
 *
 * Its tables (LedgerIdentity, LedgerAuditRecord) are untouched under LEDGER=fabric; anything
 * left in them is residue from earlier mock runs, not live state.
 *
 * It imitates the ledger's guarantees rather than merely pretending to:
 *
 *   - DURABLE. Backed by PostgreSQL (LedgerIdentity / LedgerAuditRecord). An earlier
 *     version kept the chain in a JS array, which meant every process restart silently
 *     erased the entire audit trail and every identity anchor — an "immutable audit trail"
 *     that does not survive a restart demonstrates nothing.
 *   - APPEND-ONLY. There is no update or delete path for audit records anywhere in this
 *     class. `revokeIdentity` is the sole mutation, and only on the identity table, because
 *     Zero Trust revocation demands it (ROADMAP §4.2).
 *   - HASH-CHAINED. Each record stores SHA-256(payload + prevHash), so altering any record
 *     breaks its own hash and every hash after it. This is what makes the tamper-detection
 *     metric (ROADMAP §5, §7d) real rather than asserted.
 *
 * FabricLedger implements this same interface, and nothing above LedgerService differs between
 * them — which is the property the two-implementation setup exists to prove.
 */
import type { AccessEvent, AuditRecord, IdentityAnchor } from '../types'
import { prisma } from '../db/prisma'
import type { LedgerService } from './LedgerService'
import { hashEvent } from './hashEvent'

const GENESIS_HASH = '0'.repeat(64)

/**
 * Serialises appends across concurrent requests.
 *
 * The chain is only sound if "read the last hash" and "insert linking to it" happen
 * atomically. They do not by default: a single dashboard load fires four API calls in
 * parallel, each of which logs a decision, so two appends can read the same tail and both
 * link to it — forking the chain and corrupting every verification after that point. A
 * transaction alone does NOT prevent this (the reads don't conflict under Postgres' default
 * READ COMMITTED). A transaction-scoped advisory lock does: it is held to commit and
 * released automatically, even if the transaction aborts.
 */
const CHAIN_LOCK_KEY = 4_812_003

export class MockLedger implements LedgerService {
  readonly kind = 'mock' as const

  // ---- Identity (IdentityContract) ----

  async registerIdentity(
    studentId: string,
    credentialHash: string,
    publicKey: string,
  ): Promise<IdentityAnchor> {
    const row = await prisma.ledgerIdentity.upsert({
      where: { studentId },
      // Re-anchoring an existing identity is how a credential rotation is recorded; it
      // deliberately clears `revoked` only via an explicit re-registration, never implicitly.
      update: { credentialHash, publicKey },
      create: { studentId, credentialHash, publicKey },
    })
    return this.toAnchor(row)
  }

  async verifyIdentity(studentId: string, credentialHash: string): Promise<boolean> {
    const row = await prisma.ledgerIdentity.findUnique({ where: { studentId } })
    return !!row && !row.revoked && row.credentialHash === credentialHash
  }

  async revokeIdentity(studentId: string): Promise<void> {
    await prisma.ledgerIdentity.updateMany({ where: { studentId }, data: { revoked: true } })
  }

  async getIdentity(studentId: string): Promise<IdentityAnchor | null> {
    const row = await prisma.ledgerIdentity.findUnique({ where: { studentId } })
    return row ? this.toAnchor(row) : null
  }

  // ---- Audit (AuditContract) ----

  async logAccessEvent(event: AccessEvent): Promise<AuditRecord> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`

      const tail = await tx.ledgerAuditRecord.findFirst({
        orderBy: { seq: 'desc' },
        select: { hash: true },
      })
      const prevHash = tail?.hash ?? GENESIS_HASH

      const created = await tx.ledgerAuditRecord.create({
        data: {
          eventId: event.eventId,
          studentId: event.studentId,
          resource: event.resource,
          decision: event.decision,
          riskScore: event.riskScore,
          timestamp: new Date(event.timestamp),
          prevHash,
          hash: hashEvent(event, prevHash),
        },
      })
      return this.toRecord(created)
    })
  }

  async getAuditEvent(eventId: string): Promise<AuditRecord | null> {
    const row = await prisma.ledgerAuditRecord.findUnique({ where: { eventId } })
    return row ? this.toRecord(row) : null
  }

  async getAuditTrail(studentId?: string): Promise<AuditRecord[]> {
    const rows = await prisma.ledgerAuditRecord.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { seq: 'asc' },
    })
    return rows.map((row) => this.toRecord(row))
  }

  async verifyEventIntegrity(eventId: string, offchainHash: string): Promise<boolean> {
    const record = await this.getAuditEvent(eventId)
    if (!record) return false
    // Two independent checks: the on-chain record must still hash to its own stored hash
    // (the chain is intact), AND the off-chain copy must agree with it (no tampering).
    const expected = hashEvent(record, record.prevHash)
    return expected === record.hash && record.hash === offchainHash
  }

  // ---- Row → domain shape ----

  private toAnchor(row: {
    studentId: string
    credentialHash: string
    publicKey: string
    revoked: boolean
    registeredAt: Date
  }): IdentityAnchor {
    return {
      studentId: row.studentId,
      credentialHash: row.credentialHash,
      publicKey: row.publicKey,
      revoked: row.revoked,
      registeredAt: row.registeredAt.toISOString(),
    }
  }

  private toRecord(row: {
    eventId: string
    studentId: string
    resource: string
    decision: string
    riskScore: number
    timestamp: Date
    hash: string
    prevHash: string
  }): AuditRecord {
    return {
      eventId: row.eventId,
      studentId: row.studentId,
      resource: row.resource,
      decision: row.decision as AuditRecord['decision'],
      riskScore: row.riskScore,
      timestamp: row.timestamp.toISOString(),
      hash: row.hash,
      prevHash: row.prevHash,
    }
  }
}
