/**
 * Backend API client.
 *
 * One place that knows the base URL, attaches the bearer token, and turns non-2xx
 * responses into thrown `ApiError`s so callers can just `try`/`catch`.
 */
import type { Course, Enrollment, FeeStatement, SemesterResult, Student } from '@/types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const TOKEN_KEY = 'mu.token'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

/**
 * Called whenever the backend rejects our session — the token expired, or it was revoked
 * server-side (logout elsewhere, or a future TERMINATE_SESSION decision). AuthContext
 * registers a handler that drops the user back to the login screen.
 */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    // 401 on anything other than the login attempt itself means the session is gone.
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      clearToken()
      onUnauthorized?.()
    }
    throw new ApiError(
      res.status,
      body.error ?? 'unknown_error',
      body.message ?? `Request failed (${res.status}).`,
    )
  }

  return body as T
}

// ---- Auth ----

export const login = (studentId: string, password: string) =>
  request<{ token: string; expiresAt: string; student: Student }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ studentId, password }),
  })

export const logout = () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' })

export const fetchMe = () => request<{ student: Student }>('/api/auth/me')

// ---- Portal ----

export const fetchCourses = () => request<{ courses: Course[] }>('/api/courses')

export const fetchEnrollments = () => request<{ enrollments: Enrollment[] }>('/api/enrollments')

/** Both mutations return the refreshed catalogue + enrollments, so the UI stays in step. */
type RegistrationState = { courses: Course[]; enrollments: Enrollment[] }

export const enrollInCourse = (courseCode: string) =>
  request<RegistrationState>('/api/enrollments', {
    method: 'POST',
    body: JSON.stringify({ courseCode }),
  })

export const dropCourse = (courseCode: string) =>
  request<RegistrationState>(`/api/enrollments/${encodeURIComponent(courseCode)}`, {
    method: 'DELETE',
  })

export const fetchFees = () => request<{ statement: FeeStatement }>('/api/fees')

export const fetchResults = () => request<{ results: SemesterResult[] }>('/api/results')
