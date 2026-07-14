/**
 * Device fingerprint (ROADMAP Phase 7: React portal "collects device + behaviour
 * telemetry per request").
 *
 * The frontend collects a small, real client signature (screen size, timezone, locale,
 * hardware concurrency — lib/telemetry.ts) and sends it as `X-Device-Telemetry` on every
 * request; this folds it in alongside User-Agent so two machines that happen to share a
 * browser/OS string still fingerprint differently. Non-browser clients (curl, Swagger)
 * simply won't send the header — the fingerprint still works, just from headers alone.
 */
import { createHash } from 'node:crypto'
import type { Request } from 'express'

export function computeFingerprint(req: Request): string {
  const userAgent = req.get('user-agent') ?? ''
  const acceptLanguage = req.get('accept-language') ?? ''
  const clientTelemetry = req.get('x-device-telemetry') ?? ''
  return createHash('sha256').update(`${userAgent}|${acceptLanguage}|${clientTelemetry}`).digest('hex')
}
