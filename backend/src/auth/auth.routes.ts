/**
 * /api/auth — login, logout, step-up MFA, and the current-student lookup.
 *
 * bcrypt password verification + JWT issuance, with the session recorded in PostgreSQL so
 * it can be revoked server-side. Login itself is risk-scored by the same PDP the PEP uses
 * for every later request (ROADMAP §4): an unrecognized device or network on login raises
 * a STEP_UP requirement before the student can touch the portal.
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { env } from '../config/env'
import { prisma } from '../db/prisma'
import { getStudentProfile } from '../portal/portal.service'
import { stepUpValidityMs } from '../config/policy.config'
import { evaluate } from '../zerotrust/pdp'
import { buildLoginSignals } from '../zerotrust/signals'
import { recordDecision } from '../zerotrust/recordDecision'
import { computeFingerprint } from '../zerotrust/fingerprint'
import { computeCredentialHash, verifyOrAnchorIdentity } from '../zerotrust/identity'
import { mfaOtpAuthUrl, verifyMfaCode } from './mfa'
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

  // The password proved is correct; the ledger's identity anchor is a second, independent
  // gate on top of it (ROADMAP §2 step 4, §5) — instant revocation works even against a
  // still-correct password, which bcrypt alone can never provide.
  const credentialHash = computeCredentialHash(student.id, student.passwordHash)
  const identityValid = await verifyOrAnchorIdentity(student.studentId, credentialHash)
  if (!identityValid) {
    await recordDecision({
      sessionId: null,
      studentId: student.id,
      resource: '/api/auth/login',
      method: 'POST',
      riskScore: 100,
      decision: 'DENY',
      reasons: [],
      signals: {
        newDevice: false,
        newIpAddress: false,
        oddHour: false,
        staleSession: false,
        highRequestRate: false,
        sensitiveResource: false,
      },
    })
    res
      .status(403)
      .json({ error: 'identity_revoked', message: 'This identity has been revoked on the ledger.' })
    return
  }

  const expiresAt = new Date(Date.now() + env.jwtExpiresInHours * 60 * 60 * 1000)
  const ipAddress = req.ip ?? null
  const userAgent = req.get('user-agent') ?? null
  const deviceFingerprint = computeFingerprint(req)

  const [knownDevice, knownNetwork] = await Promise.all([
    prisma.device.findUnique({
      where: { studentId_fingerprint: { studentId: student.id, fingerprint: deviceFingerprint } },
    }),
    ipAddress
      ? prisma.knownNetwork.findUnique({
          where: { studentId_ipAddress: { studentId: student.id, ipAddress } },
        })
      : null,
  ])

  const loginSignals = buildLoginSignals({ isKnownDevice: !!knownDevice, isKnownNetwork: !!knownNetwork })
  const { riskScore, decision, reasons } = evaluate(loginSignals)

  if (decision === 'DENY' || decision === 'TERMINATE') {
    // Unreachable with the current login-signal weights (they cap below the DENY
    // threshold), but the engine — not an assumption baked in here — is what decides.
    res
      .status(403)
      .json({ error: 'access_denied', message: 'Login blocked by the Zero Trust policy.', riskScore, reasons })
    return
  }

  const session = await prisma.session.create({
    data: {
      studentId: student.id,
      expiresAt,
      ipAddress,
      userAgent,
      deviceFingerprint,
      mfaRequired: decision === 'STEP_UP',
      firstAnomalyAt: decision === 'STEP_UP' ? new Date() : null,
    },
  })

  await Promise.all([
    prisma.device.upsert({
      where: { studentId_fingerprint: { studentId: student.id, fingerprint: deviceFingerprint } },
      update: { lastSeenAt: new Date(), userAgent },
      create: { studentId: student.id, fingerprint: deviceFingerprint, userAgent },
    }),
    ipAddress
      ? prisma.knownNetwork.upsert({
          where: { studentId_ipAddress: { studentId: student.id, ipAddress } },
          update: { lastSeenAt: new Date() },
          create: { studentId: student.id, ipAddress },
        })
      : Promise.resolve(),
  ])

  await recordDecision({
    sessionId: session.id,
    studentId: student.id,
    resource: '/api/auth/login',
    method: 'POST',
    riskScore,
    decision,
    reasons,
    signals: loginSignals,
  })

  res.json({
    token: signToken({ sub: student.id, jti: session.id }),
    expiresAt: expiresAt.toISOString(),
    student: await getStudentProfile(student.id),
    stepUpRequired: decision === 'STEP_UP',
  })
})

authRouter.post('/logout', requireAuth, async (req, res) => {
  // Revoke the session row, so the token is dead even though it has not expired.
  await prisma.session.update({
    where: { id: req.auth!.sessionId },
    data: { revokedAt: new Date(), revokedBy: 'LOGOUT' },
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

const stepUpSchema = z.object({ code: z.string().trim().min(6).max(8) })

/**
 * Completes a STEP_UP challenge raised by the PDP (at login or on a protected route).
 * On success the session is marked verified for `stepUpValidityMs`, so the PEP downgrades
 * matching STEP_UP decisions to ALLOW until it expires.
 */
authRouter.post('/step-up', requireAuth, async (req, res) => {
  const parsed = stepUpSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', message: 'A TOTP code is required.' })
    return
  }

  const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId } })
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }

  if (!(await verifyMfaCode(student.totpSecret, parsed.data.code))) {
    res.status(401).json({ error: 'invalid_code', message: 'Incorrect or expired TOTP code.' })
    return
  }

  const mfaVerifiedAt = new Date()
  await prisma.session.update({
    where: { id: req.auth!.sessionId },
    data: { mfaVerifiedAt, mfaRequired: false },
  })

  res.json({ ok: true, validUntil: new Date(mfaVerifiedAt.getTime() + stepUpValidityMs).toISOString() })
})

/**
 * Returns this student's own TOTP secret. A prototype/demo convenience so a tester can
 * compute a code (any authenticator app, or `otplib` directly) without a separate
 * enrollment UI — real deployments would gate this behind an enrollment flow instead.
 */
authRouter.get('/mfa-secret', requireAuth, async (req, res) => {
  const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId } })
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }
  res.json({ secret: student.totpSecret, otpauthUrl: mfaOtpAuthUrl(student.studentId, student.totpSecret) })
})
