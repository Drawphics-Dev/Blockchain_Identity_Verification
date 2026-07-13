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
  login: (studentId: string, password: string) => Promise<{ ok: boolean; message?: string }>
  logout: () => Promise<void>
  /** Re-read the student from the backend — GPA and credit load change as courses are registered. */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

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
      const { token, student } = await api.login(studentId, password)
      api.setToken(token)
      setStudent(student)
      return { ok: true }
    } catch (err) {
      const message =
        err instanceof api.ApiError
          ? err.message
          : 'Cannot reach the server. Is the backend running?'
      return { ok: false, message }
    }
  }

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
    () => ({ student, isAuthenticated: !!student, loading, login, logout, refresh }),
    [student, loading, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
