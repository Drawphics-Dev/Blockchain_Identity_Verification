/**
 * Phase 9 metric definitions (ROADMAP §7) — pure functions, no I/O.
 *
 * Turns the Phase 8 labelled report into the four metric groups from the brief and the
 * approved Composite Effectiveness Score (CES). Every scenario is mapped to exactly the metric
 * the roadmap's Phase 8 table assigns it, so nothing is double-counted:
 *   Scenario 1    → TAR / FRR                 (legitimate access)
 *   Scenario 2,3  → FAR / Attack resistance   (unauthorized access — getting IN)
 *   Scenario 6    → FAR / Attack resistance   (unauthorized access — spreading ONCE IN)
 *   Scenario 4    → Audit integrity
 *   Scenario 5    → Continuous validation
 *
 * Scenario 6 (lateral movement) joins 2 and 3 rather than forming its own group: all three
 * are unauthorized attempts to reach protected data, which is exactly what FAR and attack
 * resistance measure. It is only the attacker's starting position that differs.
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

/** Scenarios whose trials are access-control evidence. Scenario 5's blocked hijacks are
 * continuous-validation and are deliberately absent, so nothing is double-counted. */
const ACCESS_CONTROL_SCENARIOS = [1, 2, 3, 6]
/** The subset of those that are unauthorized attempts — the denominator of attack resistance. */
const ATTACK_SCENARIOS = [2, 3, 6]

/** The confusion matrix, built ONLY from the access-control scenarios, per the roadmap mapping. */
export function confusionMatrix(trials: Trial[]): ConfusionMatrix {
  const access = trials.filter((t) => ACCESS_CONTROL_SCENARIOS.includes(t.scenario))
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
 * unauthorized-access scenarios (2, 3 and 6). */
export function attackResistance(trials: Trial[]): { blocked: number; total: number; percent: number | null } {
  const attacks = trials.filter((t) => ATTACK_SCENARIOS.includes(t.scenario) && t.label === 'attack')
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
 * Authentication Performance — the 10% CES component ROADMAP §7 introduces in Table 1 but never
 * defines alongside the other three (the §7 OPEN ITEM). Scored here against PUBLISHED
 * human-computer-interaction response-time thresholds rather than an invented budget, so the
 * definition can be defended independently of the result it produces:
 *
 *   ≤ TARGET  → 1.0   3 s — the widely-used web-response threshold past which users
 *                     begin abandoning an interaction.
 *   ≥ CEILING → 0.0   10 s — Nielsen's "limit of attention": beyond this a user stops
 *                     waiting and disengages from the task entirely.
 *   between   → linear interpolation.
 *
 * Two deliberate choices worth stating plainly, because both are places an evaluation can
 * quietly flatter itself:
 *
 *   1. The earlier definition was `1 − latency/budget`, which scored 0 AT the budget — so a
 *      login arriving comfortably inside its target still scored near zero. That is not what a
 *      budget means anywhere else in engineering. Meeting the target now scores full marks, and
 *      degradation is measured against the point where the user actually gives up.
 *   2. Both anchors come from the HCI literature, NOT from the measured result. The system
 *      passes under any target at or above its measured latency; the honest framing in the
 *      report is that it meets a published threshold, not that a threshold was chosen to fit.
 *
 * MFA latency is measured and reported but deliberately not folded in, so two numbers (target
 * and ceiling) fully describe the definition.
 *
 * Still flagged `provisional` until the client confirms it — the numbers are defensible, but
 * the component is theirs to define.
 */
export const AUTH_PERF_TARGET_MS = 3000
export const AUTH_PERF_CEILING_MS = 10_000

export interface AuthPerformanceMetrics {
  meanLoginMs: number | null
  meanMfaVerifyMs: number | null
  targetMs: number
  ceilingMs: number
  /** 0–1 provisional score. null when there were no login samples. */
  score: number | null
  provisional: true
}

/** Full marks at or under the target, zero at or over the ceiling, linear in between. */
function latencyScore(ms: number): number {
  return clamp01((AUTH_PERF_CEILING_MS - ms) / (AUTH_PERF_CEILING_MS - AUTH_PERF_TARGET_MS))
}

export function authPerformance(report: SimulationReport): AuthPerformanceMetrics {
  const logins = report.authPerfSamples.filter((s) => s.phase === 'login').map((s) => s.ms)
  const mfas = report.authPerfSamples.filter((s) => s.phase === 'mfa_verify').map((s) => s.ms)
  const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const meanLoginMs = mean(logins)
  const meanMfaMs = mean(mfas)
  return {
    meanLoginMs: meanLoginMs === null ? null : Number(meanLoginMs.toFixed(1)),
    meanMfaVerifyMs: meanMfaMs === null ? null : Number(meanMfaMs.toFixed(1)),
    targetMs: AUTH_PERF_TARGET_MS,
    ceilingMs: AUTH_PERF_CEILING_MS,
    score: meanLoginMs === null ? null : Number(latencyScore(meanLoginMs).toFixed(4)),
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
