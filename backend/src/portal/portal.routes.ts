/**
 * Portal API — courses, registration, fees, results.
 *
 * Every route is behind `requireAuth`, and every route scopes its query to the student in
 * the token: a student can only ever read their own fees and results. When the Zero Trust
 * PEP lands (Phase 6) it mounts here alongside `requireAuth`, and `fees`/`results` become
 * the sensitive resources that raise the risk score.
 */
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/requireAuth'
import { asyncHandler } from '../utils/asyncHandler'
import {
  EnrollmentError,
  drop,
  enroll,
  getCourses,
  getEnrollments,
  getFeeStatement,
  getResults,
} from './portal.service'

export const portalRouter = Router()

portalRouter.use(requireAuth)

portalRouter.get(
  '/courses',
  asyncHandler(async (_req, res) => {
    res.json({ courses: await getCourses() })
  }),
)

portalRouter.get(
  '/enrollments',
  asyncHandler(async (req, res) => {
    res.json({ enrollments: await getEnrollments(req.auth!.studentId) })
  }),
)

const enrollSchema = z.object({ courseCode: z.string().trim().min(1) })

portalRouter.post(
  '/enrollments',
  asyncHandler(async (req, res) => {
    const parsed = enrollSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', message: 'courseCode is required.' })
      return
    }

    try {
      await enroll(req.auth!.studentId, parsed.data.courseCode)
    } catch (err) {
      if (err instanceof EnrollmentError) {
        res.status(err.status).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }

    // Return the fresh catalogue + enrollments so the UI reflects the new seat count.
    res.status(201).json({
      courses: await getCourses(),
      enrollments: await getEnrollments(req.auth!.studentId),
    })
  }),
)

portalRouter.delete(
  '/enrollments/:courseCode',
  asyncHandler(async (req, res) => {
    try {
      await drop(req.auth!.studentId, decodeURIComponent(req.params.courseCode))
    } catch (err) {
      if (err instanceof EnrollmentError) {
        res.status(err.status).json({ error: err.code, message: err.message })
        return
      }
      throw err
    }

    res.json({
      courses: await getCourses(),
      enrollments: await getEnrollments(req.auth!.studentId),
    })
  }),
)

portalRouter.get(
  '/fees',
  asyncHandler(async (req, res) => {
    const statement = await getFeeStatement(req.auth!.studentId)
    if (!statement) {
      res.status(404).json({ error: 'not_found', message: 'No fee statement on record.' })
      return
    }
    res.json({ statement })
  }),
)

portalRouter.get(
  '/results',
  asyncHandler(async (req, res) => {
    res.json({ results: await getResults(req.auth!.studentId) })
  }),
)
