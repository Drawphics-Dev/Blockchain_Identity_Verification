/**
 * /api/auth — login, logout, step-up MFA, and the current-student lookup.
 *
 * bcrypt password verification + JWT issuance, with the session recorded in PostgreSQL so
 * it can be revoked server-side. Login itself is risk-scored by the same PDP the PEP uses
 * for every later request (ROADMAP §4): an unrecognized device or network on login raises
 * a STEP_UP requirement before the student can touch the portal.
 */
import { Router, type Request } from 'express'
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
import { computeCredentialHash, verifyIdentityAnchor } from '../zerotrust/identity'
import { logger } from '../utils/logger'
import { mfaOtpAuthUrl, mfaQrDataUrl, verifyMfaCode } from './mfa'
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

/**
 * Marks a device/network as recognized for this student — but ONLY once it's actually
 * been verified, not merely attempted. This must never run before a STEP_UP challenge is
 * satisfied: doing so at password-verification time (before MFA) would let anyone who
 * knows the password alone "whitelist" a new device just by attempting login and walking
 * away — the very next login from that device/network would then skip step-up entirely,
 * silently defeating the whole point of requiring it.
 */
async function registerKnownContext(
  studentId: string,
  fingerprint: string | null,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  await Promise.all([
    fingerprint
      ? prisma.device.upsert({
          where: { studentId_fingerprint: { studentId, fingerprint } },
          update: { lastSeenAt: new Date(), userAgent },
          create: { studentId, fingerprint, userAgent },
        })
      : Promise.resolve(),
    ipAddress
      ? prisma.knownNetwork.upsert({
          where: { studentId_ipAddress: { studentId, ipAddress } },
          update: { lastSeenAt: new Date() },
          create: { studentId, ipAddress },
        })
      : Promise.resolve(),
  ])
}

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

  // The password is proved correct; the ledger's identity anchor is a second, independent
  // gate on top of it (ROADMAP §2 step 4, §5). It catches two things bcrypt alone cannot:
  // an identity revoked on-chain (instant revocation, even against a still-correct
  // password), and a password hash that has been tampered with in PostgreSQL so that it no
  // longer matches what was anchored.
  const credentialHash = computeCredentialHash(student.id, student.passwordHash)
  const verdict = await verifyIdentityAnchor(student.studentId, credentialHash)

  if (!verdict.ok) {
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

    // Deliberately distinct: "revoked" is an administrative act, "credential_mismatch" means
    // the stored hash and the on-chain anchor disagree — a tampering indicator, not a
    // revocation. Reporting both as "revoked" hides a security-relevant difference.
    const [error, message] =
      verdict.reason === 'revoked'
        ? ['identity_revoked', 'This identity has been revoked on the ledger.']
        : [
            'identity_mismatch',
            'Stored credentials do not match the on-chain identity anchor. Possible tampering — contact IT.',
          ]
    logger.warn('Identity anchor check failed', { studentId: student.studentId, reason: verdict.reason })
    res.status(403).json({ error, message })
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

  // Only whitelist this device/network immediately when login didn't need step-up — if it
  // did, registration is deferred to a successful POST /api/auth/step-up (see the comment
  // on registerKnownContext above for why this ordering matters).
  if (decision === 'ALLOW') {
    await registerKnownContext(student.id, deviceFingerprint, ipAddress, userAgent)
  }

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
    /** False => the client must run enrollment (QR) rather than ask for a code. */
    mfaEnrolled: student.mfaEnrolledAt !== null,
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

const codeSchema = z.object({ code: z.string().trim().min(6).max(8) })

/**
 * Marks the current session as having satisfied its step-up, and — only now that MFA is
 * actually proven, rather than merely a correct password — lets this device/network earn
 * "known" status. Doing that at password-verification time instead would let anyone holding
 * the password whitelist their machine just by attempting a login and walking away.
 */
async function completeStepUp(req: Request): Promise<Date> {
  const mfaVerifiedAt = new Date()
  await prisma.session.update({
    where: { id: req.auth!.sessionId },
    data: { mfaVerifiedAt, mfaRequired: false },
  })
  await registerKnownContext(
    req.auth!.studentId,
    req.auth!.session.deviceFingerprint,
    req.auth!.session.ipAddress,
    req.auth!.session.userAgent,
  )
  return mfaVerifiedAt
}

/**
 * The one-time enrollment reveal: the QR (and the key, for manual entry) needed to bind this
 * account to an authenticator app.
 *
 * Guarded by TWO independent conditions, and both are load-bearing:
 *
 *   1. The account must not already be enrolled. Otherwise an endpoint that keeps handing the
 *      shared secret to anyone with a valid session lets a password thief mint their own codes.
 *   2. The caller must present the registrar's one-time enrollment token, delivered out of
 *      band. Without this, whoever logs in FIRST binds the second factor — so a thief holding
 *      a stolen password could enroll their own authenticator on any account the real student
 *      had not got around to setting up, and MFA would stop nothing. A correct password is
 *      explicitly NOT sufficient to enroll; that is the point.
 */
authRouter.get('/mfa/enroll', requireAuth, async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim().toUpperCase() : ''

  const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId } })
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }
  if (student.mfaEnrolledAt) {
    res.status(409).json({
      error: 'already_enrolled',
      message: 'This account already has an authenticator. Enter a code from it to continue.',
    })
    return
  }
  if (!student.enrollmentToken || token !== student.enrollmentToken) {
    res.status(403).json({
      error: 'invalid_enrollment_token',
      message: 'That enrollment token is not valid. Use the one issued with your account.',
    })
    return
  }

  res.json({
    secret: student.totpSecret, // shown once, for manual entry when a camera isn't available
    otpauthUrl: mfaOtpAuthUrl(student.studentId, student.totpSecret),
    qrDataUrl: await mfaQrDataUrl(student.studentId, student.totpSecret),
  })
})

