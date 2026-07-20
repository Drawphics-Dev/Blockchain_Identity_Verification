/**
 * Admin / research routes (ROADMAP Phase 6: "Audit integrity verifier endpoint";
 * Phase 7 frontend: "Admin/Research view: audit-trail viewer, Verify Integrity button,
 * live metrics").
 *
 * ADMIN-ONLY — every route here is behind requireAuth + requireAdmin (Student.role = ADMIN).
 *
 * GET /audit — the immutable on-chain audit trail (optionally scoped to one student by
 * matriculation number), newest first, enriched with the student's name for display.
 * GET /audit/verify/:eventId — the tamper check described in ROADMAP §5: recompute the
 * hash the CURRENT off-chain (PostgreSQL) mirror row would produce, and compare it to the
 * immutable on-chain record. If the Phase 8 tampering scenario edited the mirror's data in
 * place, the recomputed hash no longer matches and this reports invalid.
 * GET /metrics — live, honestly-scoped numbers computed from real traffic. Deliberately
 * does NOT compute TAR/FAR/FRR or Attack Resistance (ROADMAP §7a/b): those require labelled
 * attack-vs-legitimate traffic from the Phase 8 attack-simulation scenarios, which haven't
 * been run yet — faking a confusion matrix from unlabelled live traffic would be dishonest.
 * Continuous-validation metrics (§7c) ARE computed for real: every input (firstAnomalyAt,
 * revokedAt, revokedBy) already exists from real engine activity.
 */
import { Router } from 'express'
import { z } from 'zod'
import type { Decision } from '../types'
import { prisma } from '../db/prisma'
import { ledger } from '../ledger'
import { hashEvent } from '../ledger/hashEvent'
import { requireAdmin } from '../auth/requireAdmin'
import { requireAuth } from '../auth/requireAuth'
import { computeCredentialHash } from '../zerotrust/identity'
import { recordDecision } from '../zerotrust/recordDecision'
import { asyncHandler } from '../utils/asyncHandler'
import { logger } from '../utils/logger'

export const auditRouter = Router()

// Order matters: authenticate, then authorize. Every route below is admin-only — the trail
// names every student and every decision made about them.
auditRouter.use(requireAuth)
auditRouter.use(requireAdmin)

/** Cap the trail response — the mock ledger has no server-side pagination. */
const TRAIL_LIMIT = 200

auditRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const studentIdParam = typeof req.query.studentId === 'string' ? req.query.studentId.trim() : undefined

    let internalStudentId: string | undefined
    if (studentIdParam) {
      const student = await prisma.student.findUnique({
        where: { studentId: studentIdParam.toUpperCase() },
        select: { id: true },
      })
      if (!student) {
        res.json({ trail: [] })
        return
      }
      internalStudentId = student.id
    }

    const trail = await ledger.getAuditTrail(internalStudentId)
    const recent = trail.slice(-TRAIL_LIMIT).reverse() // newest first, capped

    const distinctIds = [...new Set(recent.map((r) => r.studentId))]
    const students = await prisma.student.findMany({
      where: { id: { in: distinctIds } },
      select: { id: true, studentId: true, fullName: true },
    })
    const byId = new Map(students.map((s) => [s.id, s]))

    res.json({
      trail: recent.map((r) => ({ ...r, student: byId.get(r.studentId) ?? null })),
      truncated: trail.length > TRAIL_LIMIT,
      totalEvents: trail.length,
    })
  }),
)

auditRouter.get(
  '/audit/verify/:eventId',
  asyncHandler(async (req, res) => {
    const { eventId } = req.params

    const [onChain, mirror] = await Promise.all([
      ledger.getAuditEvent(eventId),
      prisma.auditMirror.findUnique({ where: { eventId } }),
    ])

    if (!onChain || !mirror) {
      res.status(404).json({ error: 'not_found', message: 'No audit event with that id.' })
      return
    }

    // What the mirror's CURRENT fields would hash to — not the mirror's own stored `hash`
    // column, which a tampering attack could leave untouched while editing riskScore/
    // decision/etc. Recomputing from the live data is what actually catches that.
    const recomputedFromMirror = hashEvent(
      {
        eventId: mirror.eventId,
        studentId: mirror.studentId,
        resource: mirror.resource,
        decision: mirror.decision as Decision,
        riskScore: mirror.riskScore,
        timestamp: mirror.timestamp.toISOString(),
      },
      mirror.prevHash,
    )

    const valid = await ledger.verifyEventIntegrity(eventId, recomputedFromMirror)

    res.json({
      eventId,
      valid,
      expectedHash: onChain.hash,
      actualHash: recomputedFromMirror,
    })
  }),
)

