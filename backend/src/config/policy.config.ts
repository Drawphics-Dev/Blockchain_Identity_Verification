/**
 * Zero Trust policy configuration (ROADMAP §4.2).
 * Signal weights and decision thresholds live here so they can be tuned and their effect
 * on the evaluation metrics (ROADMAP §7) demonstrated without touching the engine code.
 *
 *   riskScore = Σ (weight of every signal that fired), clamped 0–100
 *   <30 ALLOW · 30–59 STEP_UP · 60–84 DENY · ≥85 TERMINATE
 */
import type { RiskSignals } from '../types'

/**
 * Weight calibration is a security decision, not an arbitrary tuning knob — the numbers
 * here only mean something relative to `thresholds` below. The load-bearing constraint:
 *
 *   newDevice must ON ITS OWN reach the STEP_UP threshold.
 *
 * An unrecognized device is the primary credential-compromise signal (ROADMAP §1: the
 * stolen-password threat). If its weight sits below `allowBelow`, then a thief who has the
 * password and happens to be on any network the student has used before — campus wifi,
 * their home IP, localhost in a demo — is let straight through with no MFA, because no
 * other signal necessarily fires. That silently defeats step-up in exactly the scenario it
 * exists to defend. Hence 30, not 25: it must clear `allowBelow` unaided.
 *
 * newIpAddress deliberately stays BELOW the threshold: a proven device on a new network
 * (student switching wifi, travelling) is a weaker signal and shouldn't demand MFA alone —
 * but combined with a new device (30 + 20 = 50) it comfortably does.
 */
export const signalWeights: Record<keyof RiskSignals, number> = {
  newDevice: 30,
  newIpAddress: 20,
  /**
   * The strongest single signal in the model, and the only one weighted above newDevice.
   * A new device is *unusual*; impossible travel is *physically false* — the same account
   * cannot be in London and Sydney four minutes apart, so one of the two sessions is
   * definitionally not the student. 35 clears `allowBelow` alone (→ STEP_UP), and combined
   * with newDevice reaches 65 (→ DENY), which is the correct outcome for a stolen credential
   * replayed from another continent: challenge is too weak a response there.
   */
  impossibleTravel: 35,
  oddHour: 10,
  staleSession: 15,
  highRequestRate: 20,
  /**
   * Deliberately BELOW `allowBelow`, unlike the two above. Navigation breadth is a heuristic
   * about how a person browses, and a genuine power user opening several pages quickly can
   * trip it. It must therefore never demand MFA on its own — it earns its keep by compounding:
   * with a sensitive resource (25) it is still a pass, but alongside a new device (45) or a
   * high request rate (35) it pushes a sweep into STEP_UP, which is what enumeration deserves.
   */
  abnormalNavigation: 15,
  sensitiveResource: 10,
}

export const thresholds = {
  allowBelow: 30,
  stepUpBelow: 60,
  denyBelow: 85,
} as const

/**
 * Fail fast at startup rather than ship a policy that silently lets stolen credentials
 * through. These weights are meant to be tuned (that's the point of this file — ROADMAP §4.2
 * wants their effect on the metrics demonstrated), and it is genuinely easy to nudge
 * `newDevice` down without noticing that it has dropped below `allowBelow` and quietly
 * disabled step-up for unrecognized devices. This bug shipped once; the assertion is here so
 * it cannot ship again from a config edit alone.
 */
if (signalWeights.newDevice < thresholds.allowBelow) {
  throw new Error(
    `Zero Trust policy misconfigured: signalWeights.newDevice (${signalWeights.newDevice}) is below ` +
      `thresholds.allowBelow (${thresholds.allowBelow}), so an unrecognized device would be ALLOWed ` +
      `without step-up whenever no other signal fires. See the comment on signalWeights.`,
  )
}

/** Same reasoning for impossible travel, which must also stand on its own: a physically
 * impossible login that produced no challenge would be the clearest possible miss. */
if (signalWeights.impossibleTravel < thresholds.allowBelow) {
  throw new Error(
    `Zero Trust policy misconfigured: signalWeights.impossibleTravel (${signalWeights.impossibleTravel}) ` +
      `is below thresholds.allowBelow (${thresholds.allowBelow}), so a physically impossible login ` +
      `would be ALLOWed whenever no other signal fires.`,
  )
}

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

/**
 * Fastest speed a person can plausibly travel, km/h. Above this, two logins cannot both be
 * the same human being. 900 km/h is roughly commercial jet cruise — chosen as a physical
 * upper bound rather than a tuned value, so it needs no recalibration per deployment and
 * cannot be accused of being fitted to the results.
 */
export const maxTravelKmh = 900

/** Sliding window for the navigation-breadth (abnormalNavigation) signal. */
export const navigationWindowMs = 60_000
/**
 * More than this many DISTINCT resources inside the window is abnormal breadth. A dashboard
 * load touches 4 (courses, enrollments, fees, results) and a student then navigating to two
 * or three more pages stays comfortably under 8; a script probing for whatever it can reach
 * blows past it. Set with the same headroom principle as requestRateLimit — normal use must
 * not trip the signal meant to catch enumeration.
 */
export const navigationBreadthLimit = 8

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
