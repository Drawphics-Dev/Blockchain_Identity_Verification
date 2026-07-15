'use strict'

/**
 * IdentityContract (ROADMAP Phase 5) — on-chain identity anchors.
 *
 * Stores a hash + public key per student, never a raw credential (ROADMAP §5 golden rule).
 * Its four transactions mirror the backend's `LedgerService` identity methods exactly, so
 * `FabricLedger` is a thin wrapper over this contract:
 *   registerIdentity · verifyIdentity · revokeIdentity · getIdentity
 *
 * World-state layout: one entry per student under composite key ('identity', studentId),
 * holding the JSON IdentityAnchor { studentId, credentialHash, publicKey, revoked, registeredAt }.
 *
 * Determinism: all inputs arrive as transaction arguments and the only "clock" used is the
 * transaction timestamp (identical on every endorsing peer), so endorsement is deterministic.
 */
const { Contract } = require('fabric-contract-api')

const IDENTITY = 'identity'

/** The transaction timestamp as an ISO-8601 string — deterministic across peers (unlike
 * Date.now(), which would break endorsement). Handles the protobuf Long shape defensively. */
function txTimestampIso(ctx) {
  const ts = ctx.stub.getTxTimestamp()
  const seconds =
    ts.seconds && typeof ts.seconds === 'object' && 'low' in ts.seconds
      ? ts.seconds.toNumber
        ? ts.seconds.toNumber()
        : ts.seconds.low
      : Number(ts.seconds)
  const millis = seconds * 1000 + Math.round((ts.nanos || 0) / 1e6)
  return new Date(millis).toISOString()
}

function requireArg(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`IdentityContract: '${name}' is required`)
  }
}

class IdentityContract extends Contract {
  constructor() {
    super('IdentityContract')
  }

  _key(ctx, studentId) {
    return ctx.stub.createCompositeKey(IDENTITY, [studentId])
  }

  /** @returns {Promise<object|null>} the anchor, or null if none is stored. */
  async _read(ctx, studentId) {
    const bytes = await ctx.stub.getState(this._key(ctx, studentId))
    return bytes && bytes.length ? JSON.parse(bytes.toString()) : null
  }

  /**
   * Anchor (or re-anchor) a student's identity. First anchoring stamps registeredAt and sets
   * revoked=false. Re-anchoring records a credential rotation: it updates the hash + public
   * key but deliberately preserves the existing `revoked` flag and `registeredAt` — matching
   * MockLedger.registerIdentity's upsert, so revocation is never implicitly undone by a
   * re-registration.
   * @returns {Promise<string>} JSON IdentityAnchor
   */
  async registerIdentity(ctx, studentId, credentialHash, publicKey) {
    requireArg('studentId', studentId)
    requireArg('credentialHash', credentialHash)
    requireArg('publicKey', publicKey)

    const existing = await this._read(ctx, studentId)
    const anchor = {
      studentId,
      credentialHash,
      publicKey,
      revoked: existing ? existing.revoked : false,
      registeredAt: existing ? existing.registeredAt : txTimestampIso(ctx),
    }

    await ctx.stub.putState(this._key(ctx, studentId), Buffer.from(JSON.stringify(anchor)))
    ctx.stub.setEvent('IdentityRegistered', Buffer.from(JSON.stringify({ studentId })))
    return JSON.stringify(anchor)
  }

  /**
   * True iff the submitted hash matches the anchored hash AND the identity is not revoked.
   * @returns {Promise<string>} 'true' | 'false' (JSON boolean)
   */
  async verifyIdentity(ctx, studentId, credentialHash) {
    requireArg('studentId', studentId)
    requireArg('credentialHash', credentialHash)
    const anchor = await this._read(ctx, studentId)
    const ok = !!anchor && anchor.revoked === false && anchor.credentialHash === credentialHash
    return JSON.stringify(ok)
  }

  /** Mark an identity revoked (Zero Trust instant revocation). Idempotent-safe: throws only
   * if the identity does not exist, so a caller learns a bad studentId rather than silently no-op. */
  async revokeIdentity(ctx, studentId) {
    requireArg('studentId', studentId)
    const anchor = await this._read(ctx, studentId)
    if (!anchor) throw new Error(`IdentityContract: no identity anchored for '${studentId}'`)
    anchor.revoked = true
    await ctx.stub.putState(this._key(ctx, studentId), Buffer.from(JSON.stringify(anchor)))
    ctx.stub.setEvent('IdentityRevoked', Buffer.from(JSON.stringify({ studentId })))
  }

  /**
   * Read an identity anchor (no secrets).
   * @returns {Promise<string>} JSON IdentityAnchor, or '' when none exists (the wrapper maps '' → null).
   */
  async getIdentity(ctx, studentId) {
    requireArg('studentId', studentId)
    const anchor = await this._read(ctx, studentId)
    return anchor ? JSON.stringify(anchor) : ''
  }
}

module.exports = IdentityContract
