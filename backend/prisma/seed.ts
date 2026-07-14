/**
 * Database seed — ROADMAP Phase 3, extended for the Phase 8/9 synthetic population.
 *
 * Populates the course catalogue, a hand-authored "hero" demo student (unchanged from
 * before — same ID/password/results, so anything already referencing it keeps working),
 * and a wider population of synthetic students for attack-simulation and metrics work
 * (ROADMAP §6 Phase 8–9 calls for 20–50). Every seeded student shares the demo password
 * and gets their own TOTP secret — this is entirely synthetic data (ROADMAP §8: no real
 * student data).
 *
 * Idempotent: safe to re-run (`npm run db:seed`). It clears the seeded tables first.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type CourseStatus, type FeeCategory } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateSecret } from 'otplib'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const DEMO_PASSWORD = 'demo1234'
const SEMESTER = 'Semester 1'
const FEE_SEMESTER = 'Semester 1 · 2025/2026'
/** Mirrors portal.service.ts's MAX_CREDITS — kept independent since this script doesn't
 * import application code, but must not drift from it. */
const MAX_CREDITS = 24
/** Plus the hero student below, for 30 total — within the roadmap's 20–50 target. */
const SYNTHETIC_STUDENT_COUNT = 29

const courses: Array<{
  code: string
  title: string
  credits: number
  lecturer: string
  schedule: string
  seatsTotal: number
  status: CourseStatus
  department: string
}> = [
  { code: 'CSC 301', title: 'Data Structures & Algorithms', credits: 3, lecturer: 'Dr. E. Nwosu', schedule: 'Mon 10:00 · Wed 12:00', seatsTotal: 120, status: 'open', department: 'Computer Science' },
  { code: 'CSC 305', title: 'Operating Systems', credits: 3, lecturer: 'Prof. K. Adeyemi', schedule: 'Tue 08:00 · Thu 10:00', seatsTotal: 120, status: 'open', department: 'Computer Science' },
  { code: 'CSC 311', title: 'Database Systems', credits: 3, lecturer: 'Dr. R. Balogun', schedule: 'Mon 14:00 · Fri 09:00', seatsTotal: 120, status: 'closed', department: 'Computer Science' },
  { code: 'CSC 317', title: 'Computer Networks', credits: 3, lecturer: 'Dr. S. Mensah', schedule: 'Wed 08:00 · Thu 14:00', seatsTotal: 100, status: 'open', department: 'Computer Science' },
  { code: 'CSC 321', title: 'Cryptography & Blockchain', credits: 4, lecturer: 'Prof. L. Danladi', schedule: 'Tue 12:00 · Fri 12:00', seatsTotal: 90, status: 'waitlist', department: 'Computer Science' },
  { code: 'MTH 303', title: 'Linear Algebra II', credits: 3, lecturer: 'Dr. F. Okafor', schedule: 'Mon 08:00 · Wed 10:00', seatsTotal: 150, status: 'open', department: 'Mathematics' },
  { code: 'GST 301', title: 'Entrepreneurship & Innovation', credits: 2, lecturer: 'Mrs. B. Hassan', schedule: 'Thu 16:00', seatsTotal: 300, status: 'open', department: 'General Studies' },
]

/**
 * Original hand-authored occupancy, minus the hero student's own registrations below — the
 * seats taken by students outside this dataset. Real seatsTaken is written at the end of
 * `main`, once every enrollment actually modeled (hero + synthetic) is known, so the
 * numbers stay coherent regardless of how large the synthetic population grows.
 */
const AMBIENT_SEATS_TAKEN: Record<string, number> = {
  'CSC 301': 117,
  'CSC 305': 95,
  'CSC 311': 120,
  'CSC 317': 74,
  'CSC 321': 87,
  'MTH 303': 59,
  'GST 301': 209,
}

const enrolledCourseCodes = ['CSC 301', 'CSC 305', 'CSC 321', 'MTH 303', 'GST 301']

