import type { FeeStatement } from '@/types'

export const feeStatement: FeeStatement = {
  semester: 'Semester 1 · 2025/2026',
  items: [
    { label: 'Tuition Fee', amount: 180000, category: 'tuition' },
    { label: 'Accommodation (Hall B)', amount: 65000, category: 'accommodation' },
    { label: 'Library & Digital Resources', amount: 12000, category: 'library' },
    { label: 'Laboratory & Practical', amount: 18000, category: 'lab' },
    { label: 'Student Union & ID Card', amount: 8000, category: 'other' },
  ],
  payments: [
    { id: 'pay_01', date: '2025-09-14', method: 'Bank Transfer', amount: 150000, reference: 'TRX-8842190' },
    { id: 'pay_02', date: '2025-10-02', method: 'Card', amount: 60000, reference: 'TRX-9021775' },
  ],
  totalDue: 283000,
  totalPaid: 210000,
}
