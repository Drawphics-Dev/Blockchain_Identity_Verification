/**
 * The computed-metrics report shape (Phase 9 output) and its serializers to CSV and a
 * self-contained HTML chart. Kept separate from metrics.ts (pure math) and run.ts (I/O).
 */
import type { SimulationReport } from '../simulation/types'
import {
  accessControl,
  attackResistance,
  auditIntegrity,
  authPerformance,
  computeCes,
  continuousValidation,
  type AccessControlMetrics,
  type AuthPerformanceMetrics,
  type CesResult,
  type ContinuousMetrics,
} from './metrics'

export interface MetricsReport {
  generatedAt: string
  source: {
    startedAt: string
    finishedAt: string
    ledger: string
    baseUrl: string
    config: SimulationReport['config']
    counts: { trials: number; tamperTrials: number; continuousTrials: number; authPerfSamples: number }
  }
  accessControl: AccessControlMetrics
  attackResistance: ReturnType<typeof attackResistance>
  continuousValidation: ContinuousMetrics
  auditIntegrity: ReturnType<typeof auditIntegrity>
  authenticationPerformance: AuthPerformanceMetrics
  ces: CesResult
  notes: string[]
}

export function buildReport(sim: SimulationReport): MetricsReport {
  const ces = computeCes(sim)
  const notes: string[] = [
    'Confusion matrix (TAR/FAR/FRR) is computed from the access-control scenarios (1, 2, 3 and 6) ' +
      'only, per the ROADMAP Phase 8 scenario→metric mapping. Scenario 6 (lateral movement) is ' +
      'grouped with 2 and 3: all three are unauthorized attempts to reach protected data.',
    `Sample sizes (ROADMAP §8 requires reporting counts alongside the rates): ${sim.trials.length} ` +
      `labelled access trials — ${sim.trials.filter((t) => t.label === 'legitimate').length} legitimate, ` +
      `${sim.trials.filter((t) => t.label === 'attack').length} attack; ` +
      `${sim.tamperTrials.length} tampering attempts; ${sim.continuousTrials.length} risky sessions.`,
    'Authentication Performance remains PROVISIONAL pending client confirmation: ROADMAP §7 Table 1 ' +
      'assigns it 10% but never defines it alongside the other three components. It is scored ' +
      'against published HCI response-time thresholds — full marks at or under 3000 ms (web ' +
      'response threshold), zero at or above 10000 ms (Nielsen\'s limit of attention), linear ' +
      'between. Both anchors are drawn from the literature rather than from the measured result. ' +
      'Two CES values are reported: one including this component, one excluding it (its 10% weight ' +
      'redistributed across the three defined components).',
  ]
  return {
    generatedAt: new Date().toISOString(),
    source: {
      startedAt: sim.startedAt,
      finishedAt: sim.finishedAt,
      ledger: sim.ledger,
      baseUrl: sim.baseUrl,
      config: sim.config,
      counts: {
        trials: sim.trials.length,
        tamperTrials: sim.tamperTrials.length,
        continuousTrials: sim.continuousTrials.length,
        authPerfSamples: sim.authPerfSamples.length,
      },
    },
    accessControl: accessControl(sim.trials),
    attackResistance: attackResistance(sim.trials),
    continuousValidation: continuousValidation(sim),
    auditIntegrity: auditIntegrity(sim),
    authenticationPerformance: authPerformance(sim),
    ces,
    notes,
  }
}

