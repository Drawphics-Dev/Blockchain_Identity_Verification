/**
 * A coarse, server-only device fingerprint.
 *
 * There is no client-side telemetry yet (that's ROADMAP Phase 7); this is derived purely
 * from headers already present on every request, which is enough to notice "this is a
 * different browser/OS" without requiring any frontend work.
 */
import { createHash } from 'node:crypto'
import type { Request } from 'express'

export function computeFingerprint(req: Request): string {
  const userAgent = req.get('user-agent') ?? ''
  const acceptLanguage = req.get('accept-language') ?? ''
  return createHash('sha256').update(`${userAgent}|${acceptLanguage}`).digest('hex')
}
