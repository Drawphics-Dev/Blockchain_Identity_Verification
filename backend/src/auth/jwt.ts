/**
 * JWT issuing and verification.
 *
 * The token's `jti` is the Session row's id. A token is therefore never sufficient on its
 * own — `requireAuth` also checks the session is still live in PostgreSQL, so logout (and,
 * later, a TERMINATE_SESSION decision from the Zero Trust engine) revokes access instantly.
 */
import jwt from 'jsonwebtoken'
import { env } from '../config/env'

export interface TokenClaims {
  /** Student.id (the internal cuid, not the matriculation number). */
  sub: string
  /** Session.id — the revocation handle. */
  jti: string
}

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: `${env.jwtExpiresInHours}h` })
}

/** Returns the claims, or null if the token is missing, malformed, expired or unsigned by us. */
export function verifyToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret)
    if (typeof decoded === 'string' || !decoded.sub || !decoded.jti) return null
    return { sub: decoded.sub as string, jti: decoded.jti as string }
  } catch {
    return null
  }
}
