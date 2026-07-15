/**
 * Scenario 4 — Log tampering trial → integrity verifier flags the mismatch (ROADMAP §5, §6,
 * feeds Audit integrity §7d).
 *
 * The attacker has database access and edits the off-chain audit mirror to rewrite history —
 * changing a risk score or a decision after the fact. The on-chain record is immutable, so the
 * integrity verifier recomputes the hash from the CURRENT mirror row and compares it to the
 * ledger: any edit breaks the match and is detected. We tamper, verify (expect detected), then
 * restore each row so the run stays repeatable. Audit integrity = detected / tampered.
 */
import { HOME_LAPTOP, call, login, prepareEnrolledKnownDevice, prisma } from '../harness'
import { emptyOutput, type ScenarioOutput } from '../types'

export async function run(operatorStudentId: string, count: number): Promise<ScenarioOutput> {
  const out = emptyOutput()

  // Any authenticated session can call the verifier (it is behind requireAuth, not the PEP).
  await prepareEnrolledKnownDevice(operatorStudentId, HOME_LAPTOP)
  const auth = await login(operatorStudentId, HOME_LAPTOP)
  const token: string | undefined = auth.body?.token
  if (!token) throw new Error(`Scenario 4: could not obtain an operator token (login ${auth.status}).`)

  // Tamper the freshest mirror rows — those were just written by scenarios 1–3, so there is
  // always a real, hash-chained history to attack rather than a contrived one.
  const rows = await prisma.auditMirror.findMany({ orderBy: { createdAt: 'desc' }, take: count })
  if (rows.length === 0) {
    out.notes.push('Scenario 4: no audit-mirror rows to tamper with — run earlier scenarios first.')
    return out
  }

  for (const row of rows) {
    const verifyPath = `/api/admin/audit/verify/${row.eventId}`

    // Baseline: the untampered record must verify as valid, or the test proves nothing.
    const clean = await call(verifyPath, HOME_LAPTOP, { token })
    const wasValid = clean.body?.valid === true

    // Tamper in place: flip the risk score and decision to values that cannot equal the
    // originals, so the recomputed hash is guaranteed to differ.
    await prisma.auditMirror.update({
      where: { eventId: row.eventId },
      data: { riskScore: row.riskScore === 99 ? 0 : 99, decision: row.decision === 'ALLOW' ? 'DENY' : 'ALLOW' },
    })

    const after = await call(verifyPath, HOME_LAPTOP, { token })
    const detected = after.body?.valid === false

    // Restore, so nothing is left corrupted and the scenario is re-runnable.
    await prisma.auditMirror.update({
      where: { eventId: row.eventId },
      data: { riskScore: row.riskScore, decision: row.decision },
    })

    out.tamperTrials.push({ eventId: row.eventId, tampered: true, detected })

    if (!wasValid) {
      out.notes.push(`Scenario 4: WARNING — ${row.eventId} did not verify clean before tampering.`)
    }
  }

  out.notes.push(`Scenario 4: ${rows.length} tampering trial(s); each edit re-verified against the ledger.`)
  return out
}
