import type { Student, AuditEvent } from '@/types'

export const currentStudent: Student = {
  id: 'stu_001',
  studentId: 'SU/CS/2023/0187',
  fullName: 'Amina Okonkwo',
  email: 'amina.okonkwo@stateuniversity.edu',
  program: 'BSc Computer Science',
  level: '300 Level',
  gpa: 3.72,
  enrolledCredits: 15,
  trustScore: 94,
}

/** Recent Zero Trust / blockchain audit activity for this session. */
export const recentAuditEvents: AuditEvent[] = [
  {
    id: 'evt_9f2a',
    timestamp: '2026-07-07T08:41:12Z',
    action: 'Login verified',
    resource: '/auth/login',
    decision: 'ALLOW',
    riskScore: 6,
    txHash: '0x8a3f…c21b',
  },
  {
    id: 'evt_7c1d',
    timestamp: '2026-07-07T08:41:15Z',
    action: 'Identity anchored on-chain',
    resource: 'IdentityContract.verify',
    decision: 'ALLOW',
    riskScore: 6,
    txHash: '0x4d90…7e08',
  },
  {
    id: 'evt_5b8e',
    timestamp: '2026-07-07T08:42:03Z',
    action: 'Accessed results',
    resource: '/results',
    decision: 'ALLOW',
    riskScore: 12,
    txHash: '0x1f77…a4c9',
  },
  {
    id: 'evt_3a44',
    timestamp: '2026-07-07T08:43:29Z',
    action: 'New device flagged — step-up',
    resource: '/fees',
    decision: 'STEP_UP',
    riskScore: 48,
    txHash: '0xbb02…9d31',
  },
]
