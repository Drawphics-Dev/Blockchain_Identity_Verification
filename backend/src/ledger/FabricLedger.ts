/**
 * FabricLedger — Track B implementation (skeleton, deferred to WSL2/Ubuntu).
 * A thin wrapper that forwards LedgerService calls to the deployed chaincode
 * via @hyperledger/fabric-gateway.
 */
import type { LedgerService } from './LedgerService'

export class FabricLedger implements LedgerService {
  readonly kind = 'fabric' as const
  // TODO(Track B): connect to the Fabric test-network and implement methods.
}
