import { CheckCircle2, Download, CreditCard, ShieldCheck } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Loading } from '@/components/ui/States'
import { useResource } from '@/hooks/useResource'
import { fetchFees } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'

const CATEGORY_COLORS: Record<string, string> = {
  tuition: '#122d48',
  accommodation: '#234a72',
  library: '#b8912e',
  lab: '#5680ac',
  other: '#b6cbe0',
}

export function FeeStatement() {
  const fees = useResource(() => fetchFees().then((r) => r.statement))

  // Header stays mounted across loading/error/content so the layout does not jump. Its text
  // is fixed (the semester appears in the badge below) so it cannot reflow when data lands.
  const header = (
    <PageHeader
      eyebrow="Finance"
      title="Fee Statement"
      description="Billing summary and payment history for the current semester."
      action={
        <div className="flex gap-2">
          <button className="btn-accent btn-md">
            <CreditCard className="h-4 w-4" /> Pay Now
          </button>
          <button className="btn-secondary btn-md">
            <Download className="h-4 w-4" /> Statement
          </button>
        </div>
      }
    />
  )

  if (fees.loading) {
    return (
      <div>
        {header}
        <Loading label="Loading fee statement…" />
      </div>
    )
  }
  if (fees.error || !fees.data) {
    return (
      <div>
        {header}
        <ErrorState message={fees.error ?? 'No fee statement on record.'} onRetry={fees.reload} />
      </div>
    )
  }

  const { items, payments, totalDue, totalPaid, semester } = fees.data
  const balance = totalDue - totalPaid
  const paidPct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0
  const pieData = items.map((i) => ({ name: i.label, value: i.amount, category: i.category }))

  return (
    <div>
      {header}

      {/* Balance + breakdown */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.7fr_1fr]">
        <section>
          <p className="eyebrow-muted">Outstanding Balance</p>
          <p className="mt-2 font-display text-5xl font-semibold leading-none tracking-tight text-navy-900 tabular-nums">
            {formatCurrency(balance)}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={balance > 0 ? 'warning' : 'success'}>{balance > 0 ? 'Payment due' : 'Fully paid'}</Badge>
            <span className="text-xs text-navy-400">{semester}</span>
          </div>

          <div className="mt-8 border-t border-navy-100 pt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-navy-600">
                {formatCurrency(totalPaid)} paid of {formatCurrency(totalDue)}
              </span>
              <span className="font-semibold text-emerald-700 tabular-nums">{paidPct}%</span>
            </div>
            <ProgressBar value={paidPct} tone="emerald" className="h-2.5" />
          </div>
        </section>

        <section className="lg:border-l lg:border-navy-100 lg:pl-10">
          <h2 className="mb-4 font-display text-lg font-semibold text-navy-900">Fee Breakdown</h2>
          <div className="relative h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2} stroke="none">
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.category]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: '1px solid #dae6f1', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-navy-400">Total</p>
                <p className="font-display text-lg font-semibold text-navy-900 tabular-nums">{formatCurrency(totalDue)}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Itemised + payments */}
      <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 border-b border-navy-100 pb-3 font-display text-lg font-semibold text-navy-900">
            Itemised Charges
          </h2>
          <ul>
            {items.map((item) => (
              <li key={item.label} className="flex items-center justify-between border-b border-navy-50 py-3">
                <span className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[item.category] }} />
                  <span className="text-sm font-medium text-navy-700">{item.label}</span>
                </span>
                <span className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(item.amount)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between py-3">
              <span className="text-sm font-semibold text-navy-900">Total Due</span>
              <span className="font-display text-base font-semibold text-navy-900 tabular-nums">{formatCurrency(totalDue)}</span>
            </li>
          </ul>
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between border-b border-navy-100 pb-3">
            <h2 className="font-display text-lg font-semibold text-navy-900">Payment History</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Tamper-proof
            </span>
          </div>
          {payments.length === 0 ? (
            <p className="py-6 text-sm text-navy-400">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 flex-none text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-navy-800">{p.method}</p>
                    <p className="truncate text-xs text-navy-400">
                      {formatDate(p.date)} · Ref {p.reference}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700 tabular-nums">+{formatCurrency(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4">
            <span className="text-sm font-medium text-navy-600">Total Paid</span>
            <span className="font-display text-base font-semibold text-emerald-700 tabular-nums">{formatCurrency(totalPaid)}</span>
          </div>
        </section>
      </div>
    </div>
  )
}
