/** Shared domain types for the student portal. */

export interface Student {
  id: string
  studentId: string
  fullName: string
  email: string
  program: string
  level: string
  avatarUrl?: string
  gpa: number
  enrolledCredits: number
  trustScore: number // 0–100 Zero Trust confidence for the current session
}

export type CourseStatus = 'open' | 'closed' | 'waitlist'

export interface Course {
  code: string
  title: string
  credits: number
  lecturer: string
  schedule: string
  seatsTaken: number
  seatsTotal: number
  status: CourseStatus
  department: string
}

export interface Enrollment {
  courseCode: string
  semester: string
  registeredAt: string
}

export interface FeeItem {
  label: string
  amount: number
  category: 'tuition' | 'accommodation' | 'library' | 'lab' | 'other'
}

export interface Payment {
  id: string
  date: string
  method: string
  amount: number
  reference: string
}

export interface FeeStatement {
  semester: string
  items: FeeItem[]
  payments: Payment[]
  totalDue: number
  totalPaid: number
}

export type Grade = 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'D' | 'F'

export interface ResultRecord {
  courseCode: string
  courseTitle: string
  credits: number
  score: number
  grade: Grade
  gradePoint: number
}

export interface SemesterResult {
  semester: string
  gpa: number
  records: ResultRecord[]
}

/** A single entry in the immutable (blockchain) audit trail shown in the portal. */
export interface AuditEvent {
  id: string
  timestamp: string
  action: string
  resource: string
  decision: 'ALLOW' | 'STEP_UP' | 'DENY' | 'TERMINATE'
  riskScore: number
  txHash: string
}