const enrollSchema = codeSchema.extend({ token: z.string().trim().min(1) })

/**
 * Completes enrollment: the student proves both that they hold the registrar's token AND that
 * they can generate a code from the secret they just scanned. The token is re-checked here
 * rather than trusted from the reveal step, so possession is proven at the moment it counts.
 *
 * It doubles as the step-up answer, so a first-time student enters one code, not two — and the
 * token is consumed, making it good for exactly one enrollment.
 */
authRouter.post('/mfa/enroll', requireAuth, async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'An enrollment token and a code from your authenticator are both required.',
    })
    return
  }

  const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId } })
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }
  if (student.mfaEnrolledAt) {
    res.status(409).json({ error: 'already_enrolled', message: 'This account is already enrolled.' })
    return
  }
  if (!student.enrollmentToken || parsed.data.token.trim().toUpperCase() !== student.enrollmentToken) {
    res.status(403).json({
      error: 'invalid_enrollment_token',
      message: 'That enrollment token is not valid.',
    })
    return
  }

  if (!(await verifyMfaCode(student.totpSecret, parsed.data.code))) {
    res.status(400).json({
      error: 'invalid_code',
      message: "That code didn't match. Check your authenticator and try again.",
    })
    return
  }

  await prisma.student.update({
    where: { id: student.id },
    // Burn the token in the same write that records the enrollment — one token, one authenticator.
    data: { mfaEnrolledAt: new Date(), enrollmentToken: null },
  })
  const mfaVerifiedAt = await completeStepUp(req)

  res.json({ ok: true, validUntil: new Date(mfaVerifiedAt.getTime() + stepUpValidityMs).toISOString() })
})

/**
 * Completes a STEP_UP challenge raised by the PDP (at login, or on a protected route).
 * On success the session is verified for `stepUpValidityMs`, so the PEP downgrades matching
 * STEP_UP decisions to ALLOW until that lapses.
 */
authRouter.post('/step-up', requireAuth, async (req, res) => {
  const parsed = codeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request', message: 'A TOTP code is required.' })
    return
  }

  const student = await prisma.student.findUnique({ where: { id: req.auth!.studentId } })
  if (!student) {
    res.status(404).json({ error: 'not_found', message: 'Student no longer exists.' })
    return
  }

  // No authenticator bound yet — there is nothing to check a code against. Send the client to
  // enrollment rather than rejecting a code the student has no way to produce.
  if (!student.mfaEnrolledAt) {
    res.status(409).json({
      error: 'mfa_not_enrolled',
      message: 'Set up your authenticator app first.',
    })
    return
  }

  if (!(await verifyMfaCode(student.totpSecret, parsed.data.code))) {
    // 400, not 401: requireAuth already accepted the bearer token, so the session is fine —
    // only the submitted code was wrong. A 401 would make the API client treat the session as
    // dead and discard the token, turning a retryable typo into a forced re-login.
    res.status(400).json({ error: 'invalid_code', message: 'Incorrect or expired TOTP code.' })
    return
  }

  const mfaVerifiedAt = await completeStepUp(req)
  res.json({ ok: true, validUntil: new Date(mfaVerifiedAt.getTime() + stepUpValidityMs).toISOString() })
})
