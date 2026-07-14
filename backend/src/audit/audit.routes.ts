/**
 * Admin / research routes (ROADMAP Phase 6: "Audit integrity verifier endpoint";
 * Phase 7 frontend: "Admin/Research view: audit-trail viewer, Verify Integrity button").
 *
 * GET /audit — the immutable on-chain audit trail (optionally scoped to one student).
 * GET /audit/verify/:eventId — the tamper check described in ROADMAP §5: recompute the
 * hash the CURRENT off-chain (PostgreSQL) mirror row would produce, and compare it to the
 * immutable on-chain record. If the Phase 8 tampering scenario edited the mirror's data in
 * place, the recomputed hash no longer matches and this reports invalid.
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

auditRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const trail = await ledger.getAuditTrail(studentId)
    res.json({ trail })
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
