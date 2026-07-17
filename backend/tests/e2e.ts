/**
 * End-to-end verification of the Zero Trust engine (ROADMAP §4, §5, Phase 6).
 *
 * Drives the REAL running backend over HTTP — no mocks, no stubs, no internal shortcuts —
 * and asserts the behaviour the roadmap actually claims. Every check either passes or fails
 * visibly; the process exits non-zero if any fails.
 *
 * The point is that none of the engine's claims should have to be taken on trust. Run:
 *
 *   npm run dev        (in one terminal)
 *   npm run test:e2e   (in another)
 *
 * Takes ~1 minute: the continuous-monitor check has to wait for a real background tick.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { generate } from 'otplib'
import { hashEvent } from '../src/ledger/hashEvent'
import { env } from '../src/config/env'
import { continuousMonitorIntervalMs, signalWeights, thresholds } from '../src/config/policy.config'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = 'demo1234'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// ── tiny test harness ────────────────────────────────────────────────────────

let passed = 0
const failures: string[] = []

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`)
  }
}

function section(title: string): void {
  console.log(`\n${title}`)
}

// ── a simulated device (this is what the engine fingerprints) ────────────────

interface Device {
  userAgent: string
  telemetry: string
}

const LAPTOP: Device = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
  telemetry: 'en-GB|Europe/London|1920x1080|8|Win32',
}
const ATTACKER_MACHINE: Device = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0',
  telemetry: 'ru-RU|Europe/Moscow|1366x768|2|Linux x86_64',
}

interface Reply {
  status: number
  body: any
}

async function call(
  path: string,
  device: Device,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<Reply> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': device.userAgent,
      'X-Device-Telemetry': device.telemetry,
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

const login = (studentId: string, device: Device, password = PASSWORD) =>
  call('/api/auth/login', device, { method: 'POST', body: { studentId, password } })

const stepUp = (token: string, device: Device, code: string) =>
  call('/api/auth/step-up', device, { method: 'POST', token, body: { code } })

/** Redeem the registrar's out-of-band token to reveal the QR. */
const getEnrollment = (jwt: string, device: Device, enrollmentToken: string) =>
  call(`/api/auth/mfa/enroll?token=${encodeURIComponent(enrollmentToken)}`, device, { token: jwt })

const enroll = (jwt: string, device: Device, enrollmentToken: string, code: string) =>
  call('/api/auth/mfa/enroll', device, {
    method: 'POST',
    token: jwt,
    body: { token: enrollmentToken, code },
  })

/** The token the registrar issued — the test harness reads it from the DB, standing in for
 * the out-of-band delivery (a letter, or handing it over in person). */
async function enrollmentTokenFor(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { studentId },
    select: { enrollmentToken: true },
  })
  return student.enrollmentToken ?? ''
}

/**
 * Answers whichever challenge this account is actually facing — enrollment on first use, a
 * plain step-up afterwards. Mirrors exactly what MfaChallenge does in the browser.
 */
async function answerMfa(studentId: string, jwt: string, device: Device): Promise<Reply> {
  const code = await totpFor(studentId)
  const enrollmentToken = await enrollmentTokenFor(studentId)
  if (!enrollmentToken) return stepUp(jwt, device, code) // token spent => already enrolled
  return enroll(jwt, device, enrollmentToken, code)
}

async function totpFor(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { studentId },
    select: { totpSecret: true },
  })
  return generate({ secret: student.totpSecret })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── test accounts ────────────────────────────────────────────────────────────

/**
 * Uses dedicated synthetic students so the run is deterministic and never disturbs whoever
 * you're clicking around as. Their device/network recognition is cleared first — that state
 * is precisely what the engine keys off, so it has to start from a known point.
 */
