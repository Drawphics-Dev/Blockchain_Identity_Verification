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

interface AuthState {
  student: Student | null
  isAuthenticated: boolean
  loading: boolean
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
    api.setUnauthorizedHandler(() => setStudent(null))
  }, [])

  const login: AuthState['login'] = async (studentId, password) => {
    try {
      const { token, student, stepUpRequired } = await api.login(studentId, password)
      api.setToken(token)
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
  }, [])

  const refresh = useCallback(async () => {
    try {
      const { student } = await api.fetchMe()
      setStudent(student)
    } catch {
      // Not fatal — the 401 handler above deals with a dead session.
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      student,
      isAuthenticated: !!student,
      loading,
      login,
      confirmMfaVerified,
      cancelPendingLogin,
      logout,
      refresh,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [student, pendingStudent, loading, confirmMfaVerified, cancelPendingLogin, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
