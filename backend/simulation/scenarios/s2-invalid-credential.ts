/**
 * Scenario 2 — Invalid credential login → DENY at authentication (ROADMAP §6, feeds FAR /
 * Attack resistance).
 *
 * An attacker who does not hold valid credentials: either the right student ID with the wrong
 * password, or an ID that does not exist at all. Both must be refused at authentication (HTTP
 * 401 invalid_credentials) — before any risk decision is even computed. Every attempt is
 * labelled `attack`; `granted` should be false (a TN). A granted attempt here would be an FP.
 */
import { HERO_STUDENT_ID, login, HOME_LAPTOP, call } from '../harness'
import { emptyOutput, type ScenarioOutput } from '../types'

export async function run(count: number): Promise<ScenarioOutput> {
  const out = emptyOutput()

  for (let i = 0; i < count; i++) {
    // Alternate the two failure modes so both are exercised: a wrong password against a real
    // account, and a wholly unknown student id. The backend must be indistinguishable between
    // them (same 401, same message) — that timing/message parity is itself a security property.
    const wrongPassword = i % 2 === 0
    const studentId = wrongPassword ? HERO_STUDENT_ID : `SU/CS/2099/${String(9000 + i).padStart(4, '0')}`
    const password = wrongPassword ? `definitely-not-the-password-${i}` : 'whatever'

    const auth = await login(studentId, HOME_LAPTOP, password)

    const refused = auth.status === 401 && auth.body?.error === 'invalid_credentials'

    // If (impossibly) a token came back, prove whether it actually opens data — the honest
    // test of "granted", rather than trusting the status code alone.
    let granted = false
    if (auth.status === 200 && auth.body?.token) {
      const fees = await call('/api/fees', HOME_LAPTOP, { token: auth.body.token })
      granted = fees.status === 200
    }

    out.trials.push({
      scenario: 2,
      scenarioName: 'Invalid credential login',
      label: 'attack',
      granted,
      decision: 'AUTH_DENY',
      detail: refused
        ? `${wrongPassword ? 'wrong password' : 'unknown id'} refused at auth (401)`
        : `unexpected: login returned ${auth.status} for ${studentId}`,
    })
  }

  out.notes.push(`Scenario 2: ${count} invalid-credential attempts (wrong password + unknown id).`)
  return out
}
