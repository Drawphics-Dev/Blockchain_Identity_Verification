/**
 * Phase 8 orchestrator (ROADMAP §6 Phase 8) — runs the five scripted security scenarios
 * against the live backend, in order, and writes one labelled report the Phase 9 metrics
 * engine (backend/evaluation/) consumes.
 *
 *   Prerequisites:  npm run dev   (backend running)   and   npm run db:seed   (data present)
 *   Run:            npm run sim            (full)
 *                   npm run sim -- --quick (smaller counts, for a fast smoke run)
 *
 * Scenarios 1–3 run first so there is a real, hash-chained audit history for Scenario 4 to
 * tamper with; Scenario 5 runs last because it waits on real background-monitor ticks.
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, pickStudents, prisma, tagSimulatedEvents } from './harness'
import { emptyOutput, type SimulationConfig, type SimulationReport } from './types'
import { run as genuineLogin } from './scenarios/s1-genuine-login'
import { run as invalidCredential } from './scenarios/s2-invalid-credential'
import { run as credentialTheft } from './scenarios/s3-credential-theft'
import { run as logTampering } from './scenarios/s4-log-tampering'
import { run as abnormalBehaviour } from './scenarios/s5-abnormal-behaviour'

const RESULTS_DIR = join(__dirname, 'results')

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/** A timestamp safe for a filename (no colons), derived from an ISO string. */
function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-')
}

async function main(): Promise<void> {
  const quick = process.argv.includes('--quick')

  const config: SimulationConfig = {
    genuineLogins: intEnv('SIM_GENUINE', quick ? 4 : 12),
    invalidCredentialAttempts: intEnv('SIM_INVALID', quick ? 4 : 10),
    credentialTheftAttempts: intEnv('SIM_THEFT', quick ? 3 : 8),
    tamperAttempts: intEnv('SIM_TAMPER', quick ? 3 : 6),
    abnormalSessions: intEnv('SIM_ABNORMAL', quick ? 1 : 2),
  }

  // Fail fast with a clear message if the backend isn't up — every scenario needs it.
  const health = await fetch(`${BASE_URL}/health`).catch(() => null)
  if (!health?.ok) {
    console.error(`\nBackend is not answering at ${BASE_URL}. Start it with \`npm run dev\`.\n`)
    process.exit(1)
  }
  const healthBody = (await health.json().catch(() => ({}))) as { ledger?: string }
  const ledger = healthBody.ledger ?? 'unknown'

  const startedAt = new Date().toISOString()
  const runStart = new Date()
  console.log(`\nPhase 8 — attack simulation against ${BASE_URL} (ledger: ${ledger})`)
  console.log(`Config: ${JSON.stringify(config)}\n`)

  // Allocate disjoint synthetic students so scenarios never contend for the same account.
  const GENUINE = 3
  const needed = GENUINE + 1 /* theft victim */ + 1 /* s4 operator */ + config.abnormalSessions
  const pool = await pickStudents(needed)
  const genuineStudents = pool.slice(0, GENUINE)
  const theftVictim = pool[GENUINE]
  const operator = pool[GENUINE + 1]
  const abnormalVictims = pool.slice(GENUINE + 2, GENUINE + 2 + config.abnormalSessions)

  const report: SimulationReport = {
    startedAt,
    finishedAt: '',
    baseUrl: BASE_URL,
    ledger,
    config,
    ...emptyOutput(),
  }

  const merge = (o: Awaited<ReturnType<typeof genuineLogin>>): void => {
    report.trials.push(...o.trials)
    report.tamperTrials.push(...o.tamperTrials)
    report.continuousTrials.push(...o.continuousTrials)
    report.authPerfSamples.push(...o.authPerfSamples)
    report.notes.push(...o.notes)
  }

  console.log('▶ Scenario 1 — genuine user login (ALLOW)')
  merge(await genuineLogin(genuineStudents, config.genuineLogins))

  console.log('▶ Scenario 2 — invalid credential login (DENY at auth)')
  merge(await invalidCredential(config.invalidCredentialAttempts))

  console.log('▶ Scenario 3 — credential stealing & imitation (STEP_UP → DENY)')
  merge(await credentialTheft(theftVictim, config.credentialTheftAttempts))

  console.log('▶ Scenario 4 — log tampering (integrity verifier flags mismatch)')
  merge(await logTampering(operator, config.tamperAttempts))

  console.log('▶ Scenario 5 — abnormal behaviour (mid-session TERMINATE) — this one waits on the monitor…')
  merge(await abnormalBehaviour(abnormalVictims))

  // Keep the live /metrics endpoint honest: mark this run's traffic as simulated. Best-effort —
  // a failure here must never discard the labelled report, which is the real deliverable.
  try {
    const usedIds = [...genuineStudents, theftVictim, operator, ...abnormalVictims]
    const tagged = await tagSimulatedEvents(usedIds, runStart)
    report.notes.push(`Tagged ${tagged} RiskEvent row(s) as simulated (excluded from live /metrics).`)
  } catch (err) {
    report.notes.push(`Could not tag simulated events: ${(err as Error).message}`)
  }

  report.finishedAt = new Date().toISOString()

  // Persist: a stable `simulation-latest.json` for Phase 9 to read, plus a timestamped archive.
  mkdirSync(RESULTS_DIR, { recursive: true })
  const latest = join(RESULTS_DIR, 'simulation-latest.json')
  const archive = join(RESULTS_DIR, `simulation-${fileStamp(startedAt)}.json`)
  const json = JSON.stringify(report, null, 2)
  writeFileSync(latest, json)
  writeFileSync(archive, json)

  printSummary(report)
  console.log(`\nReport written to:\n  ${latest}\n  ${archive}\n`)

  await prisma.$disconnect()
}

function printSummary(report: SimulationReport): void {
  const legit = report.trials.filter((t) => t.label === 'legitimate')
  const attack = report.trials.filter((t) => t.label === 'attack')
  const tp = legit.filter((t) => t.granted).length
  const fn = legit.length - tp
  const fp = attack.filter((t) => t.granted).length
  const tn = attack.length - fp
  const tamperDetected = report.tamperTrials.filter((t) => t.detected).length
  const terminated = report.continuousTrials.filter((t) => t.terminated).length

  console.log('\n' + '─'.repeat(60))
  console.log('Simulation summary (raw labelled outcomes — metrics are computed in Phase 9):')
  console.log(`  Trials: ${report.trials.length}  (legit ${legit.length}, attack ${attack.length})`)
  console.log(`  Confusion matrix:  TP=${tp}  FN=${fn}  FP=${fp}  TN=${tn}`)
  console.log(`  Tampering detected: ${tamperDetected}/${report.tamperTrials.length}`)
  console.log(`  Sessions terminated: ${terminated}/${report.continuousTrials.length}`)
  const surprises = report.trials.filter((t) => t.detail.includes('UNEXPECTED') || t.detail.includes('FAILURE'))
  if (fp > 0 || surprises.length > 0) {
    console.log(`  ⚠ ${fp} unauthorized grant(s) and ${surprises.length} surprise(s) — inspect the report.`)
  }
  console.log('─'.repeat(60))
}

main().catch(async (err) => {
  console.error('\nSimulation crashed:', err)
  await prisma.$disconnect()
  process.exit(1)
})
