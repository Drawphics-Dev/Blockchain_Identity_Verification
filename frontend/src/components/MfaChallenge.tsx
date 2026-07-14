/**
 * The MFA challenge — the single place a student ever proves a second factor.
 *
 * It works out for itself which situation it is in, so no caller has to know:
 *
 *   - ENROLLED      → ask for a code from the authenticator app. (The common case.)
 *   - NOT ENROLLED  → ask for the registrar's one-time enrollment token FIRST, and only then
 *                     reveal the QR. The token is what stops a password thief from binding
 *                     their own authenticator to an account the real student has not set up
 *                     yet — without it, whoever signs in first owns the second factor, and a
 *                     stolen password alone would defeat MFA outright.
 *
 * Both paths end the same way: the pending step-up is satisfied and `onVerified` fires. Used by
 * the login screen and by StepUpDialog, so the two can never drift apart.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, KeyRound, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import {
  ApiError,
  completeMfaEnrollment,
  fetchMfaEnrollment,
  isMfaEnrollmentPending,
  submitStepUp,
} from '@/lib/api'

type Phase =
  | { name: 'loading' }
  /** Enrolled already — just prove a code. */
  | { name: 'verify' }
  /** Not enrolled — prove possession of the registrar's token before anything is revealed. */
  | { name: 'token' }
  /** Token accepted; the secret is now on screen, awaiting confirmation. */
  | { name: 'scan'; secret: string; qrDataUrl: string }

export function MfaChallenge({
  studentId,
  onVerified,
}: {
  studentId?: string
  onVerified: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' })
  const [token, setToken] = useState('')
  const [code, setCode] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    isMfaEnrollmentPending().then((pending) => {
      if (!cancelled) setPhase(pending ? { name: 'token' } : { name: 'verify' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** Enrollment step 1: redeem the registrar's token to reveal the QR. */
  async function handleTokenSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await fetchMfaEnrollment(token)
      setPhase({ name: 'scan', secret: data.secret, qrDataUrl: data.qrDataUrl })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.')
    } finally {
      setBusy(false)
    }
  }

  /** Final step for both paths: prove a code. */
  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // Enrolling proves the code AND answers the step-up in one call, so a first-time student
      // never has to enter two codes back to back.
      if (phase.name === 'scan') await completeMfaEnrollment(token, code)
      else await submitStepUp(code)
      onVerified()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot reach the server.')
      setCode('')
      setBusy(false)
    }
  }

  if (phase.name === 'loading') {
    return (
      <div className="flex items-center gap-2.5 py-8 text-sm text-navy-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking your security settings…
      </div>
    )
  }

  const enrolling = phase.name === 'token' || phase.name === 'scan'

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold-500/15 text-gold-600">
          {enrolling ? <ShieldCheck className="h-[18px] w-[18px]" /> : <ShieldAlert className="h-[18px] w-[18px]" />}
        </span>
        <div>
          <h2 className="font-display text-xl font-semibold leading-tight text-navy-900">
            {enrolling ? 'Set up your authenticator' : 'Identity re-verification'}
          </h2>
          <p className="text-[13px] text-navy-400">
            {enrolling
              ? 'One-time setup for this account'
              : 'Zero Trust flagged this device or network'}
          </p>
        </div>
      </div>

      {/* ── Enrollment step 1: the registrar's token ── */}
      {phase.name === 'token' && (
        <form onSubmit={handleTokenSubmit} className="mt-5 space-y-4">
          <p className="text-[15px] leading-relaxed text-navy-500">
            Enter the enrollment token issued with your account. Your password alone is not
            enough to set up an authenticator — that is what stops someone who has stolen it
            from setting up <em>theirs</em>.
          </p>

          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input
              className="input pl-10 font-mono uppercase tracking-wider"
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              <AlertCircle className="h-4 w-4 flex-none" />
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary btn-lg w-full" disabled={busy || token.length < 4}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </button>

          <p className="border-t border-navy-100 pt-4 text-[13px] leading-relaxed text-navy-400">
            Don’t have one? It is issued with your account by the registrar and handed over in
            person — never by email alongside your password.
          </p>
        </form>
      )}

      {/* ── Enrollment step 2: scan, then confirm ── */}
      {phase.name === 'scan' && (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-navy-500">
            Open an authenticator app — Google Authenticator, Microsoft Authenticator, Authy or
            1Password — and scan this code.
          </p>

          <div className="mt-4 flex justify-center rounded-lg border border-navy-100 bg-white p-4">
            <img
              src={phase.qrDataUrl}
              alt="QR code for enrolling this account in an authenticator app"
              className="h-[200px] w-[200px]"
            />
          </div>

          <div className="mt-3 text-center">
            {showKey ? (
              <div>
                <p className="text-xs text-navy-400">Or enter this key manually:</p>
                <p className="mt-1 select-all break-all font-mono text-[13px] font-semibold text-navy-800">
                  {phase.secret}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowKey(true)}
                className="text-xs font-semibold text-navy-500 hover:text-gold-600"
              >
                Can’t scan? Enter the key manually
              </button>
            )}
          </div>

          <p className="mt-5 text-[15px] leading-relaxed text-navy-500">
            Then enter the 6-digit code it shows, to confirm it is working.
          </p>
        </div>
      )}

      {/* ── Verification (both the enrolled case and enrollment's final confirm) ── */}
      {!enrolling && (
        <p className="mt-4 text-[15px] leading-relaxed text-navy-500">
          Enter the 6-digit code from your authenticator app
          {studentId ? (
            <>
              {' '}
              to finish signing in as <span className="font-semibold text-navy-700">{studentId}</span>
            </>
          ) : (
            ' to continue'
          )}
          .
        </p>
      )}

      {phase.name !== 'token' && (
        <form onSubmit={handleCodeSubmit} className="mt-5 space-y-4">
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

          <button type="submit" className="btn-primary btn-lg w-full" disabled={busy || code.length < 6}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : phase.name === 'scan' ? (
              'Confirm & sign in'
            ) : (
              'Verify & sign in'
            )}
          </button>
        </form>
      )}
    </div>
  )
}
