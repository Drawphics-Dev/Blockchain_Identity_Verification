/**
 * Portal API routes — skeleton (IMPLEMENTATION.md §11.4).
 * These will be guarded by the Zero Trust PEP middleware once implemented.
 */
import { Router } from 'express'

export const portalRouter = Router()

// TODO: pep middleware on every route (continuous verification)
// TODO: GET /courses
// TODO: GET /fees      (sensitive)
// TODO: GET /results   (sensitive)

portalRouter.get('/courses', (_req, res) => res.json({ module: 'portal', status: 'not_implemented' }))
