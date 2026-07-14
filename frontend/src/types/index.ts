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

export type Decision = 'ALLOW' | 'STEP_UP' | 'DENY' | 'TERMINATE'

/** A single entry in the immutable (blockchain) audit trail — GET /api/admin/audit. */
export interface AuditEvent {
  eventId: string
  /** Internal id — use `student` for anything shown to a human. */
  studentId: string
  resource: string
  decision: Decision
  riskScore: number
  timestamp: string
  hash: string
  prevHash: string
  /** null if the student row no longer exists (shouldn't normally happen). */
  student: { studentId: string; fullName: string } | null
}

/** Result of GET /api/admin/audit/verify/:eventId. */
export interface IntegrityResult {
  eventId: string
  valid: boolean
  expectedHash: string
  actualHash: string
}

/** GET /api/admin/metrics — see the endpoint's own comment for what's real vs. not yet
 * computable (TAR/FAR/FRR/CES need the Phase 8 attack-simulation scenarios). */
export interface EngineMetrics {
  decisions: Record<Decision, number>
  totalEvents: number
  averageRiskScore: number
  sessions: { total: number; active: number }
  continuousValidation: {
    sessionsWithAnomaly: number
    terminatedAfterAnomaly: number
    sessionTerminationRate: number | null
    meanAnomalyDetectionSeconds: number | null
  }
  notYetAvailable: string[]
}
