/**
 * FabricLedger — the approved target implementation (ROADMAP Phases 4–5).
 * Forwards LedgerService calls to the deployed IdentityContract + AuditContract via
 * @hyperledger/fabric-gateway.
 *
 * "Thin wrapper" is the intent, but three things stop it being a pure pass-through, and
 * each is load-bearing for mock/fabric parity:
 *
 *   1. CONCURRENCY. logAccessEvent reads and writes the chain tip (`audit:head`), a single
 *      hot key by construction. Fabric validates read-sets at commit, so two concurrent
 *      appends read the same tip version and the second is rejected with MVCC_READ_CONFLICT.
 *      This is not a rare race: one dashboard load fires four parallel API calls that each
 *      log a decision. MockLedger solves the same problem with a Postgres advisory lock; the
 *      equivalent here is an in-process queue plus a retry (see `serialise` / `appendWithRetry`).
 *   2. THE WIRE IS ALL STRINGS. Every chaincode argument and return value is a string, so
 *      numbers and booleans are stringified going in and parsed coming out. `Boolean('false')`
 *      is `true`, which is why the boolean reads go through JSON.parse.
 *   3. SHAPE. The chaincode's audit record carries an extra `seq` field the TypeScript
 *      AuditRecord does not. Structural typing will not catch it and audit.routes.ts spreads
 *      records straight into the HTTP response, so it is picked off explicitly in `toRecord`.
 */
import { createPrivateKey } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import * as grpc from '@grpc/grpc-js'
import { connect, signers } from '@hyperledger/fabric-gateway'
import type { Contract, Gateway } from '@hyperledger/fabric-gateway'
import { env } from '../config/env'
import type { AccessEvent, AuditRecord, IdentityAnchor } from '../types'
import type { LedgerService } from './LedgerService'

/** Both contracts live in one chaincode package, addressed by name on the same channel. */
const IDENTITY_CONTRACT = 'IdentityContract'
const AUDIT_CONTRACT = 'AuditContract'

/** Fabric's validation code for a read-set conflict — the chain-tip contention above. */
const MVCC_READ_CONFLICT = 11
const MAX_APPEND_ATTEMPTS = 5
const APPEND_BACKOFF_MS = 50

const utf8 = new TextDecoder()

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Everything a Fabric error says, as one string.
 *
 * fabric-gateway does NOT put the chaincode's own message in `error.message` — that carries
 * the gRPC-level summary ("failed to endorse transaction, see attached details") and the
 * thrown message from the contract is nested in `details[].message`, one entry per endorsing
 * peer. Matching on `error.message` alone silently never matches.
 */
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return ''
  const details = (error as { details?: unknown }).details
  const nested = Array.isArray(details)
    ? details.map((d) => (d as { message?: string })?.message ?? '').join(' ')
    : ''
  return `${error.message} ${nested}`
}

/**
 * True for the one error we retry. A conflicted transaction is *rejected* by Fabric rather
 * than applied, so retrying is safe — the failure mode is intermittent 500s, not corruption.
 * Matched on both the numeric status and the text because the two fabric-gateway error paths
 * (commit status vs. endorsement) do not report it identically.
 */
function isMvccConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  return code === MVCC_READ_CONFLICT || errorText(error).includes('MVCC_READ_CONFLICT')
}

interface FabricConfig {
  mspId: string
  peerEndpoint: string
  peerHostAlias: string
  tlsCertPath: string
  certPath: string
  keyPath: string
  channel: string
  chaincode: string
}

/**
 * Validate the Fabric settings here rather than in env.ts. env.ts is imported whatever LEDGER
 * is set to, so a throwing check there would break `LEDGER=mock` for everyone who has never
 * stood up a network. This runs only once FabricLedger actually needs to connect.
 */
function requireFabricEnv(): FabricConfig {
  const missing: string[] = []
  const need = (value: string | undefined, name: string): string => {
    if (!value) missing.push(name)
    return value ?? ''
  }

  const config: FabricConfig = {
    mspId: need(env.fabric.mspId, 'FABRIC_MSP_ID'),
    peerEndpoint: need(env.fabric.peerEndpoint, 'FABRIC_PEER_ENDPOINT'),
    peerHostAlias: need(env.fabric.peerHostAlias, 'FABRIC_PEER_HOST_ALIAS'),
    tlsCertPath: need(env.fabric.tlsCertPath, 'FABRIC_TLS_CERT_PATH'),
    certPath: need(env.fabric.certPath, 'FABRIC_CERT_PATH'),
    keyPath: need(env.fabric.keyPath, 'FABRIC_KEY_PATH'),
    channel: need(env.fabric.channel, 'FABRIC_CHANNEL'),
    chaincode: need(env.fabric.chaincode, 'FABRIC_CHAINCODE'),
  }

  if (missing.length > 0) {
    throw new Error(
      `LEDGER=fabric requires these env vars: ${missing.join(', ')} (see .env.example).`,
    )
  }
  return config
}

