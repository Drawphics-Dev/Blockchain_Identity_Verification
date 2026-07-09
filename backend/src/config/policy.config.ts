/**
 * Zero Trust policy configuration — skeleton (IMPLEMENTATION.md §4.2).
 * Signal weights and decision thresholds will live here so they can be tuned
 * and their effect on the evaluation metrics demonstrated.
 *
 *   riskScore = Σ (weightᵢ × signalᵢ)   clamped 0–100
 *   <30 ALLOW · 30–59 STEP_UP · 60–84 DENY · ≥85 TERMINATE
 */

export const signalWeights = {
  // TODO: invalidCredential, newDevice, newIpAddress, oddHour,
  //       highRequestRate, staleSession, sensitiveResource
} as const

export const thresholds = {
  allowBelow: 30,
  stepUpBelow: 60,
  denyBelow: 85,
} as const
