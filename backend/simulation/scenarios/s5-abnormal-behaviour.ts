/**
 * Scenario 5 — Abnormal behaviour / continuous verification → mid-session TERMINATE
 * (ROADMAP §4.3, §6, feeds Continuous-validation effectiveness §7c).
 *
 * A legitimate session is established from the victim's home device, then the token is replayed
 * from a different machine — a stolen-session / hijack. Every replayed request scores newDevice,
 * and the background monitor (no new request from the real user required) must re-score the
 * session's recent history and TERMINATE it. We measure whether it was terminated and how long
 * detection took (revokedAt − firstAnomalyAt). Each hijacked session is labelled `attack`.
 *
 * This scenario is intentionally slow: it waits on real background monitor ticks
 * (continuousMonitorIntervalMs), so keep the session count small.
 */
import {
  ATTACKER_MACHINE,
  HOME_LAPTOP,
  call,
  login,
  prepareEnrolledKnownDevice,
  prisma,
  sessionIdOf,
} from '../harness'
import { continuousMonitorIntervalMs } from '../../src/config/policy.config'
import { emptyOutput, type ScenarioOutput } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function run(victims: string[]): Promise<ScenarioOutput> {
  const out = emptyOutput()

  for (const victimStudentId of victims) {
    // Clean, enrolled, known-device session — a genuinely legitimate starting point.
    out.authPerfSamples.push(...(await prepareEnrolledKnownDevice(victimStudentId, HOME_LAPTOP)))
    const auth = await login(victimStudentId, HOME_LAPTOP)
    const token: string | undefined = auth.body?.token
    if (!token || auth.body?.stepUpRequired) {
      out.notes.push(`Scenario 5: ${victimStudentId} did not get a clean session; skipping.`)
      continue
    }
    const sessionId = sessionIdOf(token)

    // Hijack: replay the token from the attacker's machine. Each request is scored newDevice
    // against the session's home baseline, seeding the risk history the monitor re-scores.
    for (let i = 0; i < 4; i++) {
      await call('/api/results', ATTACKER_MACHINE, { token })
      await sleep(200)
    }

    // Wait for the background monitor to act — no further request from anyone.
    const deadline = Date.now() + continuousMonitorIntervalMs * 3 + 10_000
    let session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    while (Date.now() < deadline && session.revokedBy !== 'TERMINATED') {
      await sleep(2000)
      session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    }

    const terminated = session.revokedBy === 'TERMINATED'
    const detectionSeconds =
      terminated && session.revokedAt && session.firstAnomalyAt
        ? Number(((session.revokedAt.getTime() - session.firstAnomalyAt.getTime()) / 1000).toFixed(2))
        : null

    out.continuousTrials.push({ sessionId, label: 'attack', terminated, detectionSeconds })

    // The terminated token must be dead everywhere — the Zero Trust "a token alone is never
    // enough" property. Recorded as a labelled attack trial too (a blocked unauthorized actor).
    const afterKill = await call('/api/courses', HOME_LAPTOP, { token })
    out.trials.push({
      scenario: 5,
      scenarioName: 'Abnormal behaviour / continuous verification',
      label: 'attack',
      granted: afterKill.status === 200,
      decision: 'TERMINATE',
      detail: terminated
        ? `hijacked session terminated in ${detectionSeconds}s; replayed token now ${afterKill.status}`
        : `NOT terminated within deadline (revokedBy=${session.revokedBy})`,
    })
  }

  out.notes.push(`Scenario 5: ${victims.length} hijacked-session trial(s) via token replay from an unknown device.`)
  return out
}
