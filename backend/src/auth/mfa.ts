/** TOTP step-up MFA (ROADMAP §6, Phase 6). Students are provisioned a secret at seed time. */
import { generateSecret, generateURI, verify } from 'otplib'

export function generateMfaSecret(): string {
  return generateSecret()
}

export function mfaOtpAuthUrl(accountLabel: string, secret: string): string {
  return generateURI({ issuer: 'Zero Trust Student Portal', label: accountLabel, secret })
}

export async function verifyMfaCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code })
    return result.valid
  } catch {
    return false
  }
}
