/**
 * Scenario 1 — Genuine user login → ALLOW (ROADMAP §6, feeds TAR / FRR).
 *
 * A legitimate student, on their own recognized device, signs in and reads a sensitive
 * resource (fees). The Zero Trust engine should ALLOW it and the data should be reachable.
 * Every such attempt is labelled `legitimate`; `granted` records whether the actor actually
 * reached the data, so the evaluator counts it as TP (granted) or FN (wrongly blocked).
 */
import {
  HOME_LAPTOP,
  call,
  login,
  prepareEnrolledKnownDevice,
} from '../harness'
import { emptyOutput, type ScenarioOutput } from '../types'

export async function run(students: string[], count: number): Promise<ScenarioOutput> {
  const out = emptyOutput()

  // Put every genuine student into the "returning user" steady state first: enrolled MFA and a
  // recognized device, so their logins below are clean ALLOWs rather than first-time step-ups.
  for (const studentId of students) {
    out.authPerfSamples.push(...(await prepareEnrolledKnownDevice(studentId, HOME_LAPTOP)))
  }

  for (let i = 0; i < count; i++) {
    const studentId = students[i % students.length]

    const auth = await login(studentId, HOME_LAPTOP)
    out.authPerfSamples.push({ phase: 'login', ms: auth.ms })

    const loggedIn = auth.status === 200 && !!auth.body.token
    const steppedUp = auth.body?.stepUpRequired === true

    // A known device should not be challenged; read a sensitive resource to prove real access.
    const fees = loggedIn
      ? await call('/api/fees', HOME_LAPTOP, { token: auth.body.token })
      : null
    const granted = loggedIn && fees?.status === 200 && !!fees.body.statement

    out.trials.push({
      scenario: 1,
      scenarioName: 'Genuine user login',
      label: 'legitimate',
      granted,
      decision: steppedUp ? 'STEP_UP' : 'ALLOW',
      detail: granted
        ? `${studentId}: ALLOW, reached /api/fees`
        : `${studentId}: unexpectedly blocked (login ${auth.status}, stepUp=${steppedUp}, fees ${fees?.status ?? 'n/a'})`,
    })
  }

  out.notes.push(
    `Scenario 1: ${count} genuine login+access attempts across ${students.length} known-device student(s).`,
  )
  return out
}
