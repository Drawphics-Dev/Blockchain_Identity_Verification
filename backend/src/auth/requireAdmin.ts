/**
 * Authorization gate for the Admin / Research routes.
 *
 * Mounted after requireAuth: that one proves *who* you are, this one decides *whether you may*.
 * The audit trail names every student and every decision made about them, so it is the one
 * resource in the prototype a student must not be able to read about anyone else.
 *
 * The role is read from PostgreSQL on every request rather than carried in the JWT. A token
 * lives for 8 hours; a revoked admin must lose access now, not when their token expires. That
 * is the same reasoning requireAuth applies to sessions (ROADMAP §4.3) — never trust a claim
 * the token made about the past.
 */
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db/prisma'

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: req.auth!.studentId },
    select: { role: true },
  })

  if (student?.role !== 'ADMIN') {
    // 403, not 404: the caller is authenticated and the route exists — they simply may not.
    res.status(403).json({
      error: 'forbidden',
      message: 'Administrator access is required to read the audit trail.',
    })
    return
  }

  next()
}
