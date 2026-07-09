/** Admin / research routes — skeleton (IMPLEMENTATION.md §11.6). */
import { Router } from 'express'

export const auditRouter = Router()

// TODO: GET /audit         — immutable on-chain audit trail
// TODO: GET /audit/verify  — tamper check: on-chain vs off-chain mirror

auditRouter.get('/audit', (_req, res) => res.json({ module: 'audit', status: 'not_implemented' }))
