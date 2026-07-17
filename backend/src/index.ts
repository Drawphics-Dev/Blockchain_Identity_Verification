/** Backend entry point: start the HTTP server and the Zero Trust continuous monitor. */
import { createApp } from './app'
import { env } from './config/env'
import { closeLedger } from './ledger'
import { logger } from './utils/logger'
import { startContinuousMonitor } from './zerotrust/continuousMonitor'

const app = createApp()
const server = app.listen(env.port, () => {
  logger.info(`Backend listening on http://localhost:${env.port}`, { ledger: env.ledger })
})

startContinuousMonitor()

// Under LEDGER=fabric the gateway holds an open gRPC client, which keeps the event loop
// alive and leaves the process hanging on Ctrl-C without this.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info(`Received ${signal}, shutting down.`)
    server.close(() => {
      void closeLedger().finally(() => process.exit(0))
    })
  })
}
