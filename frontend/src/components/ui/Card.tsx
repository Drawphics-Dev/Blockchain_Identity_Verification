import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
}

export function Card({ children, className, hover }: CardProps) {
  return <div className={cn('card p-6', hover && 'card-hover', className)}>{children}</div>
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

/**
 * Section header — title-led, no decorative icon chip.
 * A quiet bottom rule provides structure without extra ornament.
 */
export function CardHeader({ title, subtitle, action }: CardHeaderProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3 border-b border-navy-100/70 pb-4">
      <div>
        <h3 className="font-display text-[17px] font-semibold leading-tight text-navy-900">
          {title}
        </h3>
        {subtitle && <p className="mt-1 text-[13px] text-navy-400">{subtitle}</p>}
      </div>
      {action && <div className="flex-none pt-0.5">{action}</div>}
    </div>
  )
}
