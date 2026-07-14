import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ShieldCheck, ArrowRight, ArrowUpRight, Info } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { TrustRing } from '@/components/ui/TrustRing'
import { Sparkline } from '@/components/ui/Sparkline'
import { ErrorState, Loading } from '@/components/ui/States'
import { useAuth } from '@/context/AuthContext'
import { useResource } from '@/hooks/useResource'
import { fetchCourses, fetchEnrollments, fetchFees, fetchResults } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Course, Enrollment, FeeStatement, SemesterResult } from '@/types'

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-navy-100 bg-white', className)}>
      {children}
    </section>
  )
}

function ModuleHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold text-navy-900">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-navy-400">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** "Semester 2 · 2024/2025" → "S2 24/25", so it fits a chart axis. */
function shortSemester(semester: string): string {
  const [term, years] = semester.split(' · ')
  const n = term?.match(/\d+/)?.[0]
  const yy = years
    ?.split('/')
    .map((y) => y.slice(2))
    .join('/')
  return n && yy ? `S${n} ${yy}` : semester
}

interface DashboardData {
  courses: Course[]
  enrollments: Enrollment[]
  fees: FeeStatement | null
  results: SemesterResult[]
}

export function Dashboard() {
  const { student } = useAuth()

  const data = useResource<DashboardData>(async () => {
    const [{ courses }, { enrollments }, fees, { results }] = await Promise.all([
      fetchCourses(),
      fetchEnrollments(),
      // A student with no statement on record is not an error — show zero.
      fetchFees()
        .then((r) => r.statement)
        .catch(() => null),
      fetchResults(),
    ])
    return { courses, enrollments, fees, results }
  })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // The student is already in context at mount, so the header can render before the
  // dashboard's data arrives — keeping it mounted stops the page from collapsing.
  const header = student && (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[13px] text-navy-400">{greeting},</p>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-navy-900">
          {student.fullName}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-navy-500">
          <span>{student.program}</span>
          <span className="text-navy-300">·</span>
          <span>{student.level}</span>
          <span className="text-navy-300">·</span>
          <span>{student.studentId}</span>
        </div>
      </div>
      <Link to="/courses" className="btn-primary btn-md self-start sm:self-auto">
        Register courses <ArrowRight className="h-4 w-4" />
      </Link>
    </header>
  )

  if (!student || data.loading) {
    return (
      <div className="space-y-6">
        {header}
        <Loading label="Loading your dashboard…" />
      </div>
    )
  }
  if (data.error || !data.data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState message={data.error ?? 'Could not load your dashboard.'} onRetry={data.reload} />
      </div>
    )
  }

  const { courses, enrollments, fees, results } = data.data

  const totalDue = fees?.totalDue ?? 0
  const totalPaid = fees?.totalPaid ?? 0
  const outstanding = totalDue - totalPaid
  const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  const registeredCodes = new Set(enrollments.map((e) => e.courseCode))
  const regCourses = courses.filter((c) => registeredCodes.has(c.code))

  // Results arrive newest-first; the chart reads left-to-right in time order.
  const chronological = [...results].reverse()
  const gpaTrend = chronological.map((r) => ({ term: shortSemester(r.semester), gpa: r.gpa }))
  const gpaSpark = chronological.map((r) => r.gpa)

  // Change in semester GPA between the two most recent semesters.
  const gpaDelta = results.length >= 2 ? results[0].gpa - results[1].gpa : null

  // Balance remaining after each payment, oldest to newest — a real series, not a guess.
  const balanceSpark =
    fees && fees.payments.length > 0
      ? fees.payments.reduce<number[]>(
          (acc, p) => [...acc, acc[acc.length - 1] - p.amount],
          [totalDue],
        )
      : []

  const kpis = [
    {
      label: 'Cumulative GPA',
      value: student.gpa.toFixed(2),
      note:
        gpaDelta === null
          ? 'across all semesters'
          : `${gpaDelta >= 0 ? '▲' : '▼'} ${Math.abs(gpaDelta).toFixed(2)} last semester`,
      noteTone: gpaDelta === null ? 'muted' : gpaDelta >= 0 ? 'up' : 'warn',
      spark: gpaSpark,
      color: '#0f766e',
    },
    {
      label: 'Registered Units',
      value: `${enrollments.length}`,
      note: `${student.enrolledCredits} credits this semester`,
      noteTone: 'muted',
      spark: [],
      color: '#234a72',
    },
    {
      label: 'Outstanding Fees',
      value: formatCurrency(outstanding),
      note: outstanding > 0 ? `${paidPct}% settled` : 'fully paid',
      noteTone: outstanding > 0 ? 'warn' : 'up',
      spark: balanceSpark,
      color: '#b8912e',
    },
    {
      label: 'Trust Score',
      value: `${student.trustScore}`,
      note: '100 − latest risk score',
      noteTone: 'muted',
      spark: [],
      color: '#0f766e',
    },
  ] as const

  return (
    <div className="space-y-6">
      {header}

      {/* KPI row */}
      <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-navy-100 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
              {k.label}
            </p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-[27px] font-semibold leading-none tracking-tight text-navy-900 tabular-nums">
                  {k.value}
                </p>
                <p
                  className={cn(
                    'mt-2 text-xs font-medium',
                    k.noteTone === 'up' && 'text-emerald-700',
                    k.noteTone === 'warn' && 'text-amber-700',
                    k.noteTone === 'muted' && 'text-navy-400',
                  )}
                >
                  {k.note}
                </p>
              </div>
              {k.spark.length >= 2 && (
                <div className="h-10 w-20 flex-none">
                  <Sparkline data={[...k.spark]} color={k.color} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main row: performance + zero trust */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <ModuleHead
            title="Academic Performance"
            sub="Semester GPA over time"
            right={
              gpaDelta !== null && (
                <Badge tone={gpaDelta >= 0 ? 'success' : 'warning'}>
                  {gpaDelta >= 0 ? 'Trending up' : 'Trending down'}
                </Badge>
              )
            }
          />
          <div className="mt-5 h-60 w-full">
            {gpaTrend.length === 0 ? (
              <p className="grid h-full place-items-center text-sm text-navy-400">
                No results published yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gpaTrend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gpaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#234a72" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="#234a72" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 5" stroke="#eef2f7" vertical={false} />
                  <XAxis
                    dataKey="term"
                    tick={{ fontSize: 12, fill: '#89a8c9' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[3, 4]}
                    tick={{ fontSize: 12, fill: '#89a8c9' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #dae6f1', fontSize: 13 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gpa"
                    stroke="#234a72"
                    strokeWidth={2.5}
                    fill="url(#gpaFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel className="p-6">
          <ModuleHead title="Zero Trust Status" sub="Session confidence" />
          <div className="mt-4 flex flex-col items-center text-center">
            <TrustRing score={student.trustScore} />
            <div className="mt-5 w-full border-t border-navy-100 pt-4 text-left">
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-navy-500">
                <Info className="mt-0.5 h-4 w-4 flex-none text-navy-300" />
                <span>
                  Scored continuously from live signals — device, network, time of day, request
                  rate, and resource sensitivity. An unrecognized device or network can require
                  step-up verification before sensitive pages load.
                </span>
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* Secondary row: fees + registered courses */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="p-6">
          <ModuleHead
            title="Fees"
            sub={fees?.semester ?? 'No statement on record'}
            right={
              <Link
                to="/fees"
                className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-gold-700"
              >
                Details <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            Outstanding
          </p>
          <p className="mt-1 font-display text-3xl font-semibold text-navy-900 tabular-nums">
            {formatCurrency(outstanding)}
          </p>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-navy-500">
              <span>{paidPct}% paid</span>
              <span className="tabular-nums">{formatCurrency(totalPaid)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${paidPct}%` }} />
            </div>
          </div>
        </Panel>

        <Panel className="p-6 lg:col-span-2">
          <ModuleHead
            title="Registered Courses"
            sub={`${regCourses.length} units · ${student.enrolledCredits} credits`}
            right={
              <Link
                to="/courses"
                className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-gold-700"
              >
                Manage <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          {regCourses.length === 0 ? (
            <p className="mt-6 text-sm text-navy-400">
              You have not registered for any courses this semester.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-navy-50">
              {regCourses.map((c) => (
                <li key={c.code} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <span className="font-mono text-xs font-semibold text-navy-700">{c.code}</span>
                    <span className="ml-3 text-sm text-navy-700">{c.title}</span>
                  </div>
                  <span className="flex-none text-xs text-navy-400 tabular-nums">
                    {c.credits} credits
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="flex items-center gap-2 pt-2 text-xs text-navy-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Blockchain audit trail arrives with the ledger phase — access decisions are not being
        recorded on-chain yet.
      </p>
    </div>
  )
}
