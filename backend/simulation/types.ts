/**
 * Shared result shapes for the Phase 8 attack-simulation harness (ROADMAP §6 Phase 8) and
 * the Phase 9 metrics engine (backend/evaluation/) that consumes them.
 *
 * The whole point of these types is a clean contract between the two phases: the harness
 * emits *labelled outcomes* (ground truth + what the Zero Trust engine actually decided),
 * and the evaluator turns those labels into TAR/FAR/FRR, attack resistance, continuous-
 * validation and audit-integrity numbers — plus the Composite Effectiveness Score (CES).
 *
 * Nothing here is computed from unlabelled live traffic: every field below carries the
 * ground-truth label the metrics need, so the confusion matrix is honest by construction.
 */

/** Ground-truth label the harness assigns to an attempt before it observes any decision. */
export type GroundTruth = 'legitimate' | 'attack'

/** Zero Trust access decision (mirrors src/types Decision), plus a marker for a request
 * rejected at authentication (wrong password) before any risk decision is ever computed. */
export type ObservedDecision = 'ALLOW' | 'STEP_UP' | 'DENY' | 'TERMINATE' | 'AUTH_DENY'

/**
 * One labelled access attempt — the atom the confusion matrix is built from.
 *
 * `granted` is the ground truth of the OUTCOME: did the actor actually reach protected data?
 * That, crossed with `label`, is the entire confusion matrix:
 *   legitimate & granted   → TP      legitimate & !granted → FN
 *   attack     & granted   → FP      attack     & !granted → TN
 */
export interface Trial {
  scenario: number
  scenarioName: string
  label: GroundTruth
  granted: boolean
  /** The decision observed at the gate that settled this attempt. */
  decision: ObservedDecision
  /** Human-readable note — what happened, for the report and for debugging a surprise. */
  detail: string
}

/** One log-tampering trial (Scenario 4) — feeds the audit-integrity metric (§7d). */
export interface TamperTrial {
  eventId: string
  /** Whether the off-chain mirror row was actually edited (a tampering attempt was made). */
  tampered: boolean
  /** Whether the integrity verifier flagged the edit by comparing against the ledger. */
  detected: boolean
}

/** One continuous-verification trial (Scenario 5) — feeds §7c. An attack session that the
 * background monitor should terminate mid-way with no new request from the real user. */
export interface ContinuousTrial {
  sessionId: string
  /** Always 'attack' — a hijacked session is an unauthorized actor by definition. */
  label: 'attack'
  terminated: boolean
  /** revokedAt − firstAnomalyAt, in seconds. null if never terminated (detection failed). */
  detectionSeconds: number | null
}

/** A latency sample for the (client-undefined) "Authentication Performance" CES component.
 * The harness measures it so a definition can be chosen later without re-running anything:
 * login = credential-check + token issuance; mfa_verify = TOTP step-up round-trip. */
export interface AuthPerfSample {
  phase: 'login' | 'mfa_verify'
  ms: number
}

/** The full labelled output of one simulation run — the file Phase 9 reads. */
export interface SimulationReport {
  startedAt: string
  finishedAt: string
  baseUrl: string
  ledger: string
  /** How many attempts each scenario was asked to make — reported so the metrics can be
   * read alongside their sample sizes (ROADMAP §8: report request counts with TAR/FAR/FRR). */
  config: SimulationConfig
  trials: Trial[]
  tamperTrials: TamperTrial[]
  continuousTrials: ContinuousTrial[]
  authPerfSamples: AuthPerfSample[]
  notes: string[]
}

export interface SimulationConfig {
  genuineLogins: number
  invalidCredentialAttempts: number
  credentialTheftAttempts: number
  tamperAttempts: number
  abnormalSessions: number
}

/** What each scenario function returns; the orchestrator concatenates these into a report. */
export interface ScenarioOutput {
  trials: Trial[]
  tamperTrials: TamperTrial[]
  continuousTrials: ContinuousTrial[]
  authPerfSamples: AuthPerfSample[]
  notes: string[]
}

/** An empty output a scenario can spread into and fill only the buckets it produces. */
export const emptyOutput = (): ScenarioOutput => ({
  trials: [],
  tamperTrials: [],
  continuousTrials: [],
  authPerfSamples: [],
  notes: [],
})
