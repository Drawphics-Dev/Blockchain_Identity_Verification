/**
 * /api/auth — login, logout, and the current-student lookup.
 *
 * bcrypt password verification + JWT issuance, with the session recorded in PostgreSQL so
 * it can be revoked server-side. TOTP step-up MFA arrives with the Zero Trust engine
 * (Phase 6), which is what will decide *when* to demand it.
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { env } from '../config/env'
import { prisma } from '../db/prisma'
import { getStudentProfile } from '../portal/portal.service'
import { signToken } from './jwt'
import { requireAuth } from './requireAuth'

export const authRouter = Router()

const loginSchema = z.object({
  studentId: z.string().trim().min(1),
  password: z.string().min(1),
})

/**
 * A bcrypt hash of a value nobody will guess. When the student ID is unknown we still run a
 * comparison against this, so a bad ID and a bad password take the same time — otherwise
 * response latency would tell an attacker which student IDs exist.
 */
const DUMMY_HASH = bcrypt.hashSync('unmatchable-placeholder', 10)

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'invalid_request', message: 'Student ID and password are required.' })
    return
  }

  const { studentId, password } = parsed.data
  const student = await prisma.student.findUnique({ where: { studentId: studentId.toUpperCase() } })

  const passwordMatches = await bcrypt.compare(password, student?.passwordHash ?? DUMMY_HASH)

  // One message for both failure modes — never reveal whether the ID exists.
  if (!student || !passwordMatches) {
    res
      .status(401)
      .json({ error: 'invalid_credentials', message: 'Invalid student ID or password.' })
    return
  }

  const expiresAt = new Date(Date.now() + env.jwtExpiresInHours * 60 * 60 * 1000)
  const session = await prisma.session.create({
    data: {
      studentId: student.id,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    },
  })

  res.json({
    token: signToken({ sub: student.id, jti: session.id }),
    expiresAt: expiresAt.toISOString(),
    student: await getStudentProfile(student.id),
  })
})

authRouter.post('/logout', requireAuth, async (req, res) => {
  // Revoke the session row, so the token is dead even though it has not expired.
  await prisma.session.update({
    where: { id: req.auth!.sessionId },
    data: { revokedAt: new Date() },
  })
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const student = await getStudentProfile(req.auth!.studentId)
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }
  res.json({ student })
})
