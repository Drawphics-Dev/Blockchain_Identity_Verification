import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}

/**
 * Editorial page header — eyebrow, large serif title, optional lead paragraph,
 * closed with a hairline rule. Gives each page a considered, print-like masthead.
 */
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 border-b border-navy-100 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy-900 lg:text-[2.5rem] lg:leading-[1.1]">
            {title}
          </h1>
          {description && (
            <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-navy-500">
              {description}
            </p>
          )}
        </div>
        {action && <div className="flex-none">{action}</div>}
      </div>
    </header>
  )
}
