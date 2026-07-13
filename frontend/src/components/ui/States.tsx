/** Shared loading and error states for API-backed pages. */
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * `min-h` is load-bearing, not decorative: without it the page collapses to the height of a
 * spinner while fetching, the footer jumps up, and the whole layout snaps back when the data
 * lands. Reserving roughly a page's worth of space keeps navigation still.
 */
export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-[70vh] items-center justify-center gap-2.5 text-navy-400',
        className,
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-red-100 bg-red-50 px-6 py-10 text-center',
        className,
      )}
    >
      <AlertCircle className="h-5 w-5 text-red-600" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm">
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      )}
    </div>
  )
}