/** Flat key,value CSV — the format the brief asks for, easy to drop into a report or sheet. */
export function toCsv(r: MetricsReport): string {
  const rows: Array<[string, string | number | null]> = [
    ['metric', 'value'],
    ['ledger', r.source.ledger],
    ['trials', r.source.counts.trials],
    ['TP', r.accessControl.confusion.tp],
    ['FN', r.accessControl.confusion.fn],
    ['FP', r.accessControl.confusion.fp],
    ['TN', r.accessControl.confusion.tn],
    ['TAR', r.accessControl.tar],
    ['FRR', r.accessControl.frr],
    ['FAR', r.accessControl.far],
    ['attack_resistance_percent', r.attackResistance.percent],
    ['session_termination_rate_percent', r.continuousValidation.sessionTerminationRate],
    ['mean_anomaly_detection_seconds', r.continuousValidation.meanAnomalyDetectionSeconds],
    ['audit_integrity_percent', r.auditIntegrity.percent],
    ['mean_login_ms', r.authenticationPerformance.meanLoginMs],
    ['mean_mfa_verify_ms', r.authenticationPerformance.meanMfaVerifyMs],
    ['auth_performance_score_provisional', r.authenticationPerformance.score],
    ['ces_component_access_control', r.ces.components.accessControl],
    ['ces_component_continuous_validation', r.ces.components.continuousValidation],
    ['ces_component_audit_integrity', r.ces.components.auditIntegrity],
    ['ces_component_auth_performance_provisional', r.ces.components.authenticationPerformance],
    ['CES_including_provisional_auth_perf', r.ces.ces],
    ['CES_excluding_auth_perf', r.ces.cesExcludingAuthPerformance],
  ]
  return rows.map(([k, v]) => `${k},${v ?? 'n/a'}`).join('\n') + '\n'
}

// ── self-contained HTML chart (no external assets — opens straight in a browser) ───────────

