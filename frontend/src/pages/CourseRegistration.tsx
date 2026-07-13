import { useMemo, useState } from 'react'
import { Plus, Check, Trash2, Users, Clock, User, Search, CircleAlert, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Loading } from '@/components/ui/States'
import { useAuth } from '@/context/AuthContext'
import { useResource } from '@/hooks/useResource'
import { ApiError, dropCourse, enrollInCourse, fetchCourses, fetchEnrollments } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Course, Enrollment } from '@/types'

const MAX_CREDITS = 24

const statusTone = { open: 'success', waitlist: 'warning', closed: 'danger' } as const

interface RegistrationState {
  courses: Course[]
  enrollments: Enrollment[]
}

export function CourseRegistration() {
  const { refresh } = useAuth()
  const [query, setQuery] = useState('')
  /** The course code currently being registered or dropped, so only its button spins. */
  const [pending, setPending] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const state = useResource<RegistrationState>(async () => {
    const [{ courses }, { enrollments }] = await Promise.all([fetchCourses(), fetchEnrollments()])
    return { courses, enrollments }
  })

  const registeredCodes = useMemo(
    () => new Set((state.data?.enrollments ?? []).map((e) => e.courseCode)),
    [state.data],
  )

  // The header renders immediately and stays put; only the body below it swaps between
  // loading, error and content. Blanking the whole page would make the layout jump.
  const header = (
    <PageHeader
      eyebrow="Registration"
      title="Course Registration"
      description="Register or drop units for Semester 1, 2025/2026. Changes are saved immediately."
    />
  )

  if (state.loading) {
    return (
      <div>
        {header}
        <Loading label="Loading course catalogue…" />
      </div>
    )
  }
  if (state.error || !state.data) {
    return (
      <div>
        {header}
        <ErrorState message={state.error ?? 'Could not load courses.'} onRetry={state.reload} />
      </div>
    )
  }

  const { courses } = state.data

  const registeredCourses = courses.filter((c) => registeredCodes.has(c.code))
  const totalCredits = registeredCourses.reduce((sum, c) => sum + c.credits, 0)

  const filtered = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.code.toLowerCase().includes(query.toLowerCase()),
  )

  /**
   * Register or drop. The server is the authority: it re-checks seats and the credit limit,
   * and returns the updated catalogue + enrollments, which we adopt wholesale. No optimistic
   * update — a rejected registration must not briefly appear to have succeeded.
   */
  async function toggle(course: Course) {
    const isRegistered = registeredCodes.has(course.code)
    setPending(course.code)
    setActionError(null)

    try {
      const next = isRegistered ? await dropCourse(course.code) : await enrollInCourse(course.code)
      state.set(next)
      // GPA and credit load live on the student record — pull the new figures.
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Registration failed. Please try again.',
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <div>
      {header}

      {actionError && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <CircleAlert className="h-4 w-4 flex-none" />
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1.7fr_1fr]">
        {/* Catalogue */}
        <div>
          <div className="relative mb-5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input
              className="input pl-11"
              placeholder="Search by course code or title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="stagger divide-y divide-navy-100 border-y border-navy-100">
            {filtered.map((course) => {
              const isRegistered = registeredCodes.has(course.code)
              const fill = Math.round((course.seatsTaken / course.seatsTotal) * 100)
              const isFull = course.status === 'closed' && !isRegistered
              const isPending = pending === course.code
              const disabled = isFull || isPending

              return (
                <div
                  key={course.code}
                  className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-900">
                        {course.code}
                      </span>
                      <Badge tone={statusTone[course.status]}>{course.status}</Badge>
                      <span className="text-xs text-navy-400">· {course.department}</span>
                    </div>
                    <h3 className="mt-1.5 font-display text-lg font-semibold text-navy-900">
                      {course.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-navy-500">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-navy-300" /> {course.lecturer}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-navy-300" /> {course.schedule}
                      </span>
                      <span>{course.credits} credits</span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-navy-300" />
                        {course.seatsTaken}/{course.seatsTotal}
                      </span>
                    </div>
                    <ProgressBar
                      value={fill}
                      tone={fill >= 100 ? 'red' : fill >= 85 ? 'amber' : 'emerald'}
                      className="mt-3 max-w-[240px]"
                    />
                  </div>

                  <button
                    onClick={() => toggle(course)}
                    disabled={disabled}
                    className={cn(
                      'btn btn-md w-full flex-none sm:w-auto',
                      isRegistered
                        ? 'btn-danger'
                        : isFull
                          ? 'cursor-not-allowed bg-navy-50 text-navy-300'
                          : 'btn-primary',
                      isPending && 'opacity-60',
                    )}
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isRegistered ? 'Dropping…' : 'Registering…'}
                      </>
                    ) : isRegistered ? (
                      <>
                        <Trash2 className="h-4 w-4" /> Drop
                      </>
                    ) : isFull ? (
                      'Full'
                    ) : (
                      <>
                        <Plus className="h-4 w-4" /> Register
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Summary */}
        <aside>
          <div className="sticky top-32">
            <h2 className="font-display text-xl font-semibold text-navy-900">Registration Summary</h2>
            <p className="mb-5 mt-1 text-sm text-navy-500">Semester 1 · 2025/2026</p>

            <div className="flex items-end justify-between border-y border-navy-100 py-4">
              <span className="text-sm font-medium text-navy-600">Total Credit Units</span>
              <span className="font-display text-3xl font-semibold text-navy-900 tabular-nums">
                {totalCredits}
                <span className="text-base font-medium text-navy-300">/{MAX_CREDITS}</span>
              </span>
            </div>
            <ProgressBar
              value={(totalCredits / MAX_CREDITS) * 100}
              tone={totalCredits > MAX_CREDITS ? 'red' : 'navy'}
              className="mt-3"
            />

            {registeredCourses.length === 0 ? (
              <p className="mt-5 text-sm text-navy-400">
                No courses registered yet. Register from the catalogue to build your semester.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {registeredCourses.map((c) => (
                  <li key={c.code} className="flex items-center gap-3">
                    <Check className="h-4 w-4 flex-none text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy-800">{c.code}</p>
                      <p className="truncate text-xs text-navy-400">{c.title}</p>
                    </div>
                    <span className="text-xs font-semibold text-navy-500 tabular-nums">
                      {c.credits}u
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-6 border-t border-navy-100 pt-4 text-xs text-navy-400">
              Registrations are saved to your record as soon as you register or drop — there is
              nothing further to submit. The {MAX_CREDITS}-credit maximum is enforced by the
              server.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