const feeItems: Array<{ label: string; amount: number; category: FeeCategory }> = [
  { label: 'Tuition Fee', amount: 180_000, category: 'tuition' },
  { label: 'Accommodation (Hall B)', amount: 65_000, category: 'accommodation' },
  { label: 'Library & Digital Resources', amount: 12_000, category: 'library' },
  { label: 'Laboratory & Practical', amount: 18_000, category: 'lab' },
  { label: 'Student Union & ID Card', amount: 8_000, category: 'other' },
]
const totalFeeDue = feeItems.reduce((sum, i) => sum + i.amount, 0)

const heroPayments = [
  { paidAt: new Date('2025-09-14'), method: 'Bank Transfer', amount: 150_000, reference: 'TRX-8842190' },
  { paidAt: new Date('2025-10-02'), method: 'Card', amount: 60_000, reference: 'TRX-9021775' },
]

const heroResultSets = [
  {
    semester: 'Semester 2 · 2024/2025',
    gpa: 3.72,
    records: [
      { courseCode: 'CSC 202', courseTitle: 'Object-Oriented Programming', credits: 3, score: 84, grade: 'A', gradePoint: 4.0 },
      { courseCode: 'CSC 204', courseTitle: 'Discrete Mathematics', credits: 3, score: 76, grade: 'A-', gradePoint: 3.7 },
      { courseCode: 'CSC 206', courseTitle: 'Digital Logic Design', credits: 3, score: 71, grade: 'B+', gradePoint: 3.3 },
      { courseCode: 'MTH 202', courseTitle: 'Calculus III', credits: 3, score: 68, grade: 'B', gradePoint: 3.0 },
      { courseCode: 'GST 202', courseTitle: 'Philosophy & Logic', credits: 2, score: 88, grade: 'A', gradePoint: 4.0 },
    ],
  },
  {
    semester: 'Semester 1 · 2024/2025',
    gpa: 3.55,
    records: [
      { courseCode: 'CSC 201', courseTitle: 'Introduction to Programming', credits: 3, score: 80, grade: 'A', gradePoint: 4.0 },
      { courseCode: 'CSC 203', courseTitle: 'Computer Architecture', credits: 3, score: 69, grade: 'B', gradePoint: 3.0 },
      { courseCode: 'MTH 201', courseTitle: 'Calculus II', credits: 3, score: 73, grade: 'B+', gradePoint: 3.3 },
      { courseCode: 'PHY 201', courseTitle: 'Electromagnetism', credits: 3, score: 65, grade: 'B-', gradePoint: 2.7 },
      { courseCode: 'GST 201', courseTitle: 'Use of English II', credits: 2, score: 90, grade: 'A', gradePoint: 4.0 },
    ],
  },
]

// ---- Synthetic population ----
// A wider, generated roster for the attack-simulation and metrics phases. Every student
// shares DEMO_PASSWORD (documented, synthetic-only — ROADMAP §8) and gets their own TOTP
// secret; grades and fee histories vary so the later metrics have something real to chew on.

const FIRST_NAMES = [
  'Chidinma', 'Emeka', 'Ngozi', 'Tunde', 'Amaka', 'Yusuf', 'Folake', 'Ibrahim', 'Chiamaka',
  'Segun', 'Fatima', 'Obinna', 'Aisha', 'Kelechi', 'Bimbo', 'Musa', 'Ifeoma', 'Damilola',
  'Hauwa', 'Uche', 'Temitope', 'Nnamdi', 'Zainab', 'Adaeze', 'Kunle', 'Blessing', 'Suleiman',
  'Ngozika', 'Femi', 'Halima',
]
const LAST_NAMES = [
  'Balogun', 'Okafor', 'Adeyemi', 'Nwosu', 'Danladi', 'Hassan', 'Mensah', 'Eze', 'Chukwu',
  'Bello', 'Yusuf', 'Afolabi', 'Ibrahim', 'Umar', 'Adebayo', 'Okoro', 'Suleiman', 'Ogundipe',
  'Abiodun', 'Ojo', 'Mahmud', 'Onyekachi', 'Fashola',
]
const LEVELS = ['200 Level', '300 Level', '400 Level']

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(0, arr.length - 1)]
}
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A clean, consistent scale for generated grades. The hero student's grades above are
 * hand-authored and illustrative, so they don't need to follow this exactly. */
