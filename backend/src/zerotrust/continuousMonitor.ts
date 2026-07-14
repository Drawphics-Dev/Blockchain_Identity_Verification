/**
 * Background behaviour monitor (ROADMAP §4.3): periodically re-scores every active
 * session's recent risk history and can terminate one mid-way with no new request from
 * the user — the "no new user action" half of continuous verification that the PEP alone
 * cannot provide (the PEP only ever runs when a request arrives).
 */
import { prisma } from '../db/prisma'
import { logger } from '../utils/logger'
import {
  continuousMonitorIntervalMs,
  rollingRiskEventThreshold,
  rollingRiskScoreThreshold,
  rollingRiskWindowMs,
  thresholds,
} from '../config/policy.config'
import type { RiskSignals } from '../types'
import { clearActivity } from './sessionActivity'
import { recordDecision } from './recordDecision'

let timer: ReturnType<typeof setInterval> | null = null

async function tick(): Promise<void> {
  const cutoff = new Date(Date.now() - rollingRiskWindowMs)
  const sessions = await prisma.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: {
      riskEvents: { where: { createdAt: { gte: cutoff } }, orderBy: { createdAt: 'desc' } },
    },
  })

  for (const session of sessions) {
    const events = session.riskEvents
    if (events.length === 0) continue

    // "STEP_UP-or-worse" per policy.config.ts's rollingRiskEventThreshold — allowBelow is
    // the STEP_UP tier's own lower bound, not stepUpBelow (which would only count
    // DENY-or-worse and defeat the point of catching an accumulating pattern early).
    const highRiskCount = events.filter((e) => e.riskScore >= thresholds.allowBelow).length
    const rollingScore = Math.round(events.reduce((sum, e) => sum + e.riskScore, 0) / events.length)

    const shouldTerminate =
      highRiskCount >= rollingRiskEventThreshold || rollingScore >= rollingRiskScoreThreshold
    if (!shouldTerminate) continue

    const now = new Date()
    await prisma.session.update({
      where: { id: session.id },
      data: {
        revokedAt: now,
        revokedBy: 'TERMINATED',
        firstAnomalyAt: session.firstAnomalyAt ?? events[events.length - 1].createdAt,
      },
    })

    // Aggregate which signals actually contributed, from the real events in the window —
    // not fabricated, so the audit trail stays honest about what triggered this.
    const reasons = Array.from(new Set(events.flatMap((e) => e.reasons))) as (keyof RiskSignals)[]
    const signals: RiskSignals = {
      newDevice: reasons.includes('newDevice'),
      newIpAddress: reasons.includes('newIpAddress'),
      oddHour: reasons.includes('oddHour'),
      staleSession: reasons.includes('staleSession'),
      highRequestRate: reasons.includes('highRequestRate'),
      sensitiveResource: reasons.includes('sensitiveResource'),
    }

    await recordDecision({
      sessionId: session.id,
      studentId: session.studentId,
      resource: 'continuous-monitor',
      method: 'SYSTEM',
      riskScore: rollingScore,
      decision: 'TERMINATE',
      reasons,
      signals,
    })

    clearActivity(session.id)
    logger.warn('Continuous monitor terminated session', {
      sessionId: session.id,
      studentId: session.studentId,
      rollingScore,
      highRiskCount,
    })
  }
}

export function startContinuousMonitor(): void {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((err: Error) => logger.error('Continuous monitor tick failed', { message: err.message }))
  }, continuousMonitorIntervalMs)
  timer.unref?.()
}

export function stopContinuousMonitor(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
