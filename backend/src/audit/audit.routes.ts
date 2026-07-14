/**
 * Admin / research routes (ROADMAP Phase 6: "Audit integrity verifier endpoint";
 * Phase 7 frontend: "Admin/Research view: audit-trail viewer, Verify Integrity button,
 * live metrics").
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
import type { Decision } from '../types'
import { prisma } from '../db/prisma'
import { ledger } from '../ledger'
import { hashEvent } from '../ledger/hashEvent'
import { requireAuth } from '../auth/requireAuth'
import { asyncHandler } from '../utils/asyncHandler'

export const auditRouter = Router()

auditRouter.use(requireAuth)

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
      notYetAvailable: [
        'Access-control effectiveness (TAR/FAR/FRR) and Attack Resistance (ROADMAP §7a/b) ' +
          'require labelled attack-vs-legitimate traffic from the Phase 8 scripted scenarios.',
        'Composite Effectiveness Score (CES) depends on the above, plus Authentication ' +
          'Performance, which ROADMAP §7 leaves undefined pending client confirmation.',
      ],
    })
  }),
)
