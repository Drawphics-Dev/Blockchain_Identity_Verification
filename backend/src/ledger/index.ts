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
export * from './LedgerService'