async function pickTestStudents(): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { NOT: { studentId: 'SU/CS/2023/0187' } },
    orderBy: { studentId: 'asc' },
    take: 3,
    select: { id: true, studentId: true },
  })
  if (students.length < 3) throw new Error('Need at least 3 synthetic students — run `npm run db:seed`.')

  const ids = students.map((s) => s.id)
  await prisma.device.deleteMany({ where: { studentId: { in: ids } } })
  await prisma.knownNetwork.deleteMany({ where: { studentId: { in: ids } } })

  // Un-enroll and re-issue a fresh registrar token, so the real first-time path (redeem token
  // → reveal QR → confirm code) is exercised rather than assumed — and so the suite stays
  // re-runnable, since enrolling deliberately burns the token.
  for (const [i, s] of students.entries()) {
    await prisma.student.update({
      where: { id: s.id },
      data: { mfaEnrolledAt: null, enrollmentToken: `E2ET-EST0-${String(i).padStart(4, '0')}` },
    })
  }

  // Let the identity anchor re-form on first login, so the anchoring path is exercised too.
  await prisma.ledgerIdentity.deleteMany({
    where: { studentId: { in: students.map((s) => s.studentId) } },
  })

  return students.map((s) => s.studentId)
}

// ── the tests ────────────────────────────────────────────────────────────────

