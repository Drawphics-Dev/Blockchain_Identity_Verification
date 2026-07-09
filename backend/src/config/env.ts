/** Centralised environment configuration. */
import 'dotenv/config'

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
  ledger: (process.env.LEDGER ?? 'mock') as 'mock' | 'fabric',
} as const
