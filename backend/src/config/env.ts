/** Centralised environment configuration. */
import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name} (see .env.example)`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim()),
  ledger: (process.env.LEDGER ?? 'mock') as 'mock' | 'fabric',
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  /** Session lifetime. Kept short — Zero Trust favours frequent re-verification. */
  jwtExpiresInHours: Number(process.env.JWT_EXPIRES_IN_HOURS ?? 8),
} as const
