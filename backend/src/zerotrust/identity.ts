/**
 * On-chain identity anchor check (ROADMAP §2 step 4, §5; Phase 6: "verify identity anchor
 * on-chain at login"). Separate from the PDP/PEP risk engine — this is the hard identity
 * gate rather than a risk signal: bcrypt has already proved the password matches what is
 * stored, and this proves that what is stored is what was anchored, and is still valid.
 *
 * That second property is not redundant. The anchor is derived from the stored credential
 * hash, so if an attacker with database access rewrites a student's password hash to one
 * they control (the "data adulteration" threat, ROADMAP §1), the recomputed hash no longer
 * matches the anchor and login is refused — even though bcrypt itself would happily accept
 * the planted password. The ledger cannot be rewritten to match; that is the point.
 */
import { createHash, randomBytes } from 'node:crypto'
import { ledger } from '../ledger'

/** Why an identity check failed — the caller needs to tell these apart. */
export type IdentityVerdict =
  | { ok: true; anchored: 'existing' | 'new' }
  | { ok: false; reason: 'revoked' }
  | { ok: false; reason: 'credential_mismatch' }

/**
 * Deterministic commitment to the stored credential, without putting the credential — or
 * anything it could be recovered from — on the ledger (ROADMAP §5's golden rule).
 * Recomputed identically at anchoring time and at every login.
 */
export function computeCredentialHash(studentId: string, passwordHash: string): string {
  return createHash('sha256').update(`${studentId}:${passwordHash}`).digest('hex')
}

/**
 * This prototype has no client-side PKI/WebAuthn (ROADMAP §8: out of scope), so a random
 * key stands in for the public-key half of the anchor.
 */
function generatePlaceholderPublicKey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Verify this student's identity anchor, anchoring it on first sight.
 *
 * First login for a student anchors them (enrollment). After that the anchor is checked,
 * never silently rewritten: a mismatch is reported, not repaired, because repairing it
 * would destroy exactly the tamper-detection property described above.
 */
export async function verifyIdentityAnchor(
  studentId: string,
  credentialHash: string,
): Promise<IdentityVerdict> {
  const existing = await ledger.getIdentity(studentId)

  if (!existing) {
    await ledger.registerIdentity(studentId, credentialHash, generatePlaceholderPublicKey())
    return { ok: true, anchored: 'new' }
  }
  if (existing.revoked) return { ok: false, reason: 'revoked' }
  if (existing.credentialHash !== credentialHash) return { ok: false, reason: 'credential_mismatch' }

  return { ok: true, anchored: 'existing' }
}
