/**
 * Authentication gate for protected routes.
 *
 * Validates the bearer token AND re-checks the session against PostgreSQL on every single
 * request — a valid signature alone is never enough (ROADMAP §4.3, continuous verification).
 *
 * This is the foundation the Zero Trust PEP (Phase 6) will build on: once the PDP exists,
 * the risk score and the ALLOW/STEP_UP/DENY/TERMINATE decision slot in right here.
 */
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db/prisma'
import { verifyToken } from './jwt'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { studentId: string; sessionId: string }
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
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    res.status(401).json({ error: 'session_ended', message: 'Session revoked or expired.' })
    return
  }

  req.auth = { studentId: claims.sub, sessionId: session.id }
  next()
}
