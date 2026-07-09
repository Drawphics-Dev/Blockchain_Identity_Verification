/** Backend entry point: start the HTTP server. */
import { createApp } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'

const app = createApp()
app.listen(env.port, () => {
  logger.info(`Backend listening on http://localhost:${env.port}`, { ledger: env.ledger })
})