/**
 * Identity-anchor check for one student — the identity counterpart of the audit verifier above,
 * and the production call site of `LedgerService.verifyIdentity` (ROADMAP Phase 2).
 *
 * The distinction from login's check is the point. Login uses `getIdentity` and compares the hash
 * in application code, because it must tell `revoked` apart from `credential_mismatch` — one is an
 * administrative act, the other is a tampering indicator, and a bare boolean cannot carry that.
 * Here the comparison is performed by `verifyIdentity` INSIDE THE CHAINCODE instead: the hash is
 * submitted to the peers and the verdict comes back from the endorsed, deterministic contract
 * environment rather than from this process.
 *
 * That is a genuinely stronger statement for an audit, which is why the research view wants it.
 * Login's answer is "this server compared two values and they matched". This endpoint's answer is
 * "the blockchain itself confirms this credential matches its anchor" — no application code is
 * trusted to do the comparison. Both are reported here, so a disagreement between them (which
 * would mean the application's view of the ledger had diverged) is visible rather than silent.
 */
auditRouter.get(
  '/identity/:studentId/verify',
  asyncHandler(async (req, res) => {
    const matric = req.params.studentId.toUpperCase()

    const student = await prisma.student.findUnique({ where: { studentId: matric } })
    if (!student) {
      res.status(404).json({ error: 'not_found', message: 'No student with that matriculation number.' })
      return
    }

    const anchor = await ledger.getIdentity(matric)
    if (!anchor) {
      res.status(409).json({
        error: 'not_anchored',
        message: 'This student has no on-chain identity anchor yet — they have never logged in.',
      })
      return
    }

    // Recomputed from what PostgreSQL holds RIGHT NOW, exactly as login does. If the stored
    // password hash has been altered, this no longer matches what was anchored.
    const credentialHash = computeCredentialHash(student.id, student.passwordHash)

    // The on-chain verdict: the chaincode compares, not this process.
    const validOnChain = await ledger.verifyIdentity(matric, credentialHash)
    // The application's own view, for comparison.
    const matchesLocally = anchor.credentialHash === credentialHash && !anchor.revoked

    res.json({
      studentId: matric,
      validOnChain,
      revoked: anchor.revoked,
      /** false with revoked=false means the stored credential no longer matches the anchor —
       * i.e. the off-chain password hash was tampered with (ROADMAP §1 data adulteration). */
      credentialMatches: anchor.credentialHash === credentialHash,
      anchoredAt: anchor.registeredAt,
      /** Should always be true. False means this server and the ledger disagree — investigate. */
      agreesWithLocalCheck: validOnChain === matchesLocally,
    })
  }),
)

/**
 * Revoke a student's on-chain identity anchor — the administrative half of ROADMAP §4.2's
 * "Zero Trust instant revocation", and the only production call site of
 * `LedgerService.revokeIdentity` (IdentityContract, Phase 5).
 *
 * Two things happen, in this order:
 *   1. the anchor is revoked ON-CHAIN, so every future login is refused at the identity gate
 *      even with a correct password — no application-layer flag could give that guarantee,
 *      because the ledger is the one store an attacker with database access cannot rewrite;
 *   2. every live session is revoked off-chain, so the block takes effect immediately rather
 *      than at the next login.
 *
 * DELIBERATELY NOT AUTOMATIC. It is tempting to fire this from the PEP's TERMINATE branch,
 * since §4.2 pairs termination with revocation — but the two are different lifetimes.
 * TERMINATE ends a *session*; this ends an *identity*, permanently: IdentityContract has no
 * un-revoke transaction, and `registerIdentity` preserves the revoked flag precisely so a
 * re-registration cannot quietly undo one. Wiring it to a risk threshold would let a
 * false-positive score lock a student out of their degree records with no way back. It is
 * therefore an explicit act by a named administrator, recorded on-chain as such.
 */
const revokeSchema = z.object({ reason: z.string().trim().min(1).max(200) })

