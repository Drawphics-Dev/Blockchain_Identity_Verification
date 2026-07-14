/**
 * The mid-session MFA challenge — shown when the Zero Trust PEP blocks a request that was
 * already in flight (see StepUpContext), rather than at sign-in.
 *
 * The challenge itself is MfaChallenge's job, so this is only the modal frame around it: the
 * enroll-vs-verify logic lives in exactly one place and the two entry points cannot drift.
 */
import { X } from 'lucide-react'
import { MfaChallenge } from './MfaChallenge'

export function StepUpDialog({
  onVerified,
  onCancel,
}: {
  onVerified: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 px-4 py-8 backdrop-blur-sm">
      <div className="card max-h-full w-full max-w-sm overflow-y-auto p-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="text-navy-300 hover:text-navy-600"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <MfaChallenge onVerified={onVerified} />
      </div>
    </div>
  )
}