interface Connection {
  gateway: Gateway
  client: grpc.Client
  identity: Contract
  audit: Contract
}

/** The chaincode's audit record — the TypeScript AuditRecord plus the on-chain ordering key. */
interface ChaincodeAuditRecord extends AuditRecord {
  seq: number
}

export class FabricLedger implements LedgerService {
  readonly kind = 'fabric' as const

  /**
   * Memoised connection. The ledger is constructed at module import (`ledger/index.ts` does
   * `export const ledger = createLedger()`), so the constructor cannot await a gRPC dial —
   * hence connecting lazily on first use instead.
   */
  private connection?: Promise<Connection>

  /** Tail of the append queue. See `serialise`. */
  private chainLock: Promise<unknown> = Promise.resolve()

  // ---- Identity (IdentityContract) ----

  async registerIdentity(
    studentId: string,
    credentialHash: string,
    publicKey: string,
  ): Promise<IdentityAnchor> {
    const { identity } = await this.connect()
    const raw = await this.submit(identity, 'registerIdentity', studentId, credentialHash, publicKey)
    return JSON.parse(raw) as IdentityAnchor
  }

  async verifyIdentity(studentId: string, credentialHash: string): Promise<boolean> {
    const { identity } = await this.connect()
    const raw = await this.evaluate(identity, 'verifyIdentity', studentId, credentialHash)
    // JSON.parse, not a truthiness test: the contract returns the *string* 'false'.
    return JSON.parse(raw) as boolean
  }

  async revokeIdentity(studentId: string): Promise<void> {
    const { identity } = await this.connect()
    try {
      await this.submit(identity, 'revokeIdentity', studentId)
    } catch (error) {
      // The chaincode throws on an unknown student; MockLedger's updateMany is a silent
      // no-op. Swallowed deliberately so revocation stays idempotent under both ledgers —
      // callers must not have to care which one is active. Any other failure still surfaces.
      if (!isUnknownIdentity(error)) throw error
    }
  }

  async getIdentity(studentId: string): Promise<IdentityAnchor | null> {
    const { identity } = await this.connect()
    const raw = await this.evaluate(identity, 'getIdentity', studentId)
    // The contract returns '' for a missing key — never null, never a throw.
    return raw === '' ? null : (JSON.parse(raw) as IdentityAnchor)
  }

  // ---- Audit (AuditContract) ----

  async logAccessEvent(event: AccessEvent): Promise<AuditRecord> {
    return this.serialise(() => this.appendWithRetry(event))
  }

  async getAuditEvent(eventId: string): Promise<AuditRecord | null> {
    const { audit } = await this.connect()
    const raw = await this.evaluate(audit, 'getAuditEvent', eventId)
    return raw === '' ? null : this.toRecord(JSON.parse(raw) as ChaincodeAuditRecord)
  }

  async getAuditTrail(studentId?: string): Promise<AuditRecord[]> {
    const { audit } = await this.connect()
    // The optional studentId must cross the wire as '' (the contract's "whole trail"), not
    // as the string 'undefined'.
    const raw = await this.evaluate(audit, 'getAuditTrail', studentId ?? '')
    const records = JSON.parse(raw) as ChaincodeAuditRecord[]
    // Ascending chain order is contractual — audit.routes.ts does `.slice(-N).reverse()` to
    // get "newest first". Re-sorting here would silently label the oldest events as newest.
    return records.map((record) => this.toRecord(record))
  }

  async verifyEventIntegrity(eventId: string, offchainHash: string): Promise<boolean> {
    const { audit } = await this.connect()
    const raw = await this.evaluate(audit, 'verifyEventIntegrity', eventId, offchainHash)
    return JSON.parse(raw) as boolean
  }

  // ---- Lifecycle ----

  /** Close the gRPC client. There is no shutdown hook by default; index.ts wires this up. */
  async close(): Promise<void> {
    const pending = this.connection
    this.connection = undefined
    if (!pending) return
    try {
      const { gateway, client } = await pending
      gateway.close()
      client.close()
    } catch {
      // Never connected successfully — nothing to close.
    }
  }

  // ---- Internals ----

  private connect(): Promise<Connection> {
    // A rejected promise would otherwise be memoised forever, so a network that comes up a
    // second late would leave the backend permanently broken until restarted.
    this.connection ??= this.openConnection().catch((error: unknown) => {
      this.connection = undefined
      throw error
    })
    return this.connection
  }

