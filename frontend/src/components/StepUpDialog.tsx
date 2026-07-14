/**
 * Step-up MFA challenge, shown whenever the Zero Trust PEP blocks a request with
 * `step_up_required` (see StepUpContext). Collects a TOTP code, submits it, and lets the
 * caller know to retry the request that triggered this.
 */
import { useState, type FormEvent } from 'react'
import { AlertCircle, Loader2, ShieldAlert, X } from 'lucide-react'
import { ApiError, submitStepUp } from '@/lib/api'

interface StepUpDialogProps {
  onVerified: () => void
  onCancel: () => void
}

export function StepUpDialog({ onVerified, onCancel }: StepUpDialogProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await submitStepUp(code)
      onVerified()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the server.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 px-4 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-500/15 text-gold-600">
              <ShieldAlert className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="font-display text-[17px] font-semibold text-navy-900">
                Identity re-verification
              </h2>
              <p className="text-[13px] text-navy-400">Zero Trust flagged this session</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-navy-300 hover:text-navy-600"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-navy-500">
          Enter the 6-digit code from your authenticator app to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <input
            className="input text-center font-mono text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="······"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4 flex-none" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary btn-md flex-1">
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary btn-md flex-1"
              disabled={loading || code.length < 6}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