function scoreToGrade(score: number): { grade: string; gradePoint: number } {
  if (score >= 90) return { grade: 'A', gradePoint: 4.0 }
  if (score >= 80) return { grade: 'A-', gradePoint: 3.7 }
  if (score >= 75) return { grade: 'B+', gradePoint: 3.3 }
  if (score >= 70) return { grade: 'B', gradePoint: 3.0 }
  if (score >= 65) return { grade: 'B-', gradePoint: 2.7 }
  if (score >= 60) return { grade: 'C+', gradePoint: 2.3 }
  if (score >= 55) return { grade: 'C', gradePoint: 2.0 }
  if (score >= 50) return { grade: 'D', gradePoint: 1.0 }
  return { grade: 'F', gradePoint: 0 }
}

function weightedGpa(records: Array<{ credits: number; gradePoint: number }>): number {
  const credits = records.reduce((sum, r) => sum + r.credits, 0)
  if (credits === 0) return 0
  const points = records.reduce((sum, r) => sum + r.gradePoint * r.credits, 0)
  return Number((points / credits).toFixed(2))
}

interface SyntheticStudent {
  studentId: string
  fullName: string
  email: string
  level: string
  /** 0–1, biases generated scores so GPAs vary realistically across the population. */
  performance: number
}

function buildSyntheticRoster(count: number): SyntheticStudent[] {
  const usedIds = new Set<string>(['SU/CS/2023/0187'])
  const usedEmails = new Set<string>(['amina.okonkwo@stateuniversity.edu'])
  const roster: SyntheticStudent[] = []

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)

    let email = `${first.toLowerCase()}.${last.toLowerCase()}@stateuniversity.edu`
    let suffix = 1
    while (usedEmails.has(email)) {
      suffix += 1
      email = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@stateuniversity.edu`
    }
    usedEmails.add(email)

    let studentId = ''
    while (!studentId || usedIds.has(studentId)) {
      const year = pick(['2021', '2022', '2023', '2024'])
      studentId = `SU/CS/${year}/${String(randomInt(1, 999)).padStart(4, '0')}`
    }
    usedIds.add(studentId)

    roster.push({
      studentId,
      fullName: `${first} ${last}`,
      email,
      level: pick(LEVELS),
      performance: Math.random(),
    })
  }

  return roster
}

async function main() {
  // Clear in FK-safe order. Cascades handle the children, but be explicit.
  await prisma.session.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.resultRecord.deleteMany()
  await prisma.resultSet.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.feeItem.deleteMany()
  await prisma.feeStatement.deleteMany()
  await prisma.student.deleteMany()
  await prisma.course.deleteMany()

  // seatsTaken starts at 0 and is written for real at the end, once every enrollment this
  // script creates (hero + synthetic) is known.
  await prisma.course.createMany({ data: courses.map((c) => ({ ...c, seatsTaken: 0 })) })

  // Live seat counter, seeded from the ambient baseline — mirrors the app's own enroll()
  // capacity check, so nobody (including synthetic students) can register into a full course.
  const seatsTaken = new Map<string, number>(
    courses.map((c) => [
      c.code,
      AMBIENT_SEATS_TAKEN[c.code] + (enrolledCourseCodes.includes(c.code) ? 1 : 0),
    ]),
  )

  // ---- Hero student — unchanged from before ----

  const heroTotpSecret = generateSecret()
  const hero = await prisma.student.create({
    data: {
      studentId: 'SU/CS/2023/0187',
      fullName: 'Amina Okonkwo',
      email: 'amina.okonkwo@stateuniversity.edu',
      program: 'BSc Computer Science',
      level: '300 Level',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      totpSecret: heroTotpSecret,
    },
  })

  await prisma.enrollment.createMany({
    data: enrolledCourseCodes.map((courseCode) => ({
      studentId: hero.id,
      courseCode,
      semester: SEMESTER,
    })),
  })

  await prisma.feeStatement.create({
    data: {
      studentId: hero.id,
      semester: FEE_SEMESTER,
      items: { create: feeItems },
      payments: { create: heroPayments },
    },
  })

  for (const set of heroResultSets) {
    await prisma.resultSet.create({
      data: { studentId: hero.id, semester: set.semester, gpa: set.gpa, records: { create: set.records } },
    })
  }

  // ---- Synthetic population ----

  const roster = buildSyntheticRoster(SYNTHETIC_STUDENT_COUNT)
  let paymentSeq = 9_100_000

  for (const person of roster) {
    const totpSecret = generateSecret()
    const student = await prisma.student.create({
      data: {
        studentId: person.studentId,
        fullName: person.fullName,
        email: person.email,
        program: 'BSc Computer Science',
        level: person.level,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        totpSecret,
      },
    })

    // Enroll into whatever courses have room, up to 6 units and the 24-credit cap.
    const enrollments: string[] = []
    let credits = 0
    for (const c of shuffle(courses)) {
      if (enrollments.length >= 6) break
      const taken = seatsTaken.get(c.code)!
      if (taken >= c.seatsTotal) continue
      if (credits + c.credits > MAX_CREDITS) continue
      enrollments.push(c.code)
      credits += c.credits
      seatsTaken.set(c.code, taken + 1)
    }
    if (enrollments.length > 0) {
      await prisma.enrollment.createMany({
        data: enrollments.map((courseCode) => ({ studentId: student.id, courseCode, semester: SEMESTER })),
      })
    }

    // One prior semester of results, graded from this student's performance band.
    const gradedCourses = shuffle(courses).slice(0, randomInt(4, 5))
    const records = gradedCourses.map((c) => {
      const score = Math.min(100, Math.max(40, Math.round(40 + person.performance * 55 + randomInt(-8, 8))))
      const { grade, gradePoint } = scoreToGrade(score)
      return { courseCode: c.code, courseTitle: c.title, credits: c.credits, score, grade, gradePoint }
    })
    await prisma.resultSet.create({
      data: {
        studentId: student.id,
        semester: 'Semester 2 · 2024/2025',
        gpa: weightedGpa(records),
        records: { create: records },
      },
    })

    // Same fee items as the hero for a consistent statement shape; a randomized payment
    // history so outstanding balances vary across the population.
    const totalPaid = Math.round(totalFeeDue * Math.random())
    const studentPayments =
      totalPaid > 0
        ? [
            {
              paidAt: new Date(2025, randomInt(8, 10), randomInt(1, 28)),
              method: pick(['Bank Transfer', 'Card', 'USSD']),
              amount: totalPaid,
              reference: `TRX-${paymentSeq++}`,
            },
          ]
        : []

    await prisma.feeStatement.create({
      data: {
        studentId: student.id,
        semester: FEE_SEMESTER,
        items: { create: feeItems },
        payments: { create: studentPayments },
      },
    })
  }

  // Now that every enrollment is known, write the real seat counts in one pass.
  await Promise.all(
    courses.map((c) =>
      prisma.course.update({ where: { code: c.code }, data: { seatsTaken: seatsTaken.get(c.code)! } }),
    ),
  )

  console.log(
    `Seeded: ${1 + roster.length} students (hero: ${hero.studentId} / ${DEMO_PASSWORD} — every ` +
      `synthetic student shares this password), ${courses.length} courses.`,
  )
  console.log(`Hero step-up MFA (TOTP) secret: ${heroTotpSecret}`)
  console.log(
    'Every other student has their own TOTP secret — fetch it via GET /api/auth/mfa-secret once signed in.',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
