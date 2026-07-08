import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number // 0–100
  tone?: 'navy' | 'gold' | 'emerald' | 'amber' | 'red'
  className?: string
}

const tones = {
  navy: 'bg-navy-800',
  gold: 'bg-gold-500',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
}

export function ProgressBar({ value, tone = 'navy', className }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-navy-100', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-700', tones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
