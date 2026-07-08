import type { SemesterResult } from '@/types'

export const semesterResults: SemesterResult[] = [
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
