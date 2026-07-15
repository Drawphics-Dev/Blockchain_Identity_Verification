'use strict'

/**
 * AuditContract (ROADMAP Phase 5) — the append-only, hash-chained audit trail.
 *
 * Its four transactions mirror the backend's `LedgerService` audit methods exactly, so
 * `FabricLedger` is a thin wrapper:
 *   logAccessEvent · getAuditEvent · getAuditTrail · verifyEventIntegrity
 *
 * The two properties the whole project rests on are enforced here, not merely asserted:
 *   - APPEND-ONLY. There is no update or delete transaction. A duplicate eventId is rejected,
 *     so a record can never be overwritten in place.
 *   - HASH-CHAINED. Each record stores SHA-256(payload + prevHash), linking it to the one
 *     before (see lib/hashEvent.js, kept identical to the backend's). Altering any record
 *     breaks its own hash and every hash after it, which is what makes tamper detection real.
 *
 * World-state layout:
 *   ('audit', <padSeq>)                     → the JSON AuditRecord (ordered by seq)
 *   ('auditEvent', <eventId>)               → <padSeq>            (O(1) lookup by event id)
 *   ('auditStudent', <studentId>, <padSeq>) → <padSeq>            (range scan per student)
 *   'audit:seq'  → next sequence number     'audit:head' → last record's hash (the chain tip)
 *
 * Determinism: eventId and timestamp are supplied by the caller (the backend), and no clock
 * or randomness is used here, so every endorsing peer computes the identical hash.
 */
const { Contract } = require('fabric-contract-api')
const { hashEvent, GENESIS_HASH } = require('./hashEvent')

const AUDIT = 'audit'
const AUDIT_EVENT = 'auditEvent'
const AUDIT_STUDENT = 'auditStudent'
const SEQ_KEY = 'audit:seq'
const HEAD_KEY = 'audit:head'

const DECISIONS = ['ALLOW', 'STEP_UP', 'DENY', 'TERMINATE']

/** Fixed-width sequence so composite-key range scans return records in chain order. */
function padSeq(seq) {
  return String(seq).padStart(12, '0')
}

function requireArg(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`AuditContract: '${name}' is required`)
  }
}

/** Drain a state iterator into an array of parsed JSON values (each stored value is a Buffer). */
async function collect(iterator) {
  const out = []
  for await (const res of iterator) {
    if (res.value && res.value.length) out.push(res.value.toString())
  }
  await iterator.close()
  return out
}

class AuditContract extends Contract {
  constructor() {
    super('AuditContract')
  }

  async _nextSeq(ctx) {
    const bytes = await ctx.stub.getState(SEQ_KEY)
    return bytes && bytes.length ? parseInt(bytes.toString(), 10) : 0
  }

  async _head(ctx) {
    const bytes = await ctx.stub.getState(HEAD_KEY)
    return bytes && bytes.length ? bytes.toString() : GENESIS_HASH
  }

  async _recordByPadded(ctx, padded) {
    const bytes = await ctx.stub.getState(ctx.stub.createCompositeKey(AUDIT, [padded]))
    return bytes && bytes.length ? bytes.toString() : ''
  }

  /**
   * Append one access decision to the immutable trail.
   * @returns {Promise<string>} JSON AuditRecord (event fields + hash, prevHash, seq).
   */
  async logAccessEvent(ctx, eventId, studentId, resource, decision, riskScore, timestamp) {
    requireArg('eventId', eventId)
    requireArg('studentId', studentId)
    requireArg('resource', resource)
    requireArg('decision', decision)
    requireArg('timestamp', timestamp)
    if (!DECISIONS.includes(decision)) {
      throw new Error(`AuditContract: decision must be one of ${DECISIONS.join(', ')} (got '${decision}')`)
    }
    const score = Number(riskScore)
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new Error(`AuditContract: riskScore must be an integer 0–100 (got '${riskScore}')`)
    }

    // Append-only: an eventId already on the chain must never be rewritten.
    const dupe = await ctx.stub.getState(ctx.stub.createCompositeKey(AUDIT_EVENT, [eventId]))
    if (dupe && dupe.length) {
      throw new Error(`AuditContract: event '${eventId}' already recorded — the trail is append-only`)
    }

    const seq = await this._nextSeq(ctx)
    const prevHash = await this._head(ctx)
    const event = { eventId, studentId, resource, decision, riskScore: score, timestamp }
    const hash = hashEvent(event, prevHash)
    const record = { ...event, hash, prevHash, seq }

    const padded = padSeq(seq)
    await ctx.stub.putState(ctx.stub.createCompositeKey(AUDIT, [padded]), Buffer.from(JSON.stringify(record)))
    await ctx.stub.putState(ctx.stub.createCompositeKey(AUDIT_EVENT, [eventId]), Buffer.from(padded))
    await ctx.stub.putState(ctx.stub.createCompositeKey(AUDIT_STUDENT, [studentId, padded]), Buffer.from(padded))
    await ctx.stub.putState(SEQ_KEY, Buffer.from(String(seq + 1)))
    await ctx.stub.putState(HEAD_KEY, Buffer.from(hash))

    ctx.stub.setEvent('AccessEventLogged', Buffer.from(JSON.stringify({ eventId, studentId, decision })))
    return JSON.stringify(record)
  }

  /**
   * Read a single audit record by id.
   * @returns {Promise<string>} JSON AuditRecord, or '' when not found (wrapper maps '' → null).
   */
  async getAuditEvent(ctx, eventId) {
    requireArg('eventId', eventId)
    const idx = await ctx.stub.getState(ctx.stub.createCompositeKey(AUDIT_EVENT, [eventId]))
    if (!idx || !idx.length) return ''
    return this._recordByPadded(ctx, idx.toString())
  }

  /**
   * List audit records — all of them, or just one student's when studentId is non-empty.
   * Returned in chain (seq) order.
   * @returns {Promise<string>} JSON array of AuditRecord.
   */
  async getAuditTrail(ctx, studentId) {
    if (studentId && studentId.trim() !== '') {
      // Per-student: the index values are padded seqs; resolve each to its full record.
      const iterator = await ctx.stub.getStateByPartialCompositeKey(AUDIT_STUDENT, [studentId])
      const paddedList = await collect(iterator)
      const records = []
      for (const padded of paddedList) {
        const rec = await this._recordByPadded(ctx, padded)
        if (rec) records.push(JSON.parse(rec))
      }
      return JSON.stringify(records)
    }

    // Whole trail: the ('audit', padSeq) space already holds the records in order.
    const iterator = await ctx.stub.getStateByPartialCompositeKey(AUDIT, [])
    const rows = await collect(iterator)
    return JSON.stringify(rows.map((r) => JSON.parse(r)))
  }

  /**
   * Tamper check (ROADMAP §5): the on-chain record must still hash to its own stored hash
   * (chain intact) AND the supplied off-chain hash must equal it (mirror untampered).
   * @returns {Promise<string>} 'true' | 'false' (JSON boolean)
   */
  async verifyEventIntegrity(ctx, eventId, offchainHash) {
    requireArg('eventId', eventId)
    requireArg('offchainHash', offchainHash)
    const recordJson = await this.getAuditEvent(ctx, eventId)
    if (!recordJson) return JSON.stringify(false)
    const record = JSON.parse(recordJson)
    const expected = hashEvent(record, record.prevHash)
    return JSON.stringify(expected === record.hash && record.hash === offchainHash)
  }
}

module.exports = AuditContract
