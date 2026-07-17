/**
 * Ledger factory — selects the implementation from env (LEDGER=mock|fabric)
 * and exposes a single shared instance to the rest of the backend.
 */
import { env } from '../config/env'
import type { LedgerService } from './LedgerService'
import { MockLedger } from './MockLedger'
import { FabricLedger } from './FabricLedger'

function createLedger(): LedgerService {
  return env.ledger === 'fabric' ? new FabricLedger() : new MockLedger()
}

export const ledger: LedgerService = createLedger()

/**
 * Release ledger resources on shutdown. Only FabricLedger holds anything that needs closing
 * (a gRPC client, which keeps the event loop alive); MockLedger's Postgres pool is Prisma's
 * to manage. No-op under LEDGER=mock.
 */
export async function closeLedger(): Promise<void> {
  if (ledger instanceof FabricLedger) await ledger.close()
}

export * from './LedgerService'
