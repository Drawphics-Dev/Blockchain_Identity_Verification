import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  trend?: { value: string; positive?: boolean }
}

/**
 * Minimal stat tile — label, serif figure, optional delta.
 * No icon chips, no accent rules. Restraint over decoration.
 */
export function StatCard({ label, value, hint, trend }: StatCardProps) {
  return (
    <div className="card card-hover p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">{label}</p>
      <p className="mt-3 font-display text-[30px] font-semibold leading-none tracking-tight text-navy-900 tabular-nums">
        {value}
      </p>
      {(trend || hint) && (
        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
          {trend && (
            <span
              className={cn(
                'font-semibold',
                trend.positive ? 'text-emerald-700' : 'text-amber-700',
              )}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-navy-400">{hint}</span>}
        </div>
      )}
    </div>
  )
}
