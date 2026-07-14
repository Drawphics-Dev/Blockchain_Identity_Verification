/**
 * The hash-chaining algorithm every audit record uses (ROADMAP §5): SHA-256 over the
 * event payload plus the previous record's hash. Shared by MockLedger (which computes it
 * at write time) and the audit integrity verifier (which recomputes it from the current
 * off-chain mirror at check time) so the two can never silently drift apart.
 */
import { createHash } from 'node:crypto'
import type { AccessEvent } from '../types'

export function hashEvent(event: AccessEvent, prevHash: string): string {
  const payload = [
    event.eventId,
    event.studentId,
    event.resource,
    event.decision,
    String(event.riskScore),
    event.timestamp,
    prevHash,
  ].join('|')
  return createHash('sha256').update(payload).digest('hex')
}
