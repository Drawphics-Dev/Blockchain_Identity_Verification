/**
 * Simulation harness (ROADMAP §6 Phase 8).
 *
 * Drives the REAL running backend over HTTP — no mocks, no internal shortcuts — exactly the
 * way the browser and the e2e suite do, so the scenarios exercise the true Zero Trust path
 * (auth → PDP → PEP → ledger). The one place it reaches past HTTP is the database, and only
 * for things a real operator legitimately holds out of band or does administratively:
 *   - reading a student's TOTP secret / enrollment token (stands in for the registrar's
 *     out-of-band delivery — same shortcut the e2e suite takes),
 *   - resetting a synthetic account to a known state so a run is deterministic and re-runnable,
 *   - editing the off-chain audit mirror to *simulate tampering* (Scenario 4).
 *
 * Requires the backend running (`npm run dev`) and the DB seeded (`npm run db:seed`).
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { generate } from 'otplib'
import type { AuthPerfSample } from './types'

export const BASE_URL = process.env.SIM_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/** The demo password every seeded student shares (prisma/seed.ts DEMO_PASSWORD). */
export const PASSWORD = 'demo1234'

/** The hand-authored hero student — excluded from the synthetic pool so the simulation never
 * disturbs the account you click around as in the portal. */
export const HERO_STUDENT_ID = 'SU/CS/2023/0187'

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

// ── simulated devices (what the engine fingerprints — see zerotrust/fingerprint.ts) ──────

export interface Device {
  userAgent: string
  telemetry: string
}

/** A student's own, trusted machine. */
export const HOME_LAPTOP: Device = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36',
  telemetry: 'en-GB|Europe/London|1920x1080|8|Win32',
}

/** An attacker's machine — a different OS, locale and timezone, so it fingerprints
 * differently from the victim's home laptop and trips the newDevice signal. */
export const ATTACKER_MACHINE: Device = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0',
  telemetry: 'ru-RU|Europe/Moscow|1366x768|2|Linux x86_64',
}

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────

export interface Reply {
  status: number
  body: any
  /** Wall-clock latency of the round-trip, ms — the raw input to Authentication Performance. */
  ms: number
}

export async function call(
  path: string,
  device: Device,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<Reply> {
  const started = Date.now()
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
  const ms = Date.now() - started
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, ms }
}

export const login = (studentId: string, device: Device, password = PASSWORD) =>
  call('/api/auth/login', device, { method: 'POST', body: { studentId, password } })

export const stepUp = (token: string, device: Device, code: string) =>
  call('/api/auth/step-up', device, { method: 'POST', token, body: { code } })

export const getEnrollment = (jwt: string, device: Device, enrollmentToken: string) =>
  call(`/api/auth/mfa/enroll?token=${encodeURIComponent(enrollmentToken)}`, device, { token: jwt })

export const enroll = (jwt: string, device: Device, enrollmentToken: string, code: string) =>
  call('/api/auth/mfa/enroll', device, {
    method: 'POST',
    token: jwt,
    body: { token: enrollmentToken, code },
  })

// ── DB-assisted helpers (the out-of-band / administrative shortcuts) ───────────────────────

export async function totpFor(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { studentId },
    select: { totpSecret: true },
  })
  return generate({ secret: student.totpSecret })
}

export async function enrollmentTokenFor(studentId: string): Promise<string> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { studentId },
    select: { enrollmentToken: true },
  })
  return student.enrollmentToken ?? ''
}

/**
 * Answers whichever MFA challenge this account is actually facing — enrollment on first use,
 * a plain step-up afterwards — exactly as MfaChallenge does in the browser and answerMfa does
 * in the e2e suite. Returns the reply plus the round-trip latency for the auth-perf metric.
 */
export async function answerMfa(studentId: string, jwt: string, device: Device): Promise<Reply> {
  const code = await totpFor(studentId)
  const enrollmentToken = await enrollmentTokenFor(studentId)
  const reply = enrollmentToken
    ? await enroll(jwt, device, enrollmentToken, code)
    : await stepUp(jwt, device, code)
  return reply
}

/** The JWT's `jti` is the Session row id (see auth/jwt.ts). Decode without verifying — we
 * only need the id to look the session up in the DB for the continuous-validation metric. */
export function sessionIdOf(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  return payload.jti as string
}

/**
 * Return `count` synthetic students (matriculation numbers), deterministically, excluding the
 * hero account. Deterministic order keeps runs reproducible and lets the orchestrator hand
 * disjoint slices to different scenarios so they never fight over the same account.
 */
export async function pickStudents(count: number): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { NOT: { studentId: HERO_STUDENT_ID } },
    orderBy: { studentId: 'asc' },
    take: count,
    select: { studentId: true },
  })
  if (students.length < count) {
    throw new Error(
      `Need at least ${count} synthetic students but found ${students.length}. Run \`npm run db:seed\`.`,
    )
  }
  return students.map((s) => s.studentId)
}

/**
 * Reset a synthetic student to a clean, known baseline so a scenario starts from a fixed point
 * (the engine keys entirely off device/network recognition + enrollment state, so those must
 * be reset or a re-run behaves differently from the first):
 *   - forget every recognized device and network,
 *   - un-enroll MFA and re-issue a fresh single-use enrollment token,
 *   - drop the on-chain identity anchor so first login re-anchors it (exercises that path).
 */
export async function resetStudent(studentId: string): Promise<void> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { studentId },
    select: { id: true },
  })
  await prisma.device.deleteMany({ where: { studentId: student.id } })
  await prisma.knownNetwork.deleteMany({ where: { studentId: student.id } })
  await prisma.ledgerIdentity.deleteMany({ where: { studentId } })
  await prisma.student.update({
    where: { id: student.id },
    // A fresh, unique token so the enrollment path is genuinely exercised and re-runnable.
    data: {
      mfaEnrolledAt: null,
      enrollmentToken: `SIM-${studentId.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase().padStart(8, 'X')}`,
    },
  })
}

/**
 * Bring a student to the steady state a returning genuine user is in: MFA enrolled and their
 * `device` recognized, so a later login from that same device is a clean ALLOW with no step-up.
 * Runs the real first-login → enroll flow over HTTP, capturing login + MFA latencies for the
 * auth-perf metric. Returns those samples so the caller can fold them into the report.
 */
export async function prepareEnrolledKnownDevice(
  studentId: string,
  device: Device,
): Promise<AuthPerfSample[]> {
  await resetStudent(studentId)
  const samples: AuthPerfSample[] = []

  const first = await login(studentId, device)
  samples.push({ phase: 'login', ms: first.ms })
  if (first.status !== 200 || !first.body.token) {
    throw new Error(`prepare: login failed for ${studentId} (status ${first.status})`)
  }

  const mfa = await answerMfa(studentId, first.body.token, device)
  samples.push({ phase: 'mfa_verify', ms: mfa.ms })
  if (mfa.status !== 200 || mfa.body.ok !== true) {
    throw new Error(`prepare: MFA enrollment failed for ${studentId} (status ${mfa.status})`)
  }
  return samples
}

/** Best-effort: mark every RiskEvent these students generated during the run as `simulated`,
 * so the live /metrics endpoint can keep excluding harness traffic (schema: RiskEvent.simulated).
 * Wrapped by the caller in try/catch — a failure here must never fail the run's real output. */
export async function tagSimulatedEvents(studentIds: string[], since: Date): Promise<number> {
  const internal = await prisma.student.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true },
  })
  const res = await prisma.riskEvent.updateMany({
    where: { studentId: { in: internal.map((s) => s.id) }, createdAt: { gte: since } },
    data: { simulated: true },
  })
  return res.count
}
