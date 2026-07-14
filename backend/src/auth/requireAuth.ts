/**
 * Authentication gate for protected routes.
 *
 * Validates the bearer token AND re-checks the session against PostgreSQL on every single
 * request — a valid signature alone is never enough (ROADMAP §4.3, continuous verification).
 *
 * Also carries a snapshot of the session's login-time baseline (IP, device fingerprint,
 * MFA state) on `req.auth.session` — the Zero Trust PEP (mounted after this on portal
 * routes) uses it to score the request without a second database round trip.
 */
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db/prisma'
import { verifyToken } from './jwt'

export interface SessionBaseline {
  issuedAt: Date
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  deviceFingerprint: string | null
  mfaVerifiedAt: Date | null
  /** An unresolved STEP_UP is outstanding for this session (set at login or by the PEP). */
  mfaRequired: boolean
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { studentId: string; sessionId: string; session: SessionBaseline }
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'unauthenticated', message: 'Missing bearer token.' })
    return
  }

  const claims = verifyToken(token)
  if (!claims) {
    res.status(401).json({ error: 'unauthenticated', message: 'Invalid or expired token.' })
    return
  }

  // The token says who you are; the database says whether you still may.
  const session = await prisma.session.findUnique({ where: { id: claims.jti } })
  if (!session) {
    res.status(401).json({ error: 'session_ended', message: 'Session revoked or expired.' })
    return
  }

  const now = new Date()
  if (!session.revokedAt && session.expiresAt < now) {
    // Lazily label natural expiry so it's distinguishable from logout/termination in the
    // audit trail — nothing reads `expiresAt` after the fact to infer this otherwise.
    await prisma.session
      .update({ where: { id: session.id }, data: { revokedAt: now, revokedBy: 'EXPIRED' } })
      .catch(() => undefined)
  }

  if (session.revokedAt || session.expiresAt < now) {
    res.status(401).json({ error: 'session_ended', message: 'Session revoked or expired.' })
    return
  }

  req.auth = {
    studentId: claims.sub,
    sessionId: session.id,
    session: {
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceFingerprint: session.deviceFingerprint,
      mfaVerifiedAt: session.mfaVerifiedAt,
      mfaRequired: session.mfaRequired,
    },
  }
  next()
}
