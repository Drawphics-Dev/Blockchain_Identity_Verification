/**
 * The mirror of requireAdmin: keeps staff out of the student portal.
 *
 * Staff accounts have no enrollments, fees or results, so these routes would return empty
 * shells and — worse — POST /enrollments would happily register a security administrator for
 * a course. The two roles are disjoint here: students hold academic records, staff read the
 * audit trail. Neither is a superset of the other, so ADMIN is deliberately NOT a super-user.
 */
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../db/prisma'

export async function requireStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: req.auth!.studentId },
    select: { role: true },
  })

  if (student?.role !== 'STUDENT') {
    res.status(403).json({
      error: 'forbidden',
      message: 'This is a student portal route; staff accounts hold no academic record.',
    })
    return
  }

  next()
}
