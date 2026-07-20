/**
 * Phase 9 orchestrator (ROADMAP §6 Phase 9, §7) — reads the Phase 8 labelled report, computes
 * every metric group + the CES, prints a console summary and exports JSON + CSV + a
 * self-contained HTML chart.
 *
 *   Run (after a simulation):  npm run evaluate
 *   Point at a specific file:  npm run evaluate -- path/to/simulation-*.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SimulationReport } from '../simulation/types'
import { buildReport, toCsv, toHtml, type MetricsReport } from './report'

const SIM_LATEST = join(__dirname, '..', 'simulation', 'results', 'simulation-latest.json')
const RESULTS_DIR = join(__dirname, 'results')

function fileStamp(iso: string): string {
  return iso.replace(/[:.]/g, '-')
}

function loadSimulation(): SimulationReport {
  const path = process.argv[2] ? process.argv[2] : SIM_LATEST
  if (!existsSync(path)) {
    console.error(
      `\nNo simulation report at:\n  ${path}\n\nRun the Phase 8 simulation first: \`npm run sim\`.\n`,
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SimulationReport
}

function printSummary(r: MetricsReport): void {
  const p = (x: number | null, suffix = ''): string => (x === null ? 'n/a' : `${x}${suffix}`)
  console.log('\n' + '═'.repeat(60))
  console.log('  ZERO TRUST — EVALUATION METRICS (ROADMAP §7)')
  console.log('═'.repeat(60))
  console.log(`  Ledger: ${r.source.ledger}   Trials: ${r.source.counts.trials}`)
  const c = r.accessControl.confusion
  console.log(`\n  Confusion matrix:  TP=${c.tp}  FN=${c.fn}  FP=${c.fp}  TN=${c.tn}`)
  console.log('\n  (a) Access-control effectiveness')
  console.log(`      TAR ${p(r.accessControl.tar)}   FRR ${p(r.accessControl.frr)}   FAR ${p(r.accessControl.far)}`)
  console.log('\n  (b) Attack resistance')
  console.log(`      ${p(r.attackResistance.percent, '%')}  (${r.attackResistance.blocked}/${r.attackResistance.total} blocked)`)
  console.log('\n  (c) Continuous-validation effectiveness')
  console.log(`      Session termination rate ${p(r.continuousValidation.sessionTerminationRate, '%')}`)
  console.log(`      Mean anomaly detection   ${p(r.continuousValidation.meanAnomalyDetectionSeconds, 's')}`)
  console.log('\n  (d) Audit integrity')
  console.log(`      ${p(r.auditIntegrity.percent, '%')}  (${r.auditIntegrity.detected}/${r.auditIntegrity.total} detected)`)
  console.log('\n  Authentication performance (PROVISIONAL — see notes)')
  console.log(`      Mean login ${p(r.authenticationPerformance.meanLoginMs, 'ms')}   ` +
    `score ${p(r.authenticationPerformance.score)}  ` +
    `(full marks ≤${r.authenticationPerformance.targetMs}ms, zero ≥${r.authenticationPerformance.ceilingMs}ms)`)
  console.log('\n  ' + '─'.repeat(56))
  console.log(`  CES (incl. provisional auth-perf): ${p(r.ces.ces)} / 100`)
  console.log(`  CES (excl. auth-perf):             ${p(r.ces.cesExcludingAuthPerformance)} / 100`)
  console.log('═'.repeat(60))
}

function main(): void {
  const sim = loadSimulation()
  const report = buildReport(sim)

  mkdirSync(RESULTS_DIR, { recursive: true })
  const stamp = fileStamp(report.generatedAt)
  const outputs: Array<[string, string]> = [
    ['metrics-latest.json', JSON.stringify(report, null, 2)],
    [`metrics-${stamp}.json`, JSON.stringify(report, null, 2)],
    ['metrics-latest.csv', toCsv(report)],
    ['metrics-latest.html', toHtml(report)],
  ]
  for (const [name, content] of outputs) writeFileSync(join(RESULTS_DIR, name), content)

  printSummary(report)
  console.log('\n  Written:')
  for (const [name] of outputs) console.log(`    evaluation/results/${name}`)
  console.log(`\n  Open evaluation/results/metrics-latest.html in a browser for the chart.\n`)

  for (const note of report.notes) console.log(`  • ${note}`)
  console.log('')
}

main()
