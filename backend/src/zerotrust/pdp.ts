/**
 * Policy Decision Point — skeleton (IMPLEMENTATION.md §4.2).
 * Will compute a 0–100 risk score from signals and map it to a decision.
 */
export type Decision = 'ALLOW' | 'STEP_UP' | 'DENY' | 'TERMINATE'

// TODO: evaluate(signals) → { riskScore, decision, reasons[] }
