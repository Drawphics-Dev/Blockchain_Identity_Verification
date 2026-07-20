import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import * as api from '@/lib/api'
import type { Student } from '@/types'

/**
 * How often the signed-in student's live risk is re-read from the backend.
 *
 * Matched to the backend's continuous-monitor tick (policy.config.ts
 * `continuousMonitorIntervalMs` = 15s) on purpose: the monitor is what changes the score
 * without any user action, so polling faster only adds traffic and polling slower leaves the
 * dashboard showing a number the engine has already superseded.
 *
 * `/api/auth/me` is deliberately the endpoint. It sits on the auth router behind `requireAuth`
 * only — NOT behind the PEP — so this poll cannot feed its own request rate back into the
 * highRequestRate signal, nor add resources to the navigation-breadth window. A widget that
 * raised the risk it displays would be worse than no widget.
 */
const TRUST_POLL_MS = 15_000

interface AuthState {
  student: Student | null
  isAuthenticated: boolean
  loading: boolean
  /**
   * Why the last session ended, or null if none has. `terminated` means the Zero Trust engine
   * ended it — the login screen surfaces that, so a continuous-verification kill is visible
   * rather than looking like an ordinary timeout.
   */
  sessionEndReason: api.SessionEndReason | null
  /** Phase 1 of login: password only. `stepUpRequired: true` means the engine flagged this
   * device/network — the caller must collect a TOTP code and call `completeStepUp` before
   * the student is actually considered signed in (see ROADMAP Phase 7: "Login (+MFA)"). */
  login: (
    studentId: string,
    password: string,
  ) => Promise<{ ok: true; stepUpRequired: boolean } | { ok: false; message: string }>
  /**
   * Phase 2 of login: call once the MFA challenge has been satisfied server-side (MfaChallenge
   * owns that call, since enrolling and verifying hit different endpoints). This promotes the
   * pending student to signed-in.
   */
  confirmMfaVerified: () => void
  /** Abandon a login that got as far as `stepUpRequired` but never satisfied the challenge. */
  cancelPendingLogin: () => void
  logout: () => Promise<void>
  /** Re-read the student from the backend — GPA and credit load change as courses are registered. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)
  // Holds the student between "password verified" and "step-up verified" — not exposed as
  // `student`/`isAuthenticated` yet, so ProtectedRoute won't admit a half-finished login.
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null)
  const [sessionEndReason, setSessionEndReason] = useState<api.SessionEndReason | null>(null)

  // Restore the session on load. A stored token is only trustworthy if the backend still
  // accepts it — so we ask, rather than assume.
  useEffect(() => {
    if (!api.getToken()) {
      setLoading(false)
      return
    }
    api
      .fetchMe()
      .then(({ student }) => setStudent(student))
      .catch(() => {
        api.clearToken()
        setStudent(null)
      })
      .finally(() => setLoading(false))
  }, [])

  // The API client calls this when the backend rejects our session mid-flight (expired,
  // or revoked server-side). Dropping the student sends ProtectedRoute back to /login.
  useEffect(() => {
    api.setUnauthorizedHandler((reason) => {
      setStudent(null)
      setPendingStudent(null)
      setSessionEndReason(reason)
    })
  }, [])

  const login: AuthState['login'] = async (studentId, password) => {
    try {
      const { token, student, stepUpRequired } = await api.login(studentId, password)
      api.setToken(token)
      // A successful sign-in retires whatever ended the previous session.
      setSessionEndReason(null)
      if (stepUpRequired) {
        setPendingStudent(student)
      } else {
        setStudent(student)
      }
      return { ok: true, stepUpRequired }
    } catch (err) {
      const message =
        err instanceof api.ApiError
          ? err.message
          : 'Cannot reach the server. Is the backend running?'
      return { ok: false, message }
    }
  }

  const confirmMfaVerified = useCallback(() => {
    setStudent((current) => current ?? pendingStudent)
    setPendingStudent(null)
  }, [pendingStudent])

  const cancelPendingLogin = useCallback(() => {
    api.clearToken()
    setPendingStudent(null)
  }, [])

  const logout = useCallback(async () => {
    // Revoke server-side first, so the token is dead even if a copy of it survives.
    await api.logout().catch(() => undefined)
    api.clearToken()
    setStudent(null)
    // A deliberate sign-out is not a session END worth explaining on the login screen.
    setSessionEndReason(null)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { student } = await api.fetchMe()
      setStudent(student)
    } catch {
      // Not fatal — the 401 handler above deals with a dead session.
    }
  }, [])

  /**
   * Keeps the trust/risk widget LIVE (ROADMAP Phase 7). Without this the score is a snapshot
   * taken at login: the background monitor can drive a session's risk all the way to
   * termination while the dashboard still displays the login-time number, which makes the
   * continuous-verification story invisible in the one place it should be most obvious.
   *
   * Polling is suspended while the tab is hidden and resumed with an immediate read on
   * return, so a student coming back to the tab sees current state rather than waiting out
   * the remainder of an interval.
   */
  useEffect(() => {
    if (!student) return

    let cancelled = false
    const tick = () => {
      if (!cancelled && document.visibilityState === 'visible') void refresh()
    }

    const timer = window.setInterval(tick, TRUST_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // Re-armed on sign-in/sign-out only — `student` identity changes on every poll, so keying
    // on the id keeps this effect from tearing down and rebuilding its timer each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, refresh])

  const value = useMemo<AuthState>(
    () => ({
      student,
      isAuthenticated: !!student,
      loading,
      sessionEndReason,
      login,
      confirmMfaVerified,
      cancelPendingLogin,
      logout,
      refresh,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      student,
      pendingStudent,
      loading,
      sessionEndReason,
      confirmMfaVerified,
      cancelPendingLogin,
      logout,
      refresh,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
