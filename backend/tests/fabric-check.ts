/**
 * FabricLedger acceptance checks (docs/FABRIC_INTEGRATION.md, "Acceptance checks").
 *
 * Exercises FabricLedger directly against a running test-network with the ziam chaincode
 * deployed — no HTTP, no database, so a failure here is the ledger wrapper or the network
 * rather than the app above it. The bar is behavioural parity with MockLedger.
 *
 * Requires the Fabric env vars and a live network:
 *   npm run test:fabric
 *
 * ⚠️ STOP THE BACKEND FIRST. This writes to the ledger DIRECTLY, so if the backend is also
 * running, its continuous monitor is appending to the same chain from a different process.
 * Both then contend for the single `audit:head` key and one loses at commit with
 * MVCC_READ_CONFLICT — FabricLedger's in-process queue cannot serialise across processes, and
 * under sustained contention its retry budget can be exhausted. That is a property of a
 * hash-chained log (one global tail, therefore one global serialisation point), not a defect,
 * and it is the same pressure that motivates the Merkle-root batching recommended in
 * TECHNICAL_REPORT §9.2. With the backend stopped this suite passes 22/22.
 */
import { randomUUID } from 'node:crypto'
import { FabricLedger } from '../src/ledger/FabricLedger'
import type { AccessEvent } from '../src/types'

const ledger = new FabricLedger()

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  PASS ${label}`)
  } else {
    failed++
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const iso = (): string => new Date().toISOString()
const event = (studentId: string, resource: string): AccessEvent => ({
  eventId: randomUUID(),
  studentId,
  resource,
  decision: 'ALLOW',
  riskScore: 12,
  timestamp: iso(),
})

async function main(): Promise<void> {
  const student = `S-${randomUUID().slice(0, 8)}`
  const other = `S-${randomUUID().slice(0, 8)}`

  console.log('\nConnection')
  check('kind is fabric', ledger.kind === 'fabric')

  console.log('\nIdentityContract')
  const anchor = await ledger.registerIdentity(student, 'hash-a', 'pubkey-a')
  check('registerIdentity returns the anchor', anchor.studentId === student && !anchor.revoked)
  check('verifyIdentity(correct hash) is true', (await ledger.verifyIdentity(student, 'hash-a')) === true)
  check('verifyIdentity(wrong hash) is false', (await ledger.verifyIdentity(student, 'nope')) === false)
  check('getIdentity(known) returns the anchor', (await ledger.getIdentity(student))?.studentId === student)
  // '' → null is the mapping a naive wrapper gets wrong: the contract returns an empty
  // string for a missing key, never null.
  check('getIdentity(unknown) is null', (await ledger.getIdentity('S-does-not-exist')) === null)

  // Re-anchoring must not silently undo a revocation — matches MockLedger's upsert.
  await ledger.revokeIdentity(student)
  check('verifyIdentity after revoke is false', (await ledger.verifyIdentity(student, 'hash-a')) === false)
  await ledger.registerIdentity(student, 'hash-b', 'pubkey-b')
  check('re-register preserves revoked', (await ledger.getIdentity(student))?.revoked === true)

  // The chaincode throws here; MockLedger no-ops. FabricLedger swallows it for parity.
  let idempotent = true
  try {
    await ledger.revokeIdentity('S-does-not-exist')
  } catch {
    idempotent = false
  }
  check('revokeIdentity(unknown) is idempotent (matches mock)', idempotent)

  console.log('\nAuditContract — hash chain')
  const first = await ledger.logAccessEvent(event(other, '/api/courses'))
  check('logAccessEvent returns a record', typeof first.hash === 'string' && first.hash.length === 64)
  check('no seq leaks into the record', !('seq' in first))
  check('getAuditEvent(known) round-trips', (await ledger.getAuditEvent(first.eventId))?.hash === first.hash)
  check('getAuditEvent(unknown) is null', (await ledger.getAuditEvent(randomUUID())) === null)

  console.log('\nConcurrency — the MVCC check')
  // The real test: one dashboard load fires these four in parallel, each logging a decision.
  // All four read the same chain tip, so without serialisation + retry the later ones are
  // invalidated with MVCC_READ_CONFLICT and surface as 500s on an ordinary page load.
  const resources = ['/api/courses', '/api/enrollments', '/api/fees', '/api/results']
  const settled = await Promise.allSettled(resources.map((r) => ledger.logAccessEvent(event(other, r))))
  const rejected = settled.filter((s) => s.status === 'rejected')
  check(
    '4 parallel appends all commit (no MVCC errors)',
    rejected.length === 0,
    rejected.map((r) => (r as PromiseRejectedResult).reason?.message).join('; '),
  )

  console.log('\nAuditContract — trail')
  const trail = await ledger.getAuditTrail(other)
  check('per-student trail returns only that student', trail.every((r) => r.studentId === other))
  check('trail has all 5 appends', trail.length === 5, `got ${trail.length}`)
  check('no seq leaks into the trail', trail.every((r) => !('seq' in r)))

  // Ascending order is contractual: audit.routes.ts does .slice(-N).reverse() for "newest
  // first", so a reversed trail would label the oldest events as the newest.
  const chainLinked = trail.every((r, i) => i === 0 || r.prevHash === trail[i - 1]!.hash)
  check('trail is in ascending chain order (each prevHash links back)', chainLinked)

  const fullTrail = await ledger.getAuditTrail()
  check('full trail (undefined → "") returns everything', fullTrail.length >= trail.length)

  console.log('\nTamper detection')
  check('integrity: matching hash is valid', (await ledger.verifyEventIntegrity(first.eventId, first.hash)) === true)
  check(
    'integrity: tampered hash is invalid',
    (await ledger.verifyEventIntegrity(first.eventId, 'f'.repeat(64))) === false,
  )
  check('integrity: unknown event is invalid', (await ledger.verifyEventIntegrity(randomUUID(), first.hash)) === false)

  console.log(`\n${'='.repeat(50)}`)
  console.log(failed === 0 ? `ALL ${passed} FABRIC CHECKS PASSED` : `${passed} passed, ${failed} FAILED`)
  await ledger.close()
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (error: unknown) => {
  console.error('\nFabric check aborted:', error instanceof Error ? error.message : error)
  await ledger.close()
  process.exit(1)
})
