/**
 * Builds the RiskSignals the PDP scores, from two different contexts:
 *
 *   - buildLoginSignals  — "has this student ever used this device/network before?"
 *     (checked against the Device/KnownNetwork tables, which persist across sessions).
 *   - buildRequestSignals — "does this request still match the device/network that
 *     authenticated this session?" (checked against the Session row's own login-time
 *     baseline). This is the continuous-verification / mid-session-hijack check.
 */
import type { Request } from 'express'
import { businessHours, requestRateLimit, requestRateWindowMs, sensitiveResourcePatterns, staleSessionRatio } from '../config/policy.config'
import type { RiskSignals } from '../types'
import { computeFingerprint } from './fingerprint'
import { recordActivity, requestRateInWindow } from './sessionActivity'

function isOddHour(now: Date): boolean {
  const hour = now.getHours()
  return hour < businessHours.startHour || hour >= businessHours.endHour
}

export function buildLoginSignals(opts: { isKnownDevice: boolean; isKnownNetwork: boolean }): RiskSignals {
  return {
    newDevice: !opts.isKnownDevice,
    newIpAddress: !opts.isKnownNetwork,
    oddHour: isOddHour(new Date()),
    staleSession: false,
    highRequestRate: false,
    sensitiveResource: false,
  }
}

export interface RequestSessionBaseline {
  sessionId: string
  issuedAt: Date
  expiresAt: Date
  ipAddress: string | null
  userAgent: string | null
  deviceFingerprint: string | null
}

export function buildRequestSignals(req: Request, session: RequestSessionBaseline): RiskSignals {
  const now = new Date()
  recordActivity(session.sessionId, now)

  const lifetimeMs = session.expiresAt.getTime() - session.issuedAt.getTime()
  const ageMs = now.getTime() - session.issuedAt.getTime()
  const resourcePath = req.originalUrl.split('?')[0]

  return {
    newDevice: session.deviceFingerprint !== null && session.deviceFingerprint !== computeFingerprint(req),
    newIpAddress: session.ipAddress !== null && session.ipAddress !== (req.ip ?? null),
    oddHour: isOddHour(now),
    staleSession: lifetimeMs > 0 && ageMs / lifetimeMs >= staleSessionRatio,
    highRequestRate: requestRateInWindow(session.sessionId, now, requestRateWindowMs) > requestRateLimit,
    sensitiveResource: sensitiveResourcePatterns.some((pattern) => pattern.test(resourcePath)),
  }
}
