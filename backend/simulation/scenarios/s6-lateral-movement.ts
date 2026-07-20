/**
 * Scenario 6 — Lateral movement → every attempt contained (ROADMAP §1, feeds FAR / Attack
 * resistance).
 *
 * The third security challenge the brief names ("Re-verifies every request, so a foothold in
 * one area cannot silently spread") and the only one the original five scenarios never
 * exercised. Scenarios 2 and 3 model an attacker trying to GET IN. This one starts from the
 * assumption that they already ARE in — a fully legitimate, MFA-enrolled student session, the
 * strongest possible foothold — and measures whether it can be widened.
 *
 * That distinction matters for the evaluation: containment here is not proved by the risk
 * engine blocking a suspicious request, but by the authorization model giving the attacker
 * nothing to reach in the first place. Both are Zero Trust; only one of them is a risk score.
 *
 * Three directions are probed, and all are labelled `attack`:
 *   HORIZONTAL — reach another student's fees/results/profile by injecting their id.
 *   VERTICAL   — reach the admin surfaces (audit trail, metrics, integrity verifier, and the
 *                on-chain identity revocation endpoint).
 *   DISCOVERY  — sweep for undocumented endpoints, which must raise abnormalNavigation.
 *
 * `granted` is true only if the probe actually yielded something it should not have — for the
 * horizontal probes that means data DIFFERENT from the attacker's own, since an endpoint that
 * ignores the injected id and returns the caller's own record has contained the attempt.
 */
import {
  HOME_LAPTOP,
  IP_LONDON,
  IP_SYDNEY,
  PASSWORD,
  call,
  prepareEnrolledKnownDevice,
  prisma,
  sessionIdOf,
} from '../harness'
import { emptyOutput, type ScenarioOutput, type Trial } from '../types'

const SCENARIO = 6
const NAME = 'Lateral movement'

/** Distinct paths probed in the discovery sweep — comfortably over navigationBreadthLimit (8). */
const SWEEP_PATHS = [
  '/api/students',
  '/api/users',
  '/api/transcripts',
  '/api/staff',
  '/api/reports',
  '/api/config',
  '/api/backup',
  '/api/internal',
  '/api/debug',
  '/api/export',
  '/api/ledger',
  '/api/sessions',
]

