/**
 * Writes one PDP decision to the ledger (ROADMAP §2 step 4) and mirrors it off-chain —
 * the shared write path for both the PEP (real requests) and the continuous monitor
 * (background terminations with no new request).
 */
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db/prisma'
import { ledger } from '../ledger'
import type { Decision, RiskSignals } from '../types'

export interface DecisionInput {
  /** null only for events with no live session context (there are none yet, but the
   * RiskEvent.sessionId column is nullable for future use, e.g. failed-login attempts). */
  sessionId: string | null
  studentId: string
  resource: string
  method: string
  riskScore: number
  decision: Decision
  reasons: (keyof RiskSignals)[]
  signals: RiskSignals
}

export async function recordDecision(input: DecisionInput): Promise<void> {
  const event = {
    eventId: randomUUID(),
    studentId: input.studentId,
    resource: input.resource,
    decision: input.decision,
    riskScore: input.riskScore,
    timestamp: new Date().toISOString(),
  }
  const record = await ledger.logAccessEvent(event)

  await prisma.$transaction([
    prisma.riskEvent.create({
      data: {
        studentId: input.studentId,
        sessionId: input.sessionId,
        resource: input.resource,
        method: input.method,
        riskScore: input.riskScore,
        decision: input.decision,
        reasons: input.reasons,
        signals: input.signals as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.auditMirror.create({
      data: {
        eventId: record.eventId,
        studentId: record.studentId,
        resource: record.resource,
        decision: record.decision,
        riskScore: record.riskScore,
        timestamp: new Date(record.timestamp),
        hash: record.hash,
        prevHash: record.prevHash,
      },
    }),
  ])

  // First non-ALLOW decision of the session — the anomaly-detection-time metric (§7c)
  // measures from here to whenever the session is eventually terminated.
  if (input.sessionId && input.decision !== 'ALLOW') {
    await prisma.session.updateMany({
      where: { id: input.sessionId, firstAnomalyAt: null },
      data: { firstAnomalyAt: new Date() },
    })
  }
}
