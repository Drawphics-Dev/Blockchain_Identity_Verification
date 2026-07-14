/**
 * TOTP step-up MFA (ROADMAP §3, §4.2, Phase 6).
 *
 * Standard RFC-6238 (SHA-1, 6 digits, 30s), so any authenticator app — Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password — works without special handling.
 *
 * Enrollment model: the secret is issued with the account but is inert until the student
 * proves possession of a code generated from it. The QR is a ONE-TIME reveal — once enrolled,
 * the secret is never disclosed by any endpoint again. (An endpoint that hands the shared
 * secret to any authenticated caller on demand would make the second factor worthless: an
 * attacker who has the password could simply fetch it and mint their own codes.)
 */
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

const ISSUER = 'Zero Trust Student Portal'

export function generateMfaSecret(): string {
  return generateSecret()
}

export function mfaOtpAuthUrl(accountLabel: string, secret: string): string {
  // Matriculation numbers contain slashes ("SU/CS/2023/0187"). In an otpauth:// URI the label
  // is a PATH segment, so a slash must be percent-encoded — and several authenticator apps
  // mishandle %2F there, importing a mangled account or rejecting the QR outright. Dashes keep
  // the label readable and unambiguous.
  return generateURI({ issuer: ISSUER, label: accountLabel.replace(/\//g, '-'), secret })
}

/** The otpauth URI as a scannable PNG data URI, for an <img> in the enrollment screen. */
export function mfaQrDataUrl(accountLabel: string, secret: string): Promise<string> {
  return QRCode.toDataURL(mfaOtpAuthUrl(accountLabel, secret), { width: 240, margin: 1 })
}

export async function verifyMfaCode(secret: string, code: string): Promise<boolean> {
  try {
    // ±1 time step of tolerance. Phone and server clocks are rarely in exact sync, and a code
    // the student can plainly see would otherwise be rejected as wrong — which reads as a bug,
    // not as a timing gap. One step either side is the conventional allowance.
    const result = await verify({ secret, token: code, epochTolerance: 30 })
    return result.valid
  } catch {
    return false
  }
}
