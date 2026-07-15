'use strict'

/**
 * The hash-chaining algorithm every audit record uses (ROADMAP §5).
 *
 * ⚠️ This MUST stay byte-for-byte identical to the backend's `src/ledger/hashEvent.ts`.
 * The whole tamper-detection property depends on the chaincode (which writes the on-chain
 * hash) and the backend's audit verifier (which recomputes it from the off-chain mirror)
 * producing the SAME hash for the same event — if the field order, separator, or number
 * formatting ever drifts between the two, every integrity check silently breaks.
 *
 * SHA-256 over: eventId | studentId | resource | decision | riskScore | timestamp | prevHash
 *
 * Deterministic by construction — no clocks, no randomness — so every Fabric peer that
 * endorses the transaction computes the identical hash and consensus holds.
 */
const { createHash } = require('crypto')

/** The prevHash of the very first record in the chain (no predecessor). */
const GENESIS_HASH = '0'.repeat(64)

/**
 * @param {{eventId:string, studentId:string, resource:string, decision:string, riskScore:(number|string), timestamp:string}} event
 * @param {string} prevHash
 * @returns {string} 64-char hex SHA-256 digest
 */
function hashEvent(event, prevHash) {
  const payload = [
    event.eventId,
    event.studentId,
    event.resource,
    event.decision,
    String(event.riskScore),
    event.timestamp,
    prevHash,
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}

module.exports = { hashEvent, GENESIS_HASH }
