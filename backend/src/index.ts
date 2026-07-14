/** Backend entry point: start the HTTP server and the Zero Trust continuous monitor. */
import { createApp } from './app'
import { env } from './config/env'
import { logger } from './utils/logger'
import { startContinuousMonitor } from './zerotrust/continuousMonitor'

const app = createApp()
app.listen(env.port, () => {
  logger.info(`Backend listening on http://localhost:${env.port}`, { ledger: env.ledger })
})

startContinuousMonitor()
