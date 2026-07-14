/**
 * Backend API client.
 *
 * One place that knows the base URL, attaches the bearer token, and turns non-2xx
 * responses into thrown `ApiError`s so callers can just `try`/`catch`.
 */
import type {
  AuditEvent,
  Course,
  Enrollment,
  EngineMetrics,
  FeeStatement,
  IntegrityResult,
  SemesterResult,
  Student,
} from '@/types'
import { collectTelemetry } from './telemetry'

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
 * server-side (logout elsewhere, or a TERMINATE decision from the Zero Trust engine).
 * AuthContext registers a handler that drops the user back to the login screen.
 */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

/**
 * Fired alongside `onUnauthorized` — anything holding UI state tied to an active session
 * subscribes here so it can't outlive the session it belongs to. Specifically: the step-up
 * dialog. Without this, a dialog opened for one session can stay open after that session
 * dies (token expired/revoked mid-flow), showing a confusing "missing bearer token" error
 * on submit instead of just closing.
 */
const sessionEndedListeners = new Set<() => void>()
export function onSessionEnded(fn: () => void): () => void {
  sessionEndedListeners.add(fn)
  return () => sessionEndedListeners.delete(fn)
}

/**
 * Called whenever the Zero Trust PEP blocks a request with `step_up_required`. Registered
 * by <StepUpProvider>, which shows the code dialog and resolves once `POST
 * /api/auth/step-up` succeeds — the original request is then retried once, transparently
 * to the caller. Rejects (and the original request fails normally) if the student cancels.
 */
let onStepUpRequired: (() => Promise<void>) | null = null
export function setStepUpRequiredHandler(fn: (() => Promise<void>) | null) {
  onStepUpRequired = fn
}

async function request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
  const token = getToken()

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Telemetry': collectTelemetry(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    // Pause for step-up once, then transparently replay the exact same request.
    if (body.error === 'step_up_required' && !isRetry && onStepUpRequired) {
      await onStepUpRequired()
      return request<T>(path, init, true)
    }

    // 401 on anything other than the login attempt itself means the session is gone.
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      clearToken()
      onUnauthorized?.()
      sessionEndedListeners.forEach((fn) => fn())
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
  request<{
    token: string
    expiresAt: string
    student: Student
    stepUpRequired: boolean
    mfaEnrolled: boolean
  }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ studentId, password }) })

/**
 * The one-time enrollment reveal. Requires the registrar's out-of-band enrollment token — a
 * correct password is deliberately not enough, or a password thief could bind their own
 * authenticator. 403 `invalid_enrollment_token` if wrong; 409 `already_enrolled` once bound.
 */
export const fetchMfaEnrollment = (token: string) =>
  request<{ secret: string; otpauthUrl: string; qrDataUrl: string }>(
    `/api/auth/mfa/enroll?token=${encodeURIComponent(token)}`,
  )

/** Binds the authenticator by proving the token AND a code from it, satisfying the step-up. */
export const completeMfaEnrollment = (token: string, code: string) =>
  request<{ ok: true; validUntil: string }>('/api/auth/mfa/enroll', {
    method: 'POST',
    body: JSON.stringify({ token, code }),
  })

/** True when this account still needs to bind an authenticator (i.e. enrollment is pending). */
export const isMfaEnrollmentPending = async (): Promise<boolean> => {
  try {
    // A deliberately-empty token: we only want the server's verdict on WHICH challenge this
    // is, not the secret. `already_enrolled` (409) => verify. Anything else => enroll.
    await request('/api/auth/mfa/enroll?token=')
    return true
  } catch (err) {
    return !(err instanceof ApiError && err.code === 'already_enrolled')
  }
}

export const logout = () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' })

export const fetchMe = () => request<{ student: Student }>('/api/auth/me')

/** Completes a STEP_UP challenge. Called directly by the step-up dialog, not through the
 * `onStepUpRequired` interception — this *is* what satisfies it. */
export const submitStepUp = (code: string) =>
  request<{ ok: true; validUntil: string }>('/api/auth/step-up', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

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

// ---- Admin / research ----

export const fetchAuditTrail = (studentId?: string) =>
  request<{ trail: AuditEvent[]; truncated: boolean; totalEvents: number }>(
    `/api/admin/audit${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''}`,
  )

export const verifyAuditEvent = (eventId: string) =>
  request<IntegrityResult>(`/api/admin/audit/verify/${encodeURIComponent(eventId)}`)

export const fetchMetrics = () => request<EngineMetrics>('/api/admin/metrics')
