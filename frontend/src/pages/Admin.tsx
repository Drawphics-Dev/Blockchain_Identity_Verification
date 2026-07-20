/**
 * Admin / Research view (ROADMAP Phase 7): the audit-trail viewer, per-record "Verify
 * Integrity" action, and live engine metrics.
 *
 * ADMIN-ONLY. <AdminRoute> keeps students out of this route in the UI, but the real boundary is
 * `requireAdmin` on the server — a client that ignores the role field still gets a 403. The trail
 * names every student and every decision made about them, so it is the one resource a student must
 * not be able to read about anyone else.
 */
import { useState } from 'react'
import { RefreshCw, Search, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { ErrorState, Loading } from '@/components/ui/States'
import { useResource } from '@/hooks/useResource'
import { fetchAuditTrail, fetchMetrics, verifyAuditEvent } from '@/lib/api'
import { formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Decision, IntegrityResult } from '@/types'

const decisionTone: Record<Decision, 'success' | 'warning' | 'danger'> = {
  ALLOW: 'success',
  STEP_UP: 'warning',
  DENY: 'danger',
  TERMINATE: 'danger',
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

type VerifyState = { status: 'pending' } | { status: 'done'; result: IntegrityResult } | { status: 'error' }

function MetricsPanel() {
  const metrics = useResource(() => fetchMetrics())

  if (metrics.loading) return <Loading label="Loading engine metrics…" className="min-h-[30vh]" />
  if (metrics.error || !metrics.data) {
    return (
      <ErrorState
        message={metrics.error ?? 'Could not load metrics.'}
        onRetry={metrics.reload}
        className="min-h-[30vh]"
      />
    )
  }

  const m = metrics.data
  const decisionEntries: Array<{ key: Decision; label: string }> = [
    { key: 'ALLOW', label: 'Allow' },
    { key: 'STEP_UP', label: 'Step-up' },
    { key: 'DENY', label: 'Deny' },
    { key: 'TERMINATE', label: 'Terminate' },
  ]

  return (
    <div className="space-y-6">
      {/* Decision distribution */}
      <div>
        <h2 className="mb-3 font-display text-[15px] font-semibold text-navy-900">
          Access Decisions <span className="font-sans text-[13px] font-normal text-navy-400">— all time</span>
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {decisionEntries.map(({ key, label }) => (
            <div key={key} className="card p-4">
              <Badge tone={decisionTone[key]}>{label}</Badge>
              <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-navy-900">
                {m.decisions[key]}
              </p>
              <p className="text-xs text-navy-400">
                {m.totalEvents > 0 ? `${Math.round((m.decisions[key] / m.totalEvents) * 100)}% of events` : '—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Operational + continuous-validation figures (ROADMAP §7c — computed from real data) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Events" value={`${m.totalEvents}`} hint="all engine decisions logged" />
        <StatCard label="Average Risk Score" value={m.averageRiskScore.toFixed(1)} hint="0–100 scale" />
        <StatCard
          label="Sessions"
          value={`${m.sessions.active} / ${m.sessions.total}`}
          hint="active / total"
        />
        <StatCard
          label="Session Termination Rate"
          value={m.continuousValidation.sessionTerminationRate === null ? '—' : `${m.continuousValidation.sessionTerminationRate}%`}
          hint={
            m.continuousValidation.sessionsWithAnomaly === 0
              ? 'no flagged sessions yet'
              : `${m.continuousValidation.terminatedAfterAnomaly} / ${m.continuousValidation.sessionsWithAnomaly} flagged sessions`
          }
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Mean Anomaly Detection Time"
          value={
            m.continuousValidation.meanAnomalyDetectionSeconds === null
              ? '—'
              : `${m.continuousValidation.meanAnomalyDetectionSeconds}s`
          }
          hint="first anomaly → session terminated"
        />
      </div>

      {/* Honest scope notice — no fabricated TAR/FAR/FRR/CES */}
      {m.notYetAvailable.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3.5 text-[13px] leading-relaxed text-amber-800">
          <ShieldQuestion className="mt-0.5 h-4 w-4 flex-none" />
          <ul className="list-disc space-y-1 pl-4">
            {m.notYetAvailable.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function VerifyCell({ eventId }: { eventId: string }) {
  const [state, setState] = useState<VerifyState | null>(null)

  async function handleVerify() {
    setState({ status: 'pending' })
    try {
      const result = await verifyAuditEvent(eventId)
      setState({ status: 'done', result })
    } catch {
      setState({ status: 'error' })
    }
  }

  if (!state) {
    return (
      <button onClick={handleVerify} className="btn-secondary btn-sm">
        <ShieldCheck className="h-3.5 w-3.5" /> Verify
      </button>
    )
  }
  if (state.status === 'pending') {
    return <span className="text-xs text-navy-400">Checking…</span>
  }
  if (state.status === 'error') {
    return (
      <button onClick={handleVerify} className="text-xs font-semibold text-red-600 hover:underline">
        Failed — retry
      </button>
    )
  }
  return state.result.valid ? (
    <Badge tone="success">
      <ShieldCheck className="h-3 w-3" /> Verified
    </Badge>
  ) : (
    <span title={`expected ${state.result.expectedHash}\nactual ${state.result.actualHash}`}>
      <Badge tone="danger">
        <ShieldAlert className="h-3 w-3" /> Tampered
      </Badge>
    </span>
  )
}

function TrailPanel() {
  const [studentQuery, setStudentQuery] = useState('')
  const [appliedFilter, setAppliedFilter] = useState('')
  const trail = useResource(() => fetchAuditTrail(appliedFilter || undefined), [appliedFilter])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setAppliedFilter(studentQuery.trim())
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-[15px] font-semibold text-navy-900">
          Audit Trail <span className="font-sans text-[13px] font-normal text-navy-400">— newest first</span>
        </h2>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300" />
            <input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Filter by student ID…"
              className="input py-2 pl-8 text-sm"
            />
          </form>
          <button onClick={trail.reload} className="btn-secondary btn-sm flex-none" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {trail.loading ? (
        <Loading label="Loading audit trail…" className="min-h-[30vh]" />
      ) : trail.error || !trail.data ? (
        <ErrorState message={trail.error ?? 'Could not load the audit trail.'} onRetry={trail.reload} />
      ) : trail.data.trail.length === 0 ? (
        <p className="rounded-lg border border-navy-100 bg-white px-6 py-10 text-center text-sm text-navy-400">
          {appliedFilter ? `No events for "${appliedFilter}".` : 'No events logged yet.'}
        </p>
      ) : (
        <>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-navy-100 bg-white">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-navy-100 bg-navy-50 text-left text-[11px] uppercase tracking-wider text-navy-400">
                  <th className="py-2.5 pl-4 pr-3 font-semibold">Time</th>
                  <th className="py-2.5 pr-3 font-semibold">Student</th>
                  <th className="py-2.5 pr-3 font-semibold">Resource</th>
                  <th className="py-2.5 pr-3 text-center font-semibold">Decision</th>
                  <th className="py-2.5 pr-3 text-center font-semibold">Risk</th>
                  <th className="py-2.5 pr-3 font-semibold">Hash</th>
                  <th className="py-2.5 pr-4 font-semibold">Integrity</th>
                </tr>
              </thead>
              <tbody>
                {trail.data.trail.map((e) => (
                  <tr key={e.eventId} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/30">
                    <td className="py-2.5 pl-4 pr-3 text-xs tabular-nums text-navy-500">
                      {formatTime(e.timestamp)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="text-[13px] font-medium text-navy-800">{e.student?.fullName ?? 'Unknown'}</p>
                      <p className="font-mono text-[11px] text-navy-400">{e.student?.studentId ?? e.studentId}</p>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-navy-600">{e.resource}</td>
                    <td className="py-2.5 pr-3 text-center">
                      <Badge tone={decisionTone[e.decision]}>{e.decision}</Badge>
                    </td>
                    <td
                      className={cn(
                        'py-2.5 pr-3 text-center font-semibold tabular-nums',
                        e.riskScore >= 60 ? 'text-red-600' : e.riskScore >= 30 ? 'text-amber-600' : 'text-navy-500',
                      )}
                    >
                      {e.riskScore}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-navy-400" title={e.hash}>
                      {shortHash(e.hash)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <VerifyCell eventId={e.eventId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trail.data.truncated && (
            <p className="mt-2 text-xs text-navy-400">
              Showing the most recent {trail.data.trail.length} of {trail.data.totalEvents} events.
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function Admin() {
  return (
    <div>
      <PageHeader
        eyebrow="Zero Trust Engine"
        title="Admin / Research View"
        description="The immutable audit trail, per-record integrity verification, and live engine metrics."
      />
      <div className="space-y-12">
        <MetricsPanel />
        <TrailPanel />
      </div>
    </div>
  )
}
