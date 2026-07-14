/**
 * Policy Enforcement Point (ROADMAP §4.3).
 *
 * Mounted after `requireAuth` on every protected portal route: extracts live signals,
 * scores them via the PDP, writes the decision to the ledger, then enforces it.
 * ALLOW passes through; STEP_UP blocks unless a recent MFA verification covers it;
 * DENY blocks the request; TERMINATE revokes the session outright.
 */
import type { NextFunction, Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma'
import { stepUpValidityMs } from '../config/policy.config'
import { buildRequestSignals } from './signals'
import { evaluate, moreSevere } from './pdp'
import { recordDecision } from './recordDecision'

export async function pep(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.auth
  if (!auth) {
    // pep must only ever be mounted after requireAuth.
    res.status(401).json({ error: 'unauthenticated', message: 'Missing session context.' })
    return
  }

  const resource = req.originalUrl.split('?')[0]
  const signals = buildRequestSignals(req, { sessionId: auth.sessionId, ...auth.session })
  const { riskScore, decision, reasons } = evaluate(signals)

  const now = new Date()
  const stepUpSatisfied =
    !!auth.session.mfaVerifiedAt && now.getTime() - auth.session.mfaVerifiedAt.getTime() < stepUpValidityMs

  // This request's own live risk, downgraded if a fresh MFA verification already covers a
  // STEP_UP it raised — combined with any STEP_UP still outstanding from earlier in the
  // session (e.g. an unrecognized device at login) that this request's signals alone
  // wouldn't re-detect, since they're compared against the session's own baseline.
  const requestDecision = decision === 'STEP_UP' && stepUpSatisfied ? 'ALLOW' : decision
  const pendingFromSession = auth.session.mfaRequired && !stepUpSatisfied ? 'STEP_UP' : 'ALLOW'
  const effectiveDecision = moreSevere(requestDecision, pendingFromSession)

  await recordDecision({
    sessionId: auth.sessionId,
    studentId: auth.studentId,
    resource,
    method: req.method,
    riskScore,
    decision: effectiveDecision,
    reasons,
    signals,
  })

  const sessionUpdate: Prisma.SessionUpdateInput = { lastSeenAt: now }
  if (effectiveDecision === 'STEP_UP') sessionUpdate.mfaRequired = true
  if (effectiveDecision === 'TERMINATE') {
    sessionUpdate.revokedAt = now
    sessionUpdate.revokedBy = 'TERMINATED'
  }
  await prisma.session.update({ where: { id: auth.sessionId }, data: sessionUpdate })

  switch (effectiveDecision) {
    case 'ALLOW':
      next()
      return
    case 'STEP_UP':
      res.status(403).json({
        error: 'step_up_required',
        message: 'Re-verify your identity (TOTP) to continue.',
        riskScore,
        reasons,
      })
      return
    case 'DENY':
      res.status(403).json({
        error: 'access_denied',
        message: 'This request was blocked by the Zero Trust policy.',
        riskScore,
        reasons,
      })
      return
    case 'TERMINATE':
      res.status(401).json({
        error: 'session_terminated',
        message: 'Session terminated by the Zero Trust engine.',
        riskScore,
        reasons,
      })
      return
  }
}
