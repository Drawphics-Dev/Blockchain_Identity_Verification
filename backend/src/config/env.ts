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
  /**
   * Fabric gateway connection settings — deliberately NOT `required()`.
   *
   * This module is imported regardless of LEDGER, so a throwing check here would break
   * `LEDGER=mock` for everyone who has never stood up a Fabric network. FabricLedger
   * validates these itself, where they are known to be needed (see requireFabricEnv).
   */
  fabric: {
    mspId: process.env.FABRIC_MSP_ID,
    peerEndpoint: process.env.FABRIC_PEER_ENDPOINT,
    /** TLS SNI override — must match the peer certificate's CN, not the dial address. */
    peerHostAlias: process.env.FABRIC_PEER_HOST_ALIAS,
    tlsCertPath: process.env.FABRIC_TLS_CERT_PATH,
    certPath: process.env.FABRIC_CERT_PATH,
    keyPath: process.env.FABRIC_KEY_PATH,
    channel: process.env.FABRIC_CHANNEL,
    chaincode: process.env.FABRIC_CHAINCODE,
  },
} as const