export async function run(
  attackerStudentId: string,
  victimStudentId: string,
  rounds: number,
): Promise<ScenarioOutput> {
  const out = emptyOutput()

  // The attacker is a REAL student in good standing on their own trusted device — no newDevice,
  // no step-up. Anything blocked below is blocked on authorization, not on suspicion, which is
  // the stronger claim.
  out.authPerfSamples.push(...(await prepareEnrolledKnownDevice(attackerStudentId, HOME_LAPTOP)))

  const auth = await call('/api/auth/login', HOME_LAPTOP, {
    method: 'POST',
    body: { studentId: attackerStudentId, password: PASSWORD },
  })
  const token: string | undefined = auth.body?.token
  if (!token) {
    out.notes.push(`Scenario 6 SKIPPED: attacker ${attackerStudentId} could not log in (${auth.status}).`)
    return out
  }

  const push = (granted: boolean, detail: string): void => {
    out.trials.push({
      scenario: SCENARIO,
      scenarioName: NAME,
      label: 'attack',
      granted,
      decision: granted ? 'ALLOW' : 'DENY',
      detail,
    } satisfies Trial)
  }

  // Baselines: what this attacker legitimately sees. Any horizontal probe returning something
  // OTHER than these has escaped its lane.
  const ownFees = await call('/api/fees', HOME_LAPTOP, { token })
  const ownResults = await call('/api/results', HOME_LAPTOP, { token })
  const ownFeesJson = JSON.stringify(ownFees.body)
  const ownResultsJson = JSON.stringify(ownResults.body)

  for (let round = 0; round < rounds; round++) {
    // ── HORIZONTAL: another student's data via id injection ──────────────────────────────
    const victimQuery = `studentId=${encodeURIComponent(victimStudentId)}`

    const feesProbe = await call(`/api/fees?${victimQuery}`, HOME_LAPTOP, { token })
    const feesLeaked = feesProbe.status === 200 && JSON.stringify(feesProbe.body) !== ownFeesJson
    push(
      feesLeaked,
      feesLeaked
        ? `SECURITY FAILURE: /api/fees?${victimQuery} returned data other than the caller's own`
        : `fees id-injection contained (status ${feesProbe.status}, response identical to caller's own statement)`,
    )

    const resultsProbe = await call(`/api/results?${victimQuery}`, HOME_LAPTOP, { token })
    const resultsLeaked = resultsProbe.status === 200 && JSON.stringify(resultsProbe.body) !== ownResultsJson
    push(
      resultsLeaked,
      resultsLeaked
        ? `SECURITY FAILURE: /api/results?${victimQuery} returned another student's results`
        : `results id-injection contained (status ${resultsProbe.status}, response identical to caller's own)`,
    )

    // The token, not the query string, must decide whose profile comes back.
    const meProbe = await call(`/api/auth/me?${victimQuery}`, HOME_LAPTOP, { token })
    const identityConfused = meProbe.body?.student?.studentId === victimStudentId
    push(
      identityConfused,
      identityConfused
        ? `SECURITY FAILURE: /api/auth/me resolved to the victim (${victimStudentId})`
        : `identity held to the token (resolved to ${meProbe.body?.student?.studentId ?? 'unknown'}, not the victim)`,
    )

    // ── VERTICAL: privilege escalation to the admin surfaces ─────────────────────────────
    const adminProbes: Array<{ path: string; method?: string; body?: unknown; what: string }> = [
      { path: '/api/admin/audit', what: 'audit trail' },
      { path: `/api/admin/audit?${victimQuery}`, what: "victim's audit trail" },
      { path: '/api/admin/metrics', what: 'research metrics' },
      { path: '/api/admin/audit/verify/00000000-0000-0000-0000-000000000000', what: 'integrity verifier' },
      {
        path: `/api/admin/identity/${encodeURIComponent(victimStudentId)}/revoke`,
        method: 'POST',
        body: { reason: 'lateral movement probe' },
        what: "on-chain revocation of the victim's identity",
      },
    ]

    for (const probe of adminProbes) {
      const reply = await call(probe.path, HOME_LAPTOP, {
        token,
        method: probe.method,
        body: probe.body,
      })
      const escalated = reply.status === 200
      push(
        escalated,
        escalated
          ? `SECURITY FAILURE: student reached ${probe.what} (${probe.path})`
          : `${probe.what} refused to a student token (status ${reply.status})`,
      )
    }
  }

  // ── DISCOVERY: endpoint sweep, which must register as abnormal navigation ──────────────
  const sweepStatuses: number[] = []
  for (const path of SWEEP_PATHS) {
    const reply = await call(path, HOME_LAPTOP, { token })
    sweepStatuses.push(reply.status)
  }
  const sweepReached = sweepStatuses.some((s) => s === 200)

  // Read back what the engine actually recorded for this session. The PEP only returns a risk
  // score on a non-ALLOW response, so the DB is the honest place to check whether the new
  // navigation signal fired — rather than inferring it from a status code.
  const sessionId = sessionIdOf(token)
  const sweepEvents = await prisma.riskEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: SWEEP_PATHS.length,
    select: { riskScore: true, reasons: true },
  })
  const navigationFlagged = sweepEvents.some((e) => e.reasons.includes('abnormalNavigation'))
  const peakRisk = sweepEvents.reduce((max, e) => Math.max(max, e.riskScore), 0)

  // One trial for the sweep as a whole: `granted` is whether ANY probed path actually returned
  // data. Scoring it on the detection signal instead would be dishonest — the confusion matrix
  // measures access outcomes, not whether a heuristic happened to notice.
  push(
    sweepReached,
    sweepReached
      ? `SECURITY FAILURE: endpoint sweep reached a live resource (statuses ${[...new Set(sweepStatuses)].join(',')})`
      : `endpoint sweep across ${SWEEP_PATHS.length} undocumented paths yielded nothing ` +
          `(statuses ${[...new Set(sweepStatuses)].join(',')}); ` +
          `abnormalNavigation ${navigationFlagged ? `raised, peak risk ${peakRisk}` : `NOT raised (peak risk ${peakRisk}) — UNEXPECTED`}`,
  )

  // ── GEOVELOCITY: the same credential presented from another continent ─────────────────
  //
  // Distinct from the probes above, and the only place the impossibleTravel signal is
  // exercised at all: every other request in this harness originates on localhost, which
  // geo.ts deliberately refuses to place. Here the victim authenticates from London and the
  // same credential is replayed from Sydney seconds later — ~17,000 km apart, which no person
  // covers in the gap, so one of the two sessions is definitionally not them.
  const londonLogin = await call('/api/auth/login', HOME_LAPTOP, {
    method: 'POST',
    body: { studentId: victimStudentId, password: PASSWORD },
    ip: IP_LONDON,
  })

  const sydneyLogin = await call('/api/auth/login', HOME_LAPTOP, {
    method: 'POST',
    body: { studentId: victimStudentId, password: PASSWORD },
    ip: IP_SYDNEY,
  })

  const sydneyToken: string | undefined = sydneyLogin.body?.token
  const sydneyFees = sydneyToken
    ? await call('/api/fees', HOME_LAPTOP, { token: sydneyToken, ip: IP_SYDNEY })
    : null
  const travelGranted = sydneyFees?.status === 200

  // Confirm the ENGINE named the signal, rather than inferring it from the outcome — other
  // signals (a new network) would also block this, and that would not prove geovelocity works.
  const victimInternal = await prisma.student.findUnique({
    where: { studentId: victimStudentId },
    select: { id: true },
  })
  const travelEvents = victimInternal
    ? await prisma.riskEvent.findMany({
        where: { studentId: victimInternal.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { reasons: true, riskScore: true },
      })
    : []
  const travelFlagged = travelEvents.some((e) => e.reasons.includes('impossibleTravel'))
  const travelPeak = travelEvents.reduce((max, e) => Math.max(max, e.riskScore), 0)

  push(
    travelGranted,
    travelGranted
      ? `SECURITY FAILURE: credential replayed from Sydney seconds after a London login reached /api/fees`
      : `impossible travel London→Sydney contained (login ${londonLogin.status}→${sydneyLogin.status}, ` +
          `fees ${sydneyFees?.status ?? 'n/a'}); impossibleTravel ` +
          `${travelFlagged ? `raised, peak risk ${travelPeak}` : `NOT raised (peak risk ${travelPeak}) — UNEXPECTED`}`,
  )

  if (!travelFlagged) {
    out.notes.push('Scenario 6 WARNING: geovelocity signal did not fire on the London→Sydney replay.')
  }

  out.notes.push(
    `Scenario 6: ${rounds} round(s) of lateral-movement probes by legitimate student ${attackerStudentId} ` +
      `against ${victimStudentId} — ${out.trials.length} labelled attempts (horizontal id-injection, ` +
      `vertical privilege escalation, endpoint discovery).`,
  )
  if (!navigationFlagged) {
    out.notes.push('Scenario 6 WARNING: navigation-breadth signal did not fire during the discovery sweep.')
  }
  return out
}
