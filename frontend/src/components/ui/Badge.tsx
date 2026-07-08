import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'navy' | 'gold' | 'success' | 'warning' | 'danger' | 'neutral'

const tones: Record<Tone, string> = {
  navy: 'bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-100',
  gold: 'bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100',
  danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-100',
  neutral: 'bg-navy-50 text-navy-500 ring-1 ring-inset ring-navy-100',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return <span className={cn('badge', tones[tone], className)}>{children}</span>
}