const bar = (label: string, value: number | null, max: number, good: 'high' | 'low', unit = ''): string => {
  const v = value ?? 0
  const width = Math.max(0, Math.min(100, (v / max) * 100))
  // "low is good" metrics (FRR/FAR) turn red as they grow; "high is good" turn green as they grow.
  const ratio = good === 'high' ? v / max : 1 - v / max
  const hue = Math.round(clamp(ratio, 0, 1) * 120) // 0=red → 120=green
  const shown = value === null ? 'n/a' : `${value}${unit}`
  return `
    <div class="row">
      <div class="label">${label}</div>
      <div class="track"><div class="fill" style="width:${width}%;background:hsl(${hue} 70% 45%)"></div></div>
      <div class="value">${shown}</div>
    </div>`
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

export function toHtml(r: MetricsReport): string {
  const c = r.accessControl.confusion
  const ces = r.ces.ces ?? 0
  const cesExcl = r.ces.cesExcludingAuthPerformance
  const cesHue = Math.round(clamp(ces / 100, 0, 1) * 120)
  const pct100 = (x: number | null): number | null => (x === null ? null : x)

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Zero Trust Evaluation — CES ${r.ces.ces ?? 'n/a'}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem;
         background: #0f1420; color: #e7ecf3; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  .sub { color: #8b97a8; margin: 0 0 1.5rem; font-size: .85rem; }
  .card { background: #172033; border: 1px solid #232f47; border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }
  h2 { font-size: .8rem; text-transform: uppercase; letter-spacing: .08em; color: #8b97a8; margin: 0 0 1rem; }
  .row { display: grid; grid-template-columns: 190px 1fr 70px; align-items: center; gap: .75rem; margin: .5rem 0; }
  .label { color: #c3cdda; font-size: .9rem; }
  .track { background: #0f1728; border-radius: 6px; height: 18px; overflow: hidden; }
  .fill { height: 100%; border-radius: 6px; transition: width .3s; }
  .value { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .ces { display: flex; align-items: center; gap: 1.5rem; }
  .gauge { --v: ${ces}; width: 120px; height: 120px; border-radius: 50%; flex: none;
           background: conic-gradient(hsl(${cesHue} 70% 45%) calc(var(--v) * 1%), #0f1728 0);
           display: grid; place-items: center; }
  .gauge > div { width: 88px; height: 88px; border-radius: 50%; background: #172033; display: grid; place-items: center;
                 font-size: 1.6rem; font-weight: 700; }
  .matrix { display: grid; grid-template-columns: repeat(2, 1fr); gap: .5rem; max-width: 360px; }
  .cell { background: #0f1728; border-radius: 8px; padding: .6rem .8rem; }
  .cell .k { color: #8b97a8; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
  .cell .n { font-size: 1.4rem; font-weight: 700; }
  .good { color: #4ade80; } .bad { color: #f87171; }
  ul.notes { color: #a6b2c2; font-size: .82rem; padding-left: 1.1rem; margin: .5rem 0 0; }
  code { background:#0f1728; padding:.1rem .3rem; border-radius:4px; }
</style></head>
<body><div class="wrap">
  <h1>Zero Trust — Evaluation Results</h1>
  <p class="sub">Ledger: <code>${r.source.ledger}</code> · ${r.source.counts.trials} labelled trials ·
     generated ${r.generatedAt.slice(0, 19).replace('T', ' ')} UTC</p>

  <div class="card">
    <h2>Composite Effectiveness Score</h2>
    <div class="ces">
      <div class="gauge"><div>${r.ces.ces ?? 'n/a'}</div></div>
      <div>
        <div style="font-size:.9rem;color:#c3cdda">CES (incl. provisional auth-perf): <b>${r.ces.ces ?? 'n/a'}</b> / 100</div>
        <div style="font-size:.9rem;color:#c3cdda;margin-top:.35rem">CES (excl. auth-perf): <b>${cesExcl ?? 'n/a'}</b> / 100</div>
        <div style="font-size:.78rem;color:#8b97a8;margin-top:.6rem">
          0.4·AccessControl + 0.3·ContinuousValidation + 0.2·AuditIntegrity + 0.1·AuthPerformance
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Access-control effectiveness</h2>
    ${bar('TAR (true accept)', pct100(r.accessControl.tar), 1, 'high')}
    ${bar('FRR (false reject)', pct100(r.accessControl.frr), 1, 'low')}
    ${bar('FAR (false accept)', pct100(r.accessControl.far), 1, 'low')}
    <div class="matrix" style="margin-top:1rem">
      <div class="cell"><div class="k">TP · legit granted</div><div class="n good">${c.tp}</div></div>
      <div class="cell"><div class="k">FN · legit rejected</div><div class="n ${c.fn ? 'bad' : ''}">${c.fn}</div></div>
      <div class="cell"><div class="k">FP · attack granted</div><div class="n ${c.fp ? 'bad' : ''}">${c.fp}</div></div>
      <div class="cell"><div class="k">TN · attack blocked</div><div class="n good">${c.tn}</div></div>
    </div>
  </div>

  <div class="card">
    <h2>Attack resistance · continuous validation · audit integrity</h2>
    ${bar('Attack resistance', r.attackResistance.percent, 100, 'high', '%')}
    ${bar('Session termination', r.continuousValidation.sessionTerminationRate, 100, 'high', '%')}
    ${bar('Audit integrity', r.auditIntegrity.percent, 100, 'high', '%')}
    <div class="row"><div class="label">Mean detection time</div>
      <div class="track"></div>
      <div class="value">${r.continuousValidation.meanAnomalyDetectionSeconds ?? 'n/a'}s</div></div>
  </div>

  <div class="card">
    <h2>Authentication performance <span style="color:#f0b429">(provisional)</span></h2>
    ${bar('Auth-perf score', pct100(r.authenticationPerformance.score), 1, 'high')}
    <div class="row"><div class="label">Mean login latency</div><div class="track"></div>
      <div class="value">${r.authenticationPerformance.meanLoginMs ?? 'n/a'}ms</div></div>
    <div class="row"><div class="label">Mean MFA verify</div><div class="track"></div>
      <div class="value">${r.authenticationPerformance.meanMfaVerifyMs ?? 'n/a'}ms</div></div>
    <ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
  </div>
</div></body></html>`
}
