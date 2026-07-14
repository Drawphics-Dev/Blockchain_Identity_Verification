/**
 * On-chain identity anchor check (ROADMAP §2 step 4, §4, §5; Phase 6: "verify identity
 * anchor on-chain at login"). Separate from the PDP/PEP risk engine — this is the hard
 * identity gate: bcrypt already proved the password is correct, this proves (and lets an
 * incident-response action instantly revoke) an anchored identity on the ledger.
 */
import { createHash, randomBytes } from 'node:crypto'
import { ledger } from '../ledger'

/**
 * Deterministic hash proving possession of the stored credential, without ever putting the
 * raw password — or anything from which it could be recovered — on-chain (ROADMAP §5's
 * golden rule). Recomputed identically at anchoring time and at every login from the
 * already-bcrypt-verified password hash, so it never needs to be passed around itself.
 */
export function computeCredentialHash(studentId: string, passwordHash: string): string {
  return createHash('sha256').update(`${studentId}:${passwordHash}`).digest('hex')
}

/**
 * This prototype has no real client-side PKI/WebAuthn (ROADMAP §8: out of scope) — a
 * random key stands in for the public key half of the identity anchor.
 */
function generatePlaceholderPublicKey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * True iff this student has a valid, non-revoked identity anchor on the ledger for the
 * given credential hash — anchoring it on first use if none exists yet (MockLedger is
 * in-memory and empty on every process restart; FabricLedger's anchor would persist for
 * real, so this only ever anchors once there).
 */
export async function verifyOrAnchorIdentity(studentId: string, credentialHash: string): Promise<boolean> {
  const existing = await ledger.getIdentity(studentId)
  if (!existing) {
    await ledger.registerIdentity(studentId, credentialHash, generatePlaceholderPublicKey())
    return true
  }
  return ledger.verifyIdentity(studentId, credentialHash)
}
