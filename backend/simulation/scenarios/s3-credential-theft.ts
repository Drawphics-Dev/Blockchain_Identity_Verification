/**
 * Scenario 3 — Credential stealing & imitation → STEP_UP then DENY (ROADMAP §6, feeds FAR /
 * Attack resistance).
 *
 * The hard case the whole design exists for: the attacker holds the victim's CORRECT password
 * but is on an unrecognized machine. The password gets them a session, but the newDevice signal
 * raises a STEP_UP they cannot satisfy (they have no authenticator), so the PEP blocks every
 * request to protected data and they never reach it. Labelled `attack`; `granted` must be false
 * (a TN) — a granted attempt here is exactly the FP that FAR measures.
 */
import {
  ATTACKER_MACHINE,
  HOME_LAPTOP,
  call,
  getEnrollment,
  login,
  prepareEnrolledKnownDevice,
  stepUp,
} from '../harness'
import { emptyOutput, type ScenarioOutput } from '../types'

export async function run(victimStudentId: string, count: number): Promise<ScenarioOutput> {
  const out = emptyOutput()

  // The victim is a normal, fully-enrolled user with a known home device. Anchoring them here
  // means the attacker's later login is caught ONLY by newDevice — the true credential-theft
  // signal — not incidentally by a new network or a never-enrolled account.
  out.authPerfSamples.push(...(await prepareEnrolledKnownDevice(victimStudentId, HOME_LAPTOP)))

  for (let i = 0; i < count; i++) {
    // Attacker logs in with the real password from their own machine.
    const auth = await login(victimStudentId, ATTACKER_MACHINE)
    const steppedUp = auth.body?.stepUpRequired === true
    const token: string | undefined = auth.body?.token

    // Try to reach a sensitive resource — must be blocked pending an MFA they can't provide.
    const fees = token ? await call('/api/fees', ATTACKER_MACHINE, { token }) : null
    // Try to bluff the step-up with a guessed code — must fail.
    const guess = token ? await stepUp(token, ATTACKER_MACHINE, '000000') : null
    // Try to hijack enrollment (steal the second factor) — an enrolled account must refuse.
    const stealEnroll = token ? await getEnrollment(token, ATTACKER_MACHINE, 'GUES-SEDT-OKEN') : null

    const granted = fees?.status === 200
    const guessRejected = guess?.status === 400
    const enrollRefused = stealEnroll?.status === 409 // already_enrolled

    out.trials.push({
      scenario: 3,
      scenarioName: 'Credential stealing & imitation',
      label: 'attack',
      granted,
      decision: steppedUp ? 'STEP_UP' : auth.status === 200 ? 'ALLOW' : 'DENY',
      detail: !granted
        ? `stolen password challenged (stepUp=${steppedUp}), data blocked (fees ${fees?.status}), ` +
          `TOTP guess ${guessRejected ? 'rejected' : `UNEXPECTED ${guess?.status}`}, ` +
          `enrollment ${enrollRefused ? 'refused' : `UNEXPECTED ${stealEnroll?.status}`}`
        : `SECURITY FAILURE: stolen password reached /api/fees (${fees?.status})`,
    })
  }

  out.notes.push(
    `Scenario 3: ${count} credential-theft attempts against enrolled victim ${victimStudentId} from an unknown device.`,
  )
  return out
}
