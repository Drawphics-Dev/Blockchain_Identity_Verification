/**
 * Phase 9 metric definitions (ROADMAP §7) — pure functions, no I/O.
 *
 * Turns the Phase 8 labelled report into the four metric groups from the brief and the
 * approved Composite Effectiveness Score (CES). Every scenario is mapped to exactly the metric
 * the roadmap's Phase 8 table assigns it, so nothing is double-counted:
 *   Scenario 1  → TAR / FRR            (legitimate access)
 *   Scenario 2,3 → FAR / Attack resistance (unauthorized access)
 *   Scenario 4  → Audit integrity
 *   Scenario 5  → Continuous validation
 */
import type { SimulationReport, Trial } from '../simulation/types'

/** null-safe ratio → percentage, rounded to 1 dp. null when the denominator is 0. */
function pct(numer: number, denom: number): number | null {
  return denom === 0 ? null : Number(((numer / denom) * 100).toFixed(1))
}

/** null-safe ratio → 0–1 fraction. null when the denominator is 0. */
function frac(numer: number, denom: number): number | null {
  return denom === 0 ? null : numer / denom
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

export interface ConfusionMatrix {
  tp: number
  fn: number
  fp: number
  tn: number
}

/** The confusion matrix, built ONLY from the access-control scenarios (1–3), per the roadmap
 * mapping. Scenario 5's blocked hijacks are continuous-validation, not counted here. */
export function confusionMatrix(trials: Trial[]): ConfusionMatrix {
  const access = trials.filter((t) => t.scenario === 1 || t.scenario === 2 || t.scenario === 3)
  const legit = access.filter((t) => t.label === 'legitimate')
  const attack = access.filter((t) => t.label === 'attack')
  const tp = legit.filter((t) => t.granted).length
  const fp = attack.filter((t) => t.granted).length
  return { tp, fn: legit.length - tp, fp, tn: attack.length - fp }
}

export interface AccessControlMetrics {
  confusion: ConfusionMatrix
  /** True Acceptance Rate = TP/(TP+FN) — legit users correctly granted (high is good). */
  tar: number | null
  /** False Rejection Rate = FN/(TP+FN) = 1−TAR — legit users wrongly blocked (low is good). */
  frr: number | null
  /** False Acceptance Rate = FP/(FP+TN) — attackers wrongly granted (low is good). */
  far: number | null
}

export function accessControl(trials: Trial[]): AccessControlMetrics {
  const c = confusionMatrix(trials)
  const tar = frac(c.tp, c.tp + c.fn)
  const far = frac(c.fp, c.fp + c.tn)
  return {
    confusion: c,
    tar: tar === null ? null : Number(tar.toFixed(4)),
    frr: tar === null ? null : Number((1 - tar).toFixed(4)),
    far: far === null ? null : Number(far.toFixed(4)),
  }
}

/** Attack resistance (§7b) = blocked attacks / total attack attempts × 100, over the
 * unauthorized-access scenarios (2 and 3). */
export function attackResistance(trials: Trial[]): { blocked: number; total: number; percent: number | null } {
  const attacks = trials.filter((t) => (t.scenario === 2 || t.scenario === 3) && t.label === 'attack')
  const blocked = attacks.filter((t) => !t.granted).length
  return { blocked, total: attacks.length, percent: pct(blocked, attacks.length) }
}

export interface ContinuousMetrics {
  sessionsWithAnomaly: number
  terminated: number
  /** § 7c — (sessions terminated after detection / total risky sessions) × 100. */
  sessionTerminationRate: number | null
  /** § 7c — mean(t_terminate − t_first_anomaly) in seconds, over terminated sessions. */
  meanAnomalyDetectionSeconds: number | null
}

export function continuousValidation(report: SimulationReport): ContinuousMetrics {
  const trials = report.continuousTrials
  const terminated = trials.filter((t) => t.terminated)
  const detTimes = terminated
    .map((t) => t.detectionSeconds)
    .filter((s): s is number => typeof s === 'number')
  const mean = detTimes.length ? detTimes.reduce((a, b) => a + b, 0) / detTimes.length : null
  return {
    sessionsWithAnomaly: trials.length,
    terminated: terminated.length,
    sessionTerminationRate: pct(terminated.length, trials.length),
    meanAnomalyDetectionSeconds: mean === null ? null : Number(mean.toFixed(2)),
  }
}

/** Audit integrity (§7d) = detected tampering / total tampering attempts × 100 (≈100% expected). */
export function auditIntegrity(report: SimulationReport): { detected: number; total: number; percent: number | null } {
  const trials = report.tamperTrials.filter((t) => t.tampered)
  const detected = trials.filter((t) => t.detected).length
  return { detected, total: trials.length, percent: pct(detected, trials.length) }
}

/**
 * Authentication Performance — the 10% CES component the brief introduces but never defines
 * (ROADMAP §7 OPEN ITEM). Computed here on an explicit, transparent PROVISIONAL definition so
 * the number exists for the showcase, clearly flagged as pending client confirmation:
 *
 *   score = clamp01(1 − meanLoginLatencyMs / budgetMs)
 *
 * i.e. how far under a latency budget the credential-check + token-issuance round-trip sits.
 * A login at 0 ms scores 1.0; at or above the budget, 0.0. MFA latency is reported alongside
 * but not folded in, so a single knob (the budget) fully describes the definition.
 */
export const AUTH_PERF_BUDGET_MS = 1500

export interface AuthPerformanceMetrics {
  meanLoginMs: number | null
  meanMfaVerifyMs: number | null
  budgetMs: number
  /** 0–1 provisional score. null when there were no login samples. */
  score: number | null
  provisional: true
}

export function authPerformance(report: SimulationReport): AuthPerformanceMetrics {
  const logins = report.authPerfSamples.filter((s) => s.phase === 'login').map((s) => s.ms)
  const mfas = report.authPerfSamples.filter((s) => s.phase === 'mfa_verify').map((s) => s.ms)
  const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const meanLoginMs = mean(logins)
  return {
    meanLoginMs: meanLoginMs === null ? null : Number(meanLoginMs.toFixed(1)),
    meanMfaVerifyMs: mean(mfas) === null ? null : Number(mean(mfas)!.toFixed(1)),
    budgetMs: AUTH_PERF_BUDGET_MS,
    score: meanLoginMs === null ? null : Number(clamp01(1 - meanLoginMs / AUTH_PERF_BUDGET_MS).toFixed(4)),
    provisional: true,
  }
}

export interface CesComponents {
  /** Access control as a single 0–1 scalar: balanced accuracy = (TAR + (1−FAR)) / 2. Rewards
   * granting legit users and blocking attackers equally, and is robust to class imbalance —
   * the roadmap gives TAR/FAR/FRR separately but leaves the scalarization to Phase 9. */
  accessControl: number | null
  continuousValidation: number | null
  auditIntegrity: number | null
  authenticationPerformance: number | null
}

export interface CesResult {
  components: CesComponents
  weights: { accessControl: number; continuousValidation: number; auditIntegrity: number; authenticationPerformance: number }
  /** CES over ALL available components including the provisional auth-performance one, 0–100. */
  ces: number | null
  /** CES with the undefined auth-performance component dropped and its 10% redistributed
   * across the three defined components (weights renormalized) — the defensible headline. */
  cesExcludingAuthPerformance: number | null
}

/**
 * Composite Effectiveness Score (ROADMAP §7).
 * CES = 0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthPerformance
 * Any component with no data (null) is dropped and the remaining weights are renormalized, so a
 * missing scenario lowers confidence, never silently scores 0.
 */
export function computeCes(report: SimulationReport): CesResult {
  const ac = accessControl(report.trials)
  const cv = continuousValidation(report)
  const ai = auditIntegrity(report)
  const ap = authPerformance(report)

  const acScore =
    ac.tar === null || ac.far === null ? null : clamp01((ac.tar + (1 - ac.far)) / 2)
  const cvScore = cv.sessionTerminationRate === null ? null : cv.sessionTerminationRate / 100
  const aiScore = ai.percent === null ? null : ai.percent / 100

  const components: CesComponents = {
    accessControl: acScore === null ? null : Number(acScore.toFixed(4)),
    continuousValidation: cvScore === null ? null : Number(cvScore.toFixed(4)),
    auditIntegrity: aiScore === null ? null : Number(aiScore.toFixed(4)),
    authenticationPerformance: ap.score,
  }
  const weights = { accessControl: 0.4, continuousValidation: 0.3, auditIntegrity: 0.2, authenticationPerformance: 0.1 }

  const weightedMean = (entries: Array<{ score: number | null; weight: number }>): number | null => {
    const present = entries.filter((e): e is { score: number; weight: number } => e.score !== null)
    const totalWeight = present.reduce((sum, e) => sum + e.weight, 0)
    if (totalWeight === 0) return null
    const weighted = present.reduce((sum, e) => sum + e.score * e.weight, 0)
    return Number(((weighted / totalWeight) * 100).toFixed(1))
  }

  return {
    components,
    weights,
    ces: weightedMean([
      { score: components.accessControl, weight: weights.accessControl },
      { score: components.continuousValidation, weight: weights.continuousValidation },
      { score: components.auditIntegrity, weight: weights.auditIntegrity },
      { score: components.authenticationPerformance, weight: weights.authenticationPerformance },
    ]),
    cesExcludingAuthPerformance: weightedMean([
      { score: components.accessControl, weight: weights.accessControl },
      { score: components.continuousValidation, weight: weights.continuousValidation },
      { score: components.auditIntegrity, weight: weights.auditIntegrity },
    ]),
  }
}