  private async openConnection(): Promise<Connection> {
    const config = requireFabricEnv()
    const [tlsRootCert, credentials, privateKeyPem] = await Promise.all([
      readFile(config.tlsCertPath),
      readFile(config.certPath),
      readFile(config.keyPath),
    ])

    const client = new grpc.Client(
      config.peerEndpoint,
      grpc.credentials.createSsl(tlsRootCert),
      // The peer's TLS cert is issued to peer0.org1.example.com, but we dial localhost.
      // Without this SNI override the handshake fails even though the connection is fine.
      { 'grpc.ssl_target_name_override': config.peerHostAlias },
    )

    const gateway = connect({
      client,
      identity: { mspId: config.mspId, credentials },
      signer: signers.newPrivateKeySigner(createPrivateKey(privateKeyPem)),
      evaluateOptions: () => ({ deadline: Date.now() + 10_000 }),
      endorseOptions: () => ({ deadline: Date.now() + 20_000 }),
      submitOptions: () => ({ deadline: Date.now() + 10_000 }),
      // Generous: this awaits the block being cut and committed, and the test-network's
      // batch timeout alone is 2s.
      commitStatusOptions: () => ({ deadline: Date.now() + 90_000 }),
    })

    const network = gateway.getNetwork(config.channel)
    return {
      gateway,
      client,
      identity: network.getContract(config.chaincode, IDENTITY_CONTRACT),
      audit: network.getContract(config.chaincode, AUDIT_CONTRACT),
    }
  }

  /**
   * Run appends one at a time. Concurrent submissions would read the same `audit:head`
   * version and all but one would be invalidated at commit; queueing removes that contention
   * at the source, and `appendWithRetry` covers what the queue cannot (a second backend
   * process, which shares no in-process lock).
   */
  private serialise<T>(task: () => Promise<T>): Promise<T> {
    // Chained on both settlement paths so one failed append cannot wedge the queue.
    const run = this.chainLock.then(task, task)
    this.chainLock = run.catch(() => undefined)
    return run
  }

  private async appendWithRetry(event: AccessEvent): Promise<AuditRecord> {
    const { audit } = await this.connect()

    for (let attempt = 1; attempt <= MAX_APPEND_ATTEMPTS; attempt++) {
      try {
        const raw = await this.submit(
          audit,
          'logAccessEvent',
          event.eventId,
          event.studentId,
          event.resource,
          event.decision,
          // The contract rejects a non-integer riskScore. Today's policy weights are all
          // integers, so this holds — a future fractional weight would surface here first.
          String(event.riskScore),
          event.timestamp,
        )
        return this.toRecord(JSON.parse(raw) as ChaincodeAuditRecord)
      } catch (error) {
        if (!isMvccConflict(error) || attempt === MAX_APPEND_ATTEMPTS) throw error

        // The chaincode is append-only and rejects a re-used eventId, so a blind retry would
        // fail with "already recorded" if the previous attempt actually did commit. Check
        // before resubmitting.
        const landed = await this.getAuditEvent(event.eventId)
        if (landed) return landed

        await delay(APPEND_BACKOFF_MS * 2 ** (attempt - 1))
      }
    }

    // Unreachable: the final attempt either returns or rethrows above.
    throw new Error(`FabricLedger: exhausted append attempts for event ${event.eventId}`)
  }

  private async submit(contract: Contract, name: string, ...args: string[]): Promise<string> {
    // submitTransaction awaits the commit status, not just endorsement — which is what makes
    // an MVCC conflict a detectable error rather than a silently dropped write.
    return utf8.decode(await contract.submitTransaction(name, ...args))
  }

  private async evaluate(contract: Contract, name: string, ...args: string[]): Promise<string> {
    return utf8.decode(await contract.evaluateTransaction(name, ...args))
  }

  /**
   * Pick the interface's fields explicitly, dropping the chaincode's `seq`. A spread would
   * leak it into API responses under LEDGER=fabric and nowhere else — the two ledgers must
   * produce identical response shapes.
   */
  private toRecord(record: ChaincodeAuditRecord): AuditRecord {
    return {
      eventId: record.eventId,
      studentId: record.studentId,
      resource: record.resource,
      decision: record.decision,
      riskScore: record.riskScore,
      timestamp: record.timestamp,
      hash: record.hash,
      prevHash: record.prevHash,
    }
  }
}

/** Matches the chaincode's `no identity anchored for '<id>'` on an unknown student. */
function isUnknownIdentity(error: unknown): boolean {
  return /no identity anchored/i.test(errorText(error))
}
