/**
 * Recognising "the ledger is unreachable" from an error, without importing the Fabric client.
 *
 * Kept deliberately free of @hyperledger/fabric-gateway and @grpc/grpc-js imports so the HTTP
 * layer can classify a failure without depending on which ledger is configured.
 */

/** gRPC status codes (https://grpc.github.io/grpc/core/md_doc_statuscodes.html). */
const GRPC_DEADLINE_EXCEEDED = 4
const GRPC_UNAVAILABLE = 14

/**
 * True when a request failed because the peer could not be reached — a stopped network, a
 * crashed peer, a timeout — rather than because the request itself was wrong.
 *
 * These are the errors worth a 503 and a retry. Anything else (a chaincode rejecting bad
 * arguments, say) is a real fault and must not be disguised as a transient outage.
 */
export function isLedgerUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const code = (error as { code?: unknown }).code
  if (code === GRPC_UNAVAILABLE || code === GRPC_DEADLINE_EXCEEDED) return true

  // fabric-gateway nests the peer-level cause rather than re-throwing it, so an unreachable
  // peer can surface with the gRPC code one level down instead of on the error itself.
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) {
    const causeCode = (cause as { code?: unknown }).code
    return causeCode === GRPC_UNAVAILABLE || causeCode === GRPC_DEADLINE_EXCEEDED
  }

  return false
}
