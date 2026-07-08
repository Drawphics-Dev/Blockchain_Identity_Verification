import { useMemo, useState } from 'react'
import { Plus, Check, Trash2, Users, Clock, User, Search, CircleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { availableCourses, initialEnrollments } from '@/data/courses'
import { cn } from '@/lib/utils'
import type { Course } from '@/types'

const MAX_CREDITS = 24

const statusTone = { open: 'success', waitlist: 'warning', closed: 'danger' } as const

export function CourseRegistration() {
  const [registered, setRegistered] = useState<string[]>(initialEnrollments.map((e) => e.courseCode))
  const [query, setQuery] = useState('')

  const byCode = useMemo(() => Object.fromEntries(availableCourses.map((c) => [c.code, c])), [])
  const registeredCourses = registered.map((code) => byCode[code]).filter(Boolean) as Course[]
  const totalCredits = registeredCourses.reduce((sum, c) => sum + c.credits, 0)

  const filtered = availableCourses.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.code.toLowerCase().includes(query.toLowerCase()),
  )

  const toggle = (code: string) =>
    setRegistered((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))

  return (
    <div>
      <PageHeader
        eyebrow="Registration"
        title="Course Registration"
        description="Register or drop units for Semester 1, 2025/2026. Submissions are signed and recorded on the blockchain audit trail."
      />

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
              const isRegistered = registered.includes(course.code)
              const fill = Math.round((course.seatsTaken / course.seatsTotal) * 100)
              const disabled = course.status === 'closed' && !isRegistered

              return (
                <div key={course.code} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-900">{course.code}</span>
                      <Badge tone={statusTone[course.status]}>{course.status}</Badge>
                      <span className="text-xs text-navy-400">· {course.department}</span>
                    </div>
                    <h3 className="mt-1.5 font-display text-lg font-semibold text-navy-900">{course.title}</h3>
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
                    onClick={() => toggle(course.code)}
                    disabled={disabled}
                    className={cn(
                      'btn btn-md w-full flex-none sm:w-auto',
                      isRegistered ? 'btn-danger' : disabled ? 'cursor-not-allowed bg-navy-50 text-navy-300' : 'btn-primary',
                    )}
                  >
                    {isRegistered ? (
                      <>
                        <Trash2 className="h-4 w-4" /> Drop
                      </>
                    ) : disabled ? (
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
            {totalCredits > MAX_CREDITS && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                <CircleAlert className="h-3.5 w-3.5" /> Exceeds maximum load
              </p>
            )}

            <ul className="mt-5 space-y-3">
              {registeredCourses.map((c) => (
                <li key={c.code} className="flex items-center gap-3">
                  <Check className="h-4 w-4 flex-none text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-800">{c.code}</p>
                    <p className="truncate text-xs text-navy-400">{c.title}</p>
                  </div>
                  <span className="text-xs font-semibold text-navy-500 tabular-nums">{c.credits}u</span>
                </li>
              ))}
            </ul>

            <button
              className="btn-accent btn-md mt-6 w-full"
              disabled={totalCredits === 0 || totalCredits > MAX_CREDITS}
            >
              <Check className="h-4 w-4" /> Submit Registration
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
