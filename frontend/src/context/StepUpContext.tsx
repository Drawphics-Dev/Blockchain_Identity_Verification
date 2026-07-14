/**
 * Bridges the API client's step-up interception (lib/api.ts) to a React dialog.
 *
 * Any request anywhere in the app that comes back `step_up_required` causes the dialog to
 * appear; the request that triggered it is paused (not lost) until the student verifies or
 * cancels, then transparently retried. Pages themselves never need to know this happened.
 *
 * Pages commonly fire several requests at once (Dashboard loads courses/enrollments/fees/
 * results together) — if the session needs step-up, all of them hit `step_up_required`
 * concurrently. A single dialog still handles this: every concurrent caller is queued, and
 * one successful verification resolves (or one cancel rejects) all of them together.
 *
 * The dialog is also torn down the moment the session itself ends (token expired/revoked,
 * or a plain logout) — without this, a dialog opened for one session could stay open after
 * that session dies, and submitting a code would just fail with a confusing "missing
 * bearer token" error instead of the dialog simply going away.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, onSessionEnded, setStepUpRequiredHandler } from '@/lib/api'
import { StepUpDialog } from '@/components/StepUpDialog'

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<Array<{ resolve: () => void; reject: (err: Error) => void }>>([])

  useEffect(() => {
    setStepUpRequiredHandler(
      () =>
        new Promise<void>((resolve, reject) => {
          pendingRef.current.push({ resolve, reject })
          setOpen(true)
        }),
    )
    return () => setStepUpRequiredHandler(null)
  }, [])

  useEffect(
    () =>
      onSessionEnded(() => {
        settle((waiter) =>
          waiter.reject(new ApiError(0, 'session_ended', 'Session ended before step-up completed.')),
        )
      }),
    [],
  )

  function settle(outcome: (waiter: { resolve: () => void; reject: (err: Error) => void }) => void) {
    setOpen(false)
    const waiters = pendingRef.current
    pendingRef.current = []
    waiters.forEach(outcome)
  }

  function handleVerified() {
    settle((waiter) => waiter.resolve())
  }

  function handleCancel() {
    settle((waiter) =>
      waiter.reject(new ApiError(0, 'step_up_cancelled', 'Step-up verification was cancelled.')),
    )
  }

  return (
    <>
      {children}
      {open && <StepUpDialog onVerified={handleVerified} onCancel={handleCancel} />}
    </>
  )
}
