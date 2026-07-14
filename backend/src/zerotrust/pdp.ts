/**
 * Policy Decision Point (ROADMAP §4.2).
 * Pure function: signals in, risk score + decision out. No I/O, no session state — that
 * belongs to the signal builders and the PEP that calls this.
 */
import type { Decision, RiskEvaluation, RiskSignals } from '../types'
import { signalWeights, thresholds } from '../config/policy.config'

const SEVERITY: Record<Decision, number> = { ALLOW: 0, STEP_UP: 1, DENY: 2, TERMINATE: 3 }

/** The more severe of two decisions — used to combine "this request's live risk" with
 * "an outstanding requirement from earlier in the session" without a second scoring pass. */
export function moreSevere(a: Decision, b: Decision): Decision {
  return SEVERITY[a] >= SEVERITY[b] ? a : b
}

export function evaluate(signals: RiskSignals): RiskEvaluation {
  const reasons = (Object.keys(signals) as (keyof RiskSignals)[]).filter((key) => signals[key])
  const riskScore = Math.min(
    100,
    reasons.reduce((sum, key) => sum + signalWeights[key], 0),
  )

  const decision: RiskEvaluation['decision'] =
    riskScore < thresholds.allowBelow
      ? 'ALLOW'
      : riskScore < thresholds.stepUpBelow
        ? 'STEP_UP'
        : riskScore < thresholds.denyBelow
          ? 'DENY'
          : 'TERMINATE'

  return { riskScore, decision, reasons }
}
