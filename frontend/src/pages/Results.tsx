import { useState } from 'react'
import { Award, Download, ShieldCheck } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Loading } from '@/components/ui/States'
import { useResource } from '@/hooks/useResource'
import { fetchResults } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Grade } from '@/types'

const gradeTone = (grade: Grade) => {
  if (grade.startsWith('A')) return 'success'
  if (grade.startsWith('B')) return 'navy'
  if (grade.startsWith('C')) return 'warning'
  return 'danger'
}

const scoreColor = (score: number) =>
  score >= 70 ? '#0f766e' : score >= 60 ? '#234a72' : score >= 50 ? '#b8912e' : '#b91c1c'

export function Results() {
  const [active, setActive] = useState(0)
  const resource = useResource(() => fetchResults().then((r) => r.results))

  // Keep the header mounted across loading/error/content so the layout does not jump.
  const header = (
    <PageHeader
      eyebrow="Academic Record"
      title="Examination Results"
      description="Grades and GPA by semester. Every record is cryptographically verified and immutable."
      action={
        <button className="btn-secondary btn-md">
          <Download className="h-4 w-4" /> Download Transcript
        </button>
      }
    />
  )

  const semesterResults = resource.data ?? []

  if (resource.loading || resource.error || semesterResults.length === 0) {
    return (
      <div>
        {header}
        {resource.loading ? (
          <Loading label="Loading examination results…" />
        ) : (
          <ErrorState
            message={resource.error ?? 'No examination results have been published yet.'}
            onRetry={resource.error ? resource.reload : undefined}
          />
        )}
      </div>
    )
  }

  // Guard the index: a reload could return fewer semesters than the selected tab.
  const result = semesterResults[Math.min(active, semesterResults.length - 1)]

  const chartData = result.records.map((r) => ({ name: r.courseCode, score: r.score }))
  const totalCredits = result.records.reduce((s, r) => s + r.credits, 0)
  const best = [...result.records].sort((a, b) => b.score - a.score)[0]

  return (
    <div>
      {header}

      {/* Semester tabs */}
      <div className="mb-8 flex flex-wrap gap-2">
        {semesterResults.map((s, i) => (
          <button
            key={s.semester}
            onClick={() => setActive(i)}
            className={cn(
              'rounded-md px-3.5 py-2 text-sm font-semibold transition-colors',
              i === active ? 'bg-navy-900 text-white' : 'bg-navy-50 text-navy-600 hover:bg-navy-100',
            )}
          >
            {s.semester}
          </button>
        ))}
      </div>

      {/* Summary figures + top performance */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.7fr_1fr]">
        <section>
          <div className="grid grid-cols-3 divide-x divide-navy-100 border-y border-navy-100">
            {[
              { label: 'Semester GPA', value: result.gpa.toFixed(2) },
              { label: 'Credits', value: `${totalCredits}` },
              { label: 'Courses', value: `${result.records.length}` },
            ].map((f, i) => (
              <div key={f.label} className={cn('py-5', i === 0 ? 'pr-6' : 'px-6')}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">{f.label}</p>
                <p className="mt-2 font-display text-3xl font-semibold text-navy-900 tabular-nums">{f.value}</p>
              </div>
            ))}
          </div>

          <h2 className="mb-1 mt-10 font-display text-lg font-semibold text-navy-900">Score Distribution</h2>
          <p className="mb-5 text-sm text-navy-500">{result.semester}</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#5680ac' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#5680ac' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(35,74,114,0.05)' }} contentStyle={{ borderRadius: 8, border: '1px solid #dae6f1', fontSize: 13 }} />
                <Bar dataKey="score" radius={[5, 5, 0, 0]} maxBarSize={46}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={scoreColor(d.score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Top performance */}
        <section className="lg:border-l lg:border-navy-100 lg:pl-10">
          <div className="flex items-center gap-2 text-gold-600">
            <Award className="h-5 w-5" />
            <span className="text-[11px] font-semibold uppercase tracking-institutional">Top Performance</span>
          </div>
          <p className="mt-4 font-mono text-xs text-navy-400">{best.courseCode}</p>
          <p className="mt-1 font-display text-xl font-semibold leading-tight text-navy-900">{best.courseTitle}</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="font-display text-5xl font-semibold text-navy-900 tabular-nums">{best.score}</span>
            <Badge tone="success" className="mb-2">
              Grade {best.grade}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-navy-500">Above your semester average.</p>
        </section>
      </div>

      {/* Detailed table */}
      <section className="mt-12">
        <div className="mb-4 flex items-baseline justify-between border-b border-navy-100 pb-3">
          <h2 className="font-display text-lg font-semibold text-navy-900">Detailed Results</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified · Immutable
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-[11px] uppercase tracking-wider text-navy-400">
                <th className="py-2.5 pr-4 font-semibold">Code</th>
                <th className="py-2.5 pr-4 font-semibold">Course</th>
                <th className="py-2.5 pr-4 text-center font-semibold">Credits</th>
                <th className="py-2.5 pr-4 text-center font-semibold">Score</th>
                <th className="py-2.5 pr-4 text-center font-semibold">Grade</th>
                <th className="py-2.5 text-center font-semibold">Point</th>
              </tr>
            </thead>
            <tbody>
              {result.records.map((r) => (
                <tr key={r.courseCode} className="border-b border-navy-50 last:border-0">
                  <td className="py-3 pr-4 font-mono text-xs font-semibold text-navy-700">{r.courseCode}</td>
                  <td className="py-3 pr-4 font-medium text-navy-800">{r.courseTitle}</td>
                  <td className="py-3 pr-4 text-center text-navy-500 tabular-nums">{r.credits}</td>
                  <td className="py-3 pr-4 text-center font-semibold text-navy-900 tabular-nums">{r.score}</td>
                  <td className="py-3 pr-4 text-center">
                    <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge>
                  </td>
                  <td className="py-3 text-center text-navy-600 tabular-nums">{r.gradePoint.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
