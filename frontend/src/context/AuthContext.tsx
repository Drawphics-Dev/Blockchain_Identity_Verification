import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { currentStudent } from '@/data/student'
import type { Student } from '@/types'

interface AuthState {
  student: Student | null
  isAuthenticated: boolean
  loading: boolean
  /** Mock sign-in. Later this calls the Node backend `/auth/login`. */
  login: (studentId: string, password: string) => Promise<{ ok: boolean; message?: string }>
  logout: () => void
}

const STORAGE_KEY = 'mu.session'

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore a persisted mock session on load.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setStudent(currentStudent)
    setLoading(false)
  }, [])

  const login: AuthState['login'] = async (studentId, password) => {
    // Simulate network + Zero Trust verification latency.
    await new Promise((r) => setTimeout(r, 900))

    // Demo credentials — replace with real backend auth in Track A backend phase.
    const validId = studentId.trim().toUpperCase() === currentStudent.studentId
    const validPass = password === 'demo1234'

    if (!validId) return { ok: false, message: 'Student ID not recognised.' }
    if (!validPass) return { ok: false, message: 'Incorrect password. Try again.' }

    localStorage.setItem(STORAGE_KEY, '1')
    setStudent(currentStudent)
    return { ok: true }
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setStudent(null)
  }

  const value = useMemo<AuthState>(
    () => ({ student, isAuthenticated: !!student, loading, login, logout }),
    [student, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
