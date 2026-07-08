import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ShieldCheck, CircleCheck, CircleAlert, ArrowRight, ArrowUpRight } from 'lucide-react'
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
import { useAuth } from '@/context/AuthContext'
import { recentAuditEvents } from '@/data/student'
import { feeStatement } from '@/data/fees'
import { availableCourses, initialEnrollments } from '@/data/courses'
import { formatCurrency, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const gpaTrend = [
  { term: '100L S1', gpa: 3.2 },
  { term: '100L S2', gpa: 3.4 },
  { term: '200L S1', gpa: 3.55 },
  { term: '200L S2', gpa: 3.72 },
  { term: '300L S1', gpa: 3.78 },
]

const decisionTone = {
  ALLOW: 'success',
  STEP_UP: 'warning',
  DENY: 'danger',
  TERMINATE: 'danger',
} as const

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-navy-100 bg-white', className)}>{children}</section>
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

export function Dashboard() {
  const { student } = useAuth()
  if (!student) return null

  const outstanding = feeStatement.totalDue - feeStatement.totalPaid
  const paidPct = Math.round((feeStatement.totalPaid / feeStatement.totalDue) * 100)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const byCode = Object.fromEntries(availableCourses.map((c) => [c.code, c]))
  const regCourses = initialEnrollments.map((e) => byCode[e.courseCode]).filter(Boolean)

  const kpis = [
    { label: 'Cumulative GPA', value: student.gpa.toFixed(2), note: '▲ 0.17', noteTone: 'up', spark: [3.2, 3.4, 3.55, 3.72, 3.78], color: '#0f766e' },
    { label: 'Registered Units', value: `${initialEnrollments.length}`, note: 'this semester', noteTone: 'muted', spark: [4, 5, 5, 6, 5], color: '#234a72' },
    { label: 'Outstanding Fees', value: formatCurrency(outstanding), note: 'due 30 July', noteTone: 'warn', spark: [283, 240, 180, 120, 73], color: '#b8912e' },
    { label: 'Trust Score', value: `${student.trustScore}`, note: 'verified', noteTone: 'up', spark: [88, 90, 92, 91, 94], color: '#0f766e' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Compact dashboard header */}
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
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified on-chain
            </span>
          </div>
        </div>
        <Link to="/courses" className="btn-primary btn-md self-start sm:self-auto">
          Register courses <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* KPI row */}
      <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-navy-100 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">{k.label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <div>
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
              <div className="h-10 w-20 flex-none">
                <Sparkline data={[...k.spark]} color={k.color} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main row: performance + zero trust */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="p-6 lg:col-span-2">
          <ModuleHead
            title="Academic Performance"
            sub="Cumulative GPA across semesters"
            right={<Badge tone="success">Trending up</Badge>}
          />
          <div className="mt-5 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={gpaTrend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gpaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#234a72" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#234a72" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 5" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="term" tick={{ fontSize: 12, fill: '#89a8c9' }} axisLine={false} tickLine={false} />
                <YAxis domain={[3, 4]} tick={{ fontSize: 12, fill: '#89a8c9' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #dae6f1', fontSize: 13 }} />
                <Area type="monotone" dataKey="gpa" stroke="#234a72" strokeWidth={2.5} fill="url(#gpaFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="p-6">
          <ModuleHead title="Zero Trust Status" sub="Live session confidence" />
          <div className="mt-4 flex flex-col items-center text-center">
            <TrustRing score={student.trustScore} />
            <div className="mt-5 w-full space-y-2.5 border-t border-navy-100 pt-4 text-left text-[13px]">
              <span className="flex items-center gap-2 text-navy-600">
                <CircleCheck className="h-4 w-4 text-emerald-600" /> Device trusted
              </span>
              <span className="flex items-center gap-2 text-navy-600">
                <CircleCheck className="h-4 w-4 text-emerald-600" /> Location normal
              </span>
              <span className="flex items-center gap-2 text-navy-600">
                <CircleCheck className="h-4 w-4 text-emerald-600" /> No anomalies detected
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Secondary row: fees + registered courses */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="p-6">
          <ModuleHead
            title="Fees"
            sub={feeStatement.semester}
            right={
              <Link to="/fees" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-gold-700">
                Details <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-navy-400">Outstanding</p>
          <p className="mt-1 font-display text-3xl font-semibold text-navy-900 tabular-nums">
            {formatCurrency(outstanding)}
          </p>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-navy-500">
              <span>{paidPct}% paid</span>
              <span className="tabular-nums">{formatCurrency(feeStatement.totalPaid)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${paidPct}%` }} />
            </div>
          </div>
        </Panel>

        <Panel className="p-6 lg:col-span-2">
          <ModuleHead
            title="Registered Courses"
            sub={`${regCourses.length} units · Semester 1`}
            right={
              <Link to="/courses" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-gold-700">
                Manage <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <ul className="mt-4 divide-y divide-navy-50">
            {regCourses.map((c) => (
              <li key={c.code} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-navy-700">{c.code}</span>
                  <span className="ml-3 text-sm text-navy-700">{c.title}</span>
                </div>
                <span className="flex-none text-xs text-navy-400 tabular-nums">{c.credits} credits</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Audit trail */}
      <Panel className="p-6">
        <ModuleHead
          title="Blockchain Audit Trail"
          sub="Immutable record of your recent session activity"
          right={
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ledger synced
            </span>
          }
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-navy-100 text-left text-[11px] uppercase tracking-wider text-navy-400">
                <th className="py-2.5 pr-4 font-semibold">Time</th>
                <th className="py-2.5 pr-4 font-semibold">Action</th>
                <th className="py-2.5 pr-4 font-semibold">Decision</th>
                <th className="py-2.5 pr-4 font-semibold">Risk</th>
                <th className="py-2.5 font-semibold">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {recentAuditEvents.map((e) => (
                <tr key={e.id} className="border-b border-navy-50 last:border-0">
                  <td className="whitespace-nowrap py-3 pr-4 text-navy-500 tabular-nums">{formatTime(e.timestamp)}</td>
                  <td className="py-3 pr-4 font-medium text-navy-800">{e.action}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={decisionTone[e.decision]}>
                      {e.decision === 'ALLOW' ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                      {e.decision}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-navy-600 tabular-nums">{e.riskScore}</td>
                  <td className="py-3 font-mono text-xs text-navy-500">{e.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
