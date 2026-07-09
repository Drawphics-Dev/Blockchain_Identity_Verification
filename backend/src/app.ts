/** Express application assembly — middleware, health check, route mounting. */
import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { authRouter } from './auth/auth.routes'
import { portalRouter } from './portal/portal.routes'
import { auditRouter } from './audit/audit.routes'

export function createApp() {
  const app = express()

  app.use(cors({ origin: env.corsOrigin, credentials: true }))
  app.use(express.json())

  // Health check.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ledger: env.ledger, env: env.nodeEnv })
  })

  // Feature routers (skeletons for now).
  app.use('/api/auth', authRouter)
  app.use('/api/admin', auditRouter)
  app.use('/api', portalRouter)

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  return app
}