async function main() {
  const health = await fetch(`${BASE_URL}/health`).catch(() => null)
  if (!health?.ok) {
    console.error(`Backend is not answering at ${BASE_URL}. Start it with \`npm run dev\`.`)
    process.exit(1)
  }

  const [alice, bob, mallory] = await pickTestStudents()
  console.log(`Zero Trust engine — end-to-end verification against ${BASE_URL}`)
  console.log(`Test accounts: ${alice}, ${bob}, ${mallory}`)

  // ── 1. Unrecognized device must demand step-up ─────────────────────────────
  section('1. An unrecognized device demands step-up MFA (ROADMAP §4.2)')

  check(
    'policy: newDevice alone reaches the STEP_UP threshold',
    signalWeights.newDevice >= thresholds.allowBelow,
    `newDevice=${signalWeights.newDevice} must be >= allowBelow=${thresholds.allowBelow}, or an ` +
      `unknown device is silently ALLOWed whenever no other signal fires`,
  )

  const first = await login(alice, LAPTOP)
  check('login from a new device succeeds but is flagged', first.status === 200 && first.body.stepUpRequired === true,
    `got status=${first.status} stepUpRequired=${first.body.stepUpRequired}`)
  const aliceToken: string = first.body.token

  // ── 2. Data must be unreachable until step-up is satisfied ─────────────────
  section('2. Protected data is unreachable until step-up is satisfied (PEP)')

  for (const resource of ['/api/courses', '/api/enrollments', '/api/fees', '/api/results']) {
    const r = await call(resource, LAPTOP, { token: aliceToken })
    check(`${resource} is blocked`, r.status === 403 && r.body.error === 'step_up_required',
      `got status=${r.status} error=${r.body.error}`)
  }

  // ── 3. Enrollment needs the registrar's token, not just the password ───────
  section("3. Enrolling an authenticator requires the registrar's out-of-band token")

  const aliceEnrollToken = await enrollmentTokenFor(alice)

  const noToken = await getEnrollment(aliceToken, LAPTOP, '')
  check('the QR is NOT revealed to a correct password alone',
    noToken.status === 403 && noToken.body.error === 'invalid_enrollment_token',
    `got status=${noToken.status} — without this, whoever signs in first binds the second factor, ` +
      'so a stolen password would defeat MFA outright on any not-yet-enrolled account')

  const wrongToken = await getEnrollment(aliceToken, LAPTOP, 'AAAA-BBBB-CCCC')
  check('a wrong enrollment token is refused', wrongToken.status === 403)

  const offer = await getEnrollment(aliceToken, LAPTOP, aliceEnrollToken)
  check('the correct enrollment token reveals the QR and key',
    offer.status === 200 && !!offer.body.qrDataUrl && !!offer.body.secret,
    `got status=${offer.status}`)

  const wrong = await enroll(aliceToken, LAPTOP, aliceEnrollToken, '000000')
  check('a wrong TOTP code is rejected and retryable',
    wrong.status === 400 && wrong.body.error === 'invalid_code',
    `got status=${wrong.status} error=${wrong.body.error}`)
  const stillBlocked = await call('/api/fees', LAPTOP, { token: aliceToken })
  check('data still blocked after a wrong code', stillBlocked.status === 403)

  // ── 4. Abandoning step-up must NOT whitelist the device ────────────────────
  section('4. Abandoning step-up does not whitelist the device')

  const second = await login(alice, LAPTOP) // never completed step-up above
  check('re-login from the same un-verified device is STILL challenged',
    second.body.stepUpRequired === true,
    'a cancelled step-up must not earn the device "known" status — otherwise anyone with the ' +
      'password could whitelist their machine just by attempting login and walking away')

  // ── 5. Enrolling an authenticator grants access ────────────────────────────
  section('5. Enrolling an authenticator satisfies the challenge and grants access')

  const aliceToken2: string = second.body.token
  const good = await answerMfa(alice, aliceToken2, LAPTOP)
  check('a code from the newly-scanned authenticator is accepted', good.status === 200 && good.body.ok === true,
    `got status=${good.status} body=${JSON.stringify(good.body)}`)

  const fees = await call('/api/fees', LAPTOP, { token: aliceToken2 })
  check('data now accessible', fees.status === 200 && !!fees.body.statement)

  // The QR is a one-time reveal, and the token is single-use: replaying the very token that
  // just worked must not reveal the secret again.
  const reReveal = await getEnrollment(aliceToken2, LAPTOP, aliceEnrollToken)
  check('the enrollment secret is never disclosed a second time',
    reReveal.status === 409 && reReveal.body.error === 'already_enrolled',
    `got status=${reReveal.status} — an enrolled account must not re-reveal its TOTP secret`)

  const spentToken = await prisma.student.findUniqueOrThrow({
    where: { studentId: alice },
    select: { enrollmentToken: true },
  })
  check('the enrollment token is consumed on use', spentToken.enrollmentToken === null)

  // ── 6. A proven device is remembered ───────────────────────────────────────
  section('6. A verified device is remembered on the next login')

  const third = await login(alice, LAPTOP)
  check('same device no longer challenged', third.body.stepUpRequired === false)

  // ── 7. THE REGRESSION: new device on a KNOWN network ───────────────────────
  section('7. A stolen password from a NEW device is still challenged (credential theft)')

  const theft = await login(alice, ATTACKER_MACHINE)
  check('attacker with the correct password is challenged for MFA',
    theft.body.stepUpRequired === true,
    'the network is already known at this point, so ONLY the new-device signal can catch ' +
      'this — the exact case that regressed when newDevice(25) sat below allowBelow(30)')

  const attackerToken: string = theft.body.token
  const theftFees = await call('/api/fees', ATTACKER_MACHINE, { token: attackerToken })
  check('attacker cannot reach the data', theftFees.status === 403)

  const attackerEnroll = await getEnrollment(attackerToken, ATTACKER_MACHINE, 'GUES-SEDT-OKEN')
  check('attacker cannot obtain the enrollment secret on an ENROLLED account',
    attackerEnroll.status === 409,
    `got status=${attackerEnroll.status} — if this hands over the secret, MFA protects nothing`)

  const attackerGuess = await stepUp(attackerToken, ATTACKER_MACHINE, '123456')
  check('attacker cannot guess the TOTP code', attackerGuess.status === 400)

  // ── 7b. The hole this closed: a NEVER-ENROLLED account ────────────────────
  // Mallory has never set up an authenticator. Before the enrollment token existed, a thief
  // with her password was simply handed the QR and bound their own phone — MFA stopped
  // nothing, and ROADMAP scenario 3 (credential theft ⇒ DENY) silently failed.
  section('7b. A thief cannot enrol their own authenticator on a never-enrolled account')

  const preyLogin = await login(mallory, ATTACKER_MACHINE)
  const preyToken: string = preyLogin.body.token
  check('the never-enrolled victim is challenged', preyLogin.body.stepUpRequired === true)

  const stealEnrollment = await getEnrollment(preyToken, ATTACKER_MACHINE, '')
  check('thief with the password is REFUSED the enrollment QR',
    stealEnrollment.status === 403 && stealEnrollment.body.error === 'invalid_enrollment_token',
    `got status=${stealEnrollment.status} — a stolen password must not be enough to bind a second factor`)

  const stealGuess = await enroll(preyToken, ATTACKER_MACHINE, 'FAKE-TOKE-NXXX', '123456')
  check('thief guessing an enrollment token is refused', stealGuess.status === 403)

  const preyData = await call('/api/results', ATTACKER_MACHINE, { token: preyToken })
  check('thief never reaches the data', preyData.status === 403)

  // ── 8. Wrong password is refused outright ─────────────────────────────────
  section('8. Invalid credentials are refused at authentication')

  const badPassword = await login(bob, LAPTOP, 'not-the-password')
  check('wrong password rejected', badPassword.status === 401 &&
    badPassword.body.error === 'invalid_credentials')

  // ── 9. Every decision reaches the ledger, hash-chained ────────────────────
  section('9. Every decision is written to the ledger, correctly hash-chained')

  const chain = await prisma.ledgerAuditRecord.findMany({ orderBy: { seq: 'asc' } })
  check('the ledger has recorded this run', chain.length > 0, `${chain.length} records`)

  let chainSound = true
  let brokenAt = ''
  const GENESIS = '0'.repeat(64)
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i]
    const expectedPrev = i === 0 ? GENESIS : chain[i - 1].hash
    const recomputed = hashEvent(
      {
        eventId: rec.eventId,
        studentId: rec.studentId,
        resource: rec.resource,
        decision: rec.decision as any,
        riskScore: rec.riskScore,
        timestamp: rec.timestamp.toISOString(),
      },
      rec.prevHash,
    )
    if (rec.prevHash !== expectedPrev || recomputed !== rec.hash) {
      chainSound = false
      brokenAt = `seq=${rec.seq} eventId=${rec.eventId}`
      break
    }
  }
  check('the hash chain is unbroken and every link recomputes',
    chainSound,
    chainSound ? '' : `chain breaks at ${brokenAt} — concurrent appends may have forked it`)

  // ── 10. Tamper detection ──────────────────────────────────────────────────
  section('10. Tampering with the off-chain copy is detected (ROADMAP §5)')

  const victim = await prisma.auditMirror.findFirst({ orderBy: { createdAt: 'desc' } })
  if (!victim) {
    check('an audit-mirror row exists to tamper with', false)
  } else {
    const clean = await call(`/api/admin/audit/verify/${victim.eventId}`, LAPTOP, { token: aliceToken2 })
    check('an untampered record verifies as valid', clean.body.valid === true)

    const original = victim.riskScore
    await prisma.auditMirror.update({
      where: { eventId: victim.eventId },
      data: { riskScore: original === 0 ? 99 : 0, decision: 'ALLOW' },
    })
    const tampered = await call(`/api/admin/audit/verify/${victim.eventId}`, LAPTOP, { token: aliceToken2 })
    check('the tampered record is flagged',
      tampered.body.valid === false,
      `verifier returned valid=${tampered.body.valid} — it must catch the mismatch against the ledger`)
    check('the ledger copy is untouched by the tampering',
      tampered.body.expectedHash !== tampered.body.actualHash)

    await prisma.auditMirror.update({
      where: { eventId: victim.eventId },
      data: { riskScore: original, decision: victim.decision },
    })
  }

  // ── 11. On-chain revocation beats a correct password ──────────────────────
  section('11. A revoked identity cannot log in, even with the right password')

  // MOCK-ONLY, deliberately. This section reaches past LedgerService into MockLedger's own
  // table, because it needs two things the real ledger does not offer:
  //   - to revoke without the app having a revoke route, and
  //   - to DELETE the anchor afterwards so the run repeats (line below).
  // An append-only ledger has no delete and no un-revoke — re-registering preserves `revoked`
  // by design — so running this under LEDGER=fabric would permanently revoke `mallory` and
  // break the credential-stealing scenario above on the next run. The Fabric equivalent lives
  // in tests/fabric-check.ts, which asserts the same property against the chaincode.
  if (env.ledger === 'fabric') {
    console.log('  SKIP  mock-only section (see tests/fabric-check.ts for the Fabric equivalent)')
  } else {
    await revocationChecks()
  }

  async function revocationChecks(): Promise<void> {
  await login(mallory, LAPTOP) // anchors the identity
  const anchor = await prisma.ledgerIdentity.findUnique({ where: { studentId: mallory } })
  check('an identity anchor was written on first login', !!anchor)

  await prisma.ledgerIdentity.update({ where: { studentId: mallory }, data: { revoked: true } })
  const revoked = await login(mallory, LAPTOP, PASSWORD) // password is still CORRECT
  check('revoked identity is refused despite the correct password',
    revoked.status === 403 && revoked.body.error === 'identity_revoked',
    `got status=${revoked.status} error=${revoked.body.error} — this is the property bcrypt alone cannot give`)

  await prisma.ledgerIdentity.delete({ where: { studentId: mallory } }) // leave it re-runnable
  }

  // ── 12. Continuous verification: mid-session termination ──────────────────
  section('12. Continuous verification terminates a hijacked session (ROADMAP §4.3)')

  // Enrol Bob's laptop properly, so his next login needs no MFA and the session is "clean".
  const bobFirst = await login(bob, LAPTOP)
  await answerMfa(bob, bobFirst.body.token, LAPTOP)
  const bobLogin = await login(bob, LAPTOP)
  check('bob signs in normally from his known device', bobLogin.body.stepUpRequired === false)
  const bobToken: string = bobLogin.body.token

  // Now the same token is replayed from a different machine — a stolen-session attack. The
  // PEP scores each of these as newDevice, and the background monitor should end the session
  // WITHOUT any further request from the real user.
  for (let i = 0; i < 4; i++) {
    await call('/api/results', ATTACKER_MACHINE, { token: bobToken })
    await sleep(200)
  }

  const bobSessionId = sessionIdOf(bobToken)
  const deadline = Date.now() + continuousMonitorIntervalMs * 3 + 10_000
  let bobSession = await prisma.session.findUniqueOrThrow({ where: { id: bobSessionId } })
  while (Date.now() < deadline && bobSession.revokedBy !== 'TERMINATED') {
    await sleep(2000)
    bobSession = await prisma.session.findUniqueOrThrow({ where: { id: bobSessionId } })
  }

  check('the hijacked session was terminated by the background monitor',
    bobSession.revokedBy === 'TERMINATED',
    `revokedBy=${bobSession.revokedBy} — the monitor must end it with no new request from the user`)
  check('an anomaly timestamp was recorded for the detection-time metric',
    bobSession.firstAnomalyAt !== null)

  if (bobSession.revokedAt && bobSession.firstAnomalyAt) {
    const seconds = (bobSession.revokedAt.getTime() - bobSession.firstAnomalyAt.getTime()) / 1000
    console.log(`        mean anomaly detection time for this session: ${seconds.toFixed(1)}s`)
  }

  const afterKill = await call('/api/courses', LAPTOP, { token: bobToken })
  check('the terminated token is dead everywhere', afterKill.status === 401)

  // ── summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60))
  if (failures.length === 0) {
    console.log(`ALL ${passed} CHECKS PASSED`)
  } else {
    console.log(`${passed} passed, ${failures.length} FAILED:`)
    failures.forEach((f) => console.log(`  - ${f}`))
  }
  console.log('─'.repeat(60))

  await prisma.$disconnect()
  process.exit(failures.length === 0 ? 0 : 1)
}

/** The JWT's `jti` is the Session row id — decode it without verifying (we only need the id). */
function sessionIdOf(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return payload.jti as string
}

main().catch(async (err) => {
  console.error('\nTest run crashed:', err)
  await prisma.$disconnect()
  process.exit(1)
})
