/**
 * Zero Trust policy configuration (ROADMAP §4.2).
 * Signal weights and decision thresholds live here so they can be tuned and their effect
 * on the evaluation metrics (ROADMAP §7) demonstrated without touching the engine code.
 *
 *   riskScore = Σ (weight of every signal that fired), clamped 0–100
 *   <30 ALLOW · 30–59 STEP_UP · 60–84 DENY · ≥85 TERMINATE
 */
import type { RiskSignals } from '../types'

export const signalWeights: Record<keyof RiskSignals, number> = {
  newDevice: 25,
  newIpAddress: 20,
  oddHour: 10,
  staleSession: 15,
  highRequestRate: 20,
  sensitiveResource: 10,
}

export const thresholds = {
  allowBelow: 30,
  stepUpBelow: 60,
  denyBelow: 85,
} as const

/** Local hours considered normal activity; outside this window raises the oddHour signal. */
export const businessHours = { startHour: 6, endHour: 22 } as const

/** A session past this fraction of its total lifetime counts as stale. */
export const staleSessionRatio = 0.85

/** Sliding window for the highRequestRate signal. */
export const requestRateWindowMs = 10_000
/**
 * More than this many requests inside the window is "high". A single dashboard load fires
 * 4 requests at once (courses/enrollments/fees/results) — this needs headroom for a
 * student genuinely reloading a few times, not just one page view, or normal use trips the
 * same signal meant to catch actual rapid-fire/scripted access.
 */
export const requestRateLimit = 30

/** Which routes count as sensitive (ROADMAP §4.1) — matched against the request path. */
export const sensitiveResourcePatterns = [/^\/api\/fees(\/|$)/, /^\/api\/results(\/|$)/]

/** A completed step-up stays valid for this long before STEP_UP is asked again. */
export const stepUpValidityMs = 15 * 60 * 1000

/** How often the continuous background monitor re-scores active sessions. */
export const continuousMonitorIntervalMs = 15_000
/** How far back the continuous monitor looks when computing a session's rolling risk. */
export const rollingRiskWindowMs = 2 * 60 * 1000
/** Terminate a session once it accumulates this many STEP_UP-or-worse events in the window. */
export const rollingRiskEventThreshold = 3
/** ...or once its average risk score in the window reaches this. */
export const rollingRiskScoreThreshold = 70
