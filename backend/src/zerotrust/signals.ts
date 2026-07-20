/**
 * Builds the RiskSignals the PDP scores, from two different contexts:
 *
 *   - buildLoginSignals  — "has this student ever used this device/network before?"
 *     (checked against the Device/KnownNetwork tables, which persist across sessions).
 *   - buildRequestSignals — "does this request still match the device/network that
 *     authenticated this session?" (checked against the Session row's own login-time
 *     baseline). This is the continuous-verification / mid-session-hijack check.
 *
 * Geovelocity is the one signal whose two ends live in different places depending on context,
 * so each builder sources it differently: at login the previous leg is the student's PREVIOUS
 * SESSION (supplied by the caller, which has the DB); on a request it is THIS session's own
 * login location. Both answer the same question — could the same person have got here in time?
 */
import type { Request } from 'express'
import {
  businessHours,
  maxTravelKmh,
  navigationBreadthLimit,
  navigationWindowMs,
  requestRateLimit,
  requestRateWindowMs,
  sensitiveResourcePatterns,
  staleSessionRatio,
} from '../config/policy.config'
import type { RiskSignals } from '../types'
import { computeFingerprint } from './fingerprint'
import { assessTravel } from './geo'
import { distinctResourcesInWindow, recordActivity, requestRateInWindow } from './sessionActivity'

function isOddHour(now: Date): boolean {
  const hour = now.getHours()
  return hour < businessHours.startHour || hour >= businessHours.endHour
}

export function buildLoginSignals(opts: {
  isKnownDevice: boolean
  isKnownNetwork: boolean
  /**
   * Where this student last authenticated from, and when — their previous session. null when
   * they have no prior session (first ever login), in which case there is no leg to compare
   * against and the geovelocity signal cannot fire.
   */
  previousLogin: { ip: string | null; at: Date } | null
  currentIp: string | null
}): RiskSignals {
  const now = new Date()
  const travel = opts.previousLogin
    ? assessTravel(opts.previousLogin, { ip: opts.currentIp, at: now }, maxTravelKmh)
    : null

  return {
    newDevice: !opts.isKnownDevice,
    newIpAddress: !opts.isKnownNetwork,
    impossibleTravel: travel?.impossible ?? false,
    oddHour: isOddHour(now),
    staleSession: false,
    highRequestRate: false,
    // No session history exists yet at login, so navigation breadth is undefined here.
    abnormalNavigation: false,
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
  const resourcePath = req.originalUrl.split('?')[0]
  recordActivity(session.sessionId, now, resourcePath)

  const lifetimeMs = session.expiresAt.getTime() - session.issuedAt.getTime()
  const ageMs = now.getTime() - session.issuedAt.getTime()

  // Against this session's OWN login leg: a token that authenticated in London and is now
  // being presented from Sydney was not carried there by its owner.
  const travel = assessTravel(
    { ip: session.ipAddress, at: session.issuedAt },
    { ip: req.ip ?? null, at: now },
    maxTravelKmh,
  )

  return {
    newDevice: session.deviceFingerprint !== null && session.deviceFingerprint !== computeFingerprint(req),
    newIpAddress: session.ipAddress !== null && session.ipAddress !== (req.ip ?? null),
    impossibleTravel: travel.impossible,
    oddHour: isOddHour(now),
    staleSession: lifetimeMs > 0 && ageMs / lifetimeMs >= staleSessionRatio,
    highRequestRate: requestRateInWindow(session.sessionId, now, requestRateWindowMs) > requestRateLimit,
    abnormalNavigation:
      distinctResourcesInWindow(session.sessionId, now, navigationWindowMs) > navigationBreadthLimit,
    sensitiveResource: sensitiveResourcePatterns.some((pattern) => pattern.test(resourcePath)),
  }
}
