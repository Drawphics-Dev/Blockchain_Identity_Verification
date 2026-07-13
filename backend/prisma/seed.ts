/**
 * Database seed — ROADMAP Phase 3.
 *
 * Populates the demo student, the course catalogue, one fee statement and two semesters
 * of results. The data mirrors what the frontend previously hard-coded, so the portal
 * looks unchanged — but every row now comes from PostgreSQL.
 *
 * Idempotent: safe to re-run (`npm run db:seed`). It clears the seeded tables first.
 *
 * NOTE: a single demo student for now. Phases 8–9 (attack scenarios + metrics) will need a
 * population of 20–50 students per the roadmap; extend this file then.
 */
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type CourseStatus, type FeeCategory } from '@prisma/client'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const DEMO_PASSWORD = 'demo1234'
const SEMESTER = 'Semester 1'
const FEE_SEMESTER = 'Semester 1 · 2025/2026'

/**
 * `seatsTaken` is seeded to the catalogue's real occupancy — which already includes the
 * demo student's five registrations below. Dropping a course decrements it, registering
 * increments it, so the numbers stay coherent from the first click.
 */
const courses: Array<{
  code: string
  title: string
  credits: number
  lecturer: string
  schedule: string
  seatsTaken: number
  seatsTotal: number
  status: CourseStatus
  department: string
}> = [
  { code: 'CSC 301', title: 'Data Structures & Algorithms', credits: 3, lecturer: 'Dr. E. Nwosu', schedule: 'Mon 10:00 · Wed 12:00', seatsTaken: 118, seatsTotal: 120, status: 'open', department: 'Computer Science' },
  { code: 'CSC 305', title: 'Operating Systems', credits: 3, lecturer: 'Prof. K. Adeyemi', schedule: 'Tue 08:00 · Thu 10:00', seatsTaken: 96, seatsTotal: 120, status: 'open', department: 'Computer Science' },
  { code: 'CSC 311', title: 'Database Systems', credits: 3, lecturer: 'Dr. R. Balogun', schedule: 'Mon 14:00 · Fri 09:00', seatsTaken: 120, seatsTotal: 120, status: 'closed', department: 'Computer Science' },
  { code: 'CSC 317', title: 'Computer Networks', credits: 3, lecturer: 'Dr. S. Mensah', schedule: 'Wed 08:00 · Thu 14:00', seatsTaken: 74, seatsTotal: 100, status: 'open', department: 'Computer Science' },
  { code: 'CSC 321', title: 'Cryptography & Blockchain', credits: 4, lecturer: 'Prof. L. Danladi', schedule: 'Tue 12:00 · Fri 12:00', seatsTaken: 88, seatsTotal: 90, status: 'waitlist', department: 'Computer Science' },
  { code: 'MTH 303', title: 'Linear Algebra II', credits: 3, lecturer: 'Dr. F. Okafor', schedule: 'Mon 08:00 · Wed 10:00', seatsTaken: 60, seatsTotal: 150, status: 'open', department: 'Mathematics' },
  { code: 'GST 301', title: 'Entrepreneurship & Innovation', credits: 2, lecturer: 'Mrs. B. Hassan', schedule: 'Thu 16:00', seatsTaken: 210, seatsTotal: 300, status: 'open', department: 'General Studies' },
]

const enrolledCourseCodes = ['CSC 301', 'CSC 305', 'CSC 321', 'MTH 303', 'GST 301']

const feeItems: Array<{ label: string; amount: number; category: FeeCategory }> = [
  { label: 'Tuition Fee', amount: 180_000, category: 'tuition' },
  { label: 'Accommodation (Hall B)', amount: 65_000, category: 'accommodation' },
  { label: 'Library & Digital Resources', amount: 12_000, category: 'library' },
  { label: 'Laboratory & Practical', amount: 18_000, category: 'lab' },
  { label: 'Student Union & ID Card', amount: 8_000, category: 'other' },
]

const payments = [
  { paidAt: new Date('2025-09-14'), method: 'Bank Transfer', amount: 150_000, reference: 'TRX-8842190' },
  { paidAt: new Date('2025-10-02'), method: 'Card', amount: 60_000, reference: 'TRX-9021775' },
]

const resultSets = [
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

  await prisma.course.createMany({ data: courses })

  const student = await prisma.student.create({
    data: {
      studentId: 'SU/CS/2023/0187',
      fullName: 'Amina Okonkwo',
      email: 'amina.okonkwo@stateuniversity.edu',
      program: 'BSc Computer Science',
      level: '300 Level',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
    },
  })

  await prisma.enrollment.createMany({
    data: enrolledCourseCodes.map((courseCode) => ({
      studentId: student.id,
      courseCode,
      semester: SEMESTER,
    })),
  })

  await prisma.feeStatement.create({
    data: {
      studentId: student.id,
      semester: FEE_SEMESTER,
      items: { create: feeItems },
      payments: { create: payments },
    },
  })

  for (const set of resultSets) {
    await prisma.resultSet.create({
      data: {
        studentId: student.id,
        semester: set.semester,
        gpa: set.gpa,
        records: { create: set.records },
      },
    })
  }

  console.log(`Seeded: 1 student (${student.studentId} / ${DEMO_PASSWORD}), ${courses.length} courses, ${enrolledCourseCodes.length} enrollments, 1 fee statement, ${resultSets.length} result sets.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