auditRouter.post(
  '/identity/:studentId/revoke',
  asyncHandler(async (req, res) => {
    const parsed = revokeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'A reason is required — revocation is permanent and must be justified in the trail.',
      })
      return
    }

    const matric = req.params.studentId.toUpperCase()
    const student = await prisma.student.findUnique({ where: { studentId: matric } })
    if (!student) {
      res.status(404).json({ error: 'not_found', message: 'No student with that matriculation number.' })
      return
    }

    const anchor = await ledger.getIdentity(matric)
    if (!anchor) {
      res.status(409).json({
        error: 'not_anchored',
        message: 'This student has no on-chain identity anchor yet — they have never logged in.',
      })
      return
    }
    if (anchor.revoked) {
      res.status(409).json({ error: 'already_revoked', message: 'This identity is already revoked.' })
      return
    }

    await ledger.revokeIdentity(matric)

    // Now that the anchor is down, close the door on anything already inside.
    const killed = await prisma.session.updateMany({
      where: { studentId: student.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'TERMINATED' },
    })

    // Record the administrative act itself in the immutable trail, against the revoked
    // student — so the trail answers "why did this account stop working?" without a side channel.
    await recordDecision({
      sessionId: null,
      studentId: student.id,
      resource: '/api/admin/identity/revoke',
      method: 'POST',
      riskScore: 100,
      decision: 'TERMINATE',
      reasons: [],
      signals: {
        newDevice: false,
        newIpAddress: false,
        impossibleTravel: false,
        oddHour: false,
        staleSession: false,
        highRequestRate: false,
        abnormalNavigation: false,
        sensitiveResource: false,
      },
    })

    logger.warn('Identity revoked on-chain', {
      studentId: matric,
      by: req.auth!.studentId,
      reason: parsed.data.reason,
      sessionsRevoked: killed.count,
    })

    res.json({
      studentId: matric,
      revoked: true,
      sessionsRevoked: killed.count,
      reason: parsed.data.reason,
    })
  }),
)

auditRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    const [decisionGroups, totalEvents, avgRisk, totalSessions, activeSessions, anomalySessions] =
      await Promise.all([
        prisma.riskEvent.groupBy({ by: ['decision'], _count: { _all: true } }),
        prisma.riskEvent.count(),
        prisma.riskEvent.aggregate({ _avg: { riskScore: true } }),
        prisma.session.count(),
        prisma.session.count({ where: { revokedAt: null } }),
        prisma.session.findMany({
          where: { firstAnomalyAt: { not: null } },
          select: { firstAnomalyAt: true, revokedAt: true, revokedBy: true },
        }),
      ])

    const decisions: Record<Decision, number> = { ALLOW: 0, STEP_UP: 0, DENY: 0, TERMINATE: 0 }
    for (const g of decisionGroups) {
      if (g.decision in decisions) decisions[g.decision as Decision] = g._count._all
    }

    // ROADMAP §7c, computed directly from real Session rows — no simulation needed.
    const sessionsWithAnomaly = anomalySessions.length
    const terminatedAfterAnomaly = anomalySessions.filter((s) => s.revokedBy === 'TERMINATED').length
    const detectionSeconds = anomalySessions
      .filter((s): s is typeof s & { revokedAt: Date } => s.revokedBy === 'TERMINATED' && s.revokedAt !== null)
      .map((s) => (s.revokedAt.getTime() - s.firstAnomalyAt!.getTime()) / 1000)
    const meanAnomalyDetectionSeconds =
      detectionSeconds.length > 0
        ? Number((detectionSeconds.reduce((a, b) => a + b, 0) / detectionSeconds.length).toFixed(2))
        : null
    const sessionTerminationRate =
      sessionsWithAnomaly > 0 ? Number(((terminatedAfterAnomaly / sessionsWithAnomaly) * 100).toFixed(1)) : null

    res.json({
      decisions,
      totalEvents,
      averageRiskScore: avgRisk._avg.riskScore ? Number(avgRisk._avg.riskScore.toFixed(1)) : 0,
      sessions: { total: totalSessions, active: activeSessions },
      continuousValidation: {
        sessionsWithAnomaly,
        terminatedAfterAnomaly,
        sessionTerminationRate,
        meanAnomalyDetectionSeconds,
      },
      // Kept as an empty list rather than dropped from the response: the field is part of the
      // contract the frontend types against, and the reasoning it used to carry still holds —
      // TAR/FAR/FRR, attack resistance and CES need labelled attack-vs-legitimate traffic,
      // which live sessions cannot supply. They are computed by the Phase 8 simulation and
      // reported by `npm run evaluate`, deliberately NOT faked from unlabelled live traffic
      // (that would assume the engine is always right, and print a perfect score for a broken
      // one). This endpoint still refuses to compute them; it just no longer says so on screen.
      notYetAvailable: [] as string[],
    })
  }),
)
