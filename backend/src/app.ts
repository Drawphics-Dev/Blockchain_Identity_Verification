/** Express application assembly — middleware, health check, route mounting. */
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import { authRouter } from './auth/auth.routes'
import { portalRouter } from './portal/portal.routes'
import { auditRouter } from './audit/audit.routes'
import { openapiSpec } from './docs/openapi'
import { logger } from './utils/logger'

export function createApp() {
  const app = express()

  // `req.ip` is recorded on every session; behind a proxy it must come from the
  // forwarded header, not the socket — the risk engine (Phase 6) will depend on it.
  app.set('trust proxy', true)

  app.use(cors({ origin: env.corsOrigin, credentials: true }))
  app.use(express.json())

  // Health check.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ledger: env.ledger, env: env.nodeEnv })
  })

  // Interactive API docs. The raw document is served too, so the spec can be fed to
  // client generators or Postman without scraping the UI.
  app.get('/openapi.json', (_req, res) => res.json(openapiSpec))
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customSiteTitle: 'Portal API — Zero Trust Identity Verification',
      swaggerOptions: {
        // Keep the pasted token across page reloads, so you authorize once.
        persistAuthorization: true,
        docExpansion: 'list',
      },
    }),
  )

  app.use('/api/auth', authRouter)
  app.use('/api/admin', auditRouter) // placeholder — audit trail lands with the ledger phase
  app.use('/api', portalRouter)

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  // Anything that escapes a route handler ends up here rather than hanging the request.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack })
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' })
  })

  return app
}
