/**
 * Portal read models — turns the relational rows into the exact shapes the React portal
 * consumes (see frontend/src/types/index.ts), so the UI needs no translation layer.
 *
 * Derived values (cumulative GPA, registered credits, effective course status) are computed
 * here rather than stored, so they can never drift from the underlying rows.
 */
import { prisma } from '../db/prisma'

/** The semester students currently register into. Single-semester prototype. */
export const CURRENT_SEMESTER = 'Semester 1'

/** Maximum credit load per semester — enforced server-side, mirrored in the UI. */
export const MAX_CREDITS = 24

/**
 * The student's current Zero Trust confidence: 100 minus the risk score of their most
 * recent PDP decision (login or protected request). A student with no risk history yet
 * (fresh seed data, never logged in) reads as fully trusted, matching the engine's own
 * default — a request with no signals firing scores 0 risk.
 */
async function currentTrustScore(studentId: string): Promise<number> {
  const latest = await prisma.riskEvent.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
  })
  return latest ? Math.max(0, 100 - latest.riskScore) : 100
}

/** Credit-weighted GPA across every graded semester. */
function cumulativeGpa(
  sets: Array<{ records: Array<{ credits: number; gradePoint: number }> }>,
): number {
  const all = sets.flatMap((s) => s.records)
  const credits = all.reduce((sum, r) => sum + r.credits, 0)
  if (credits === 0) return 0
  const points = all.reduce((sum, r) => sum + r.gradePoint * r.credits, 0)
  return Number((points / credits).toFixed(2))
}

/** The `Student` object the frontend expects, with derived academic figures. */
export async function getStudentProfile(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: { include: { course: { select: { credits: true } } } },
      results: { include: { records: { select: { credits: true, gradePoint: true } } } },
    },
  })
  if (!student) return null

  return {
    id: student.id,
    studentId: student.studentId,
    fullName: student.fullName,
    email: student.email,
    program: student.program,
    level: student.level,
    gpa: cumulativeGpa(student.results),
    enrolledCredits: student.enrollments.reduce((sum, e) => sum + e.course.credits, 0),
    trustScore: await currentTrustScore(student.id),
  }
}

/** The course catalogue. A full course reads as `closed` regardless of its authored status. */
export async function getCourses() {
  const courses = await prisma.course.findMany({ orderBy: { code: 'asc' } })
  return courses.map((c) => ({
    code: c.code,
    title: c.title,
    credits: c.credits,
    lecturer: c.lecturer,
    schedule: c.schedule,
    seatsTaken: c.seatsTaken,
    seatsTotal: c.seatsTotal,
    status: c.seatsTaken >= c.seatsTotal ? ('closed' as const) : c.status,
    department: c.department,
  }))
}

export async function getEnrollments(studentId: string) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { registeredAt: 'asc' },
  })
  return rows.map((e) => ({
    courseCode: e.courseCode,
    semester: e.semester,
    registeredAt: e.registeredAt.toISOString(),
  }))
}

export async function getFeeStatement(studentId: string) {
  const statement = await prisma.feeStatement.findFirst({
    where: { studentId },
    include: { items: true, payments: { orderBy: { paidAt: 'asc' } } },
  })
  if (!statement) return null

  const items = statement.items.map((i) => ({
    label: i.label,
    amount: i.amount,
    category: i.category,
  }))
  const payments = statement.payments.map((p) => ({
    id: p.id,
    date: p.paidAt.toISOString().slice(0, 10),
    method: p.method,
    amount: p.amount,
    reference: p.reference,
  }))

  return {
    semester: statement.semester,
    items,
    payments,
    // Totals are summed, never stored — they cannot disagree with the line items.
    totalDue: items.reduce((sum, i) => sum + i.amount, 0),
    totalPaid: payments.reduce((sum, p) => sum + p.amount, 0),
  }
}

export async function getResults(studentId: string) {
  const sets = await prisma.resultSet.findMany({
    where: { studentId },
    include: { records: true },
    orderBy: { semester: 'desc' },
  })
  return sets.map((s) => ({
    semester: s.semester,
    gpa: s.gpa,
    records: s.records.map((r) => ({
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      credits: r.credits,
      score: r.score,
      grade: r.grade,
      gradePoint: r.gradePoint,
    })),
  }))
}

export class EnrollmentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Register a course. Runs in a transaction so the seat count and the enrollment row can
 * never disagree, and re-reads the course inside it so two simultaneous registrations
 * cannot both take the last seat.
 */
export async function enroll(studentId: string, courseCode: string) {
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findUnique({ where: { code: courseCode } })
    if (!course) throw new EnrollmentError(404, 'course_not_found', `Unknown course ${courseCode}.`)

    const existing = await tx.enrollment.findUnique({
      where: {
        studentId_courseCode_semester: { studentId, courseCode, semester: CURRENT_SEMESTER },
      },
    })
    if (existing) {
      throw new EnrollmentError(409, 'already_registered', `Already registered for ${courseCode}.`)
    }

    if (course.seatsTaken >= course.seatsTotal) {
      throw new EnrollmentError(409, 'course_full', `${courseCode} has no seats remaining.`)
    }

    const current = await tx.enrollment.findMany({
      where: { studentId, semester: CURRENT_SEMESTER },
      include: { course: { select: { credits: true } } },
    })
    const load = current.reduce((sum, e) => sum + e.course.credits, 0)
    if (load + course.credits > MAX_CREDITS) {
      throw new EnrollmentError(
        409,
        'credit_limit_exceeded',
        `Registering ${courseCode} would take you to ${load + course.credits} credits, over the ${MAX_CREDITS}-credit limit.`,
      )
    }

    await tx.course.update({
      where: { code: courseCode },
      data: { seatsTaken: { increment: 1 } },
    })
    return tx.enrollment.create({
      data: { studentId, courseCode, semester: CURRENT_SEMESTER },
    })
  })
}

/** Drop a course, freeing its seat. */
export async function drop(studentId: string, courseCode: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.enrollment.findUnique({
      where: {
        studentId_courseCode_semester: { studentId, courseCode, semester: CURRENT_SEMESTER },
      },
    })
    if (!existing) {
      throw new EnrollmentError(404, 'not_registered', `Not registered for ${courseCode}.`)
    }

    await tx.enrollment.delete({ where: { id: existing.id } })
    await tx.course.update({
      where: { code: courseCode },
      data: { seatsTaken: { decrement: 1 } },
    })
  })
}
