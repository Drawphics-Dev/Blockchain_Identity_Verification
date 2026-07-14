/**
 * Client-side device telemetry (ROADMAP: React portal "collects device + behaviour
 * telemetry per request"). Sent as a header on every API call and folded into the Zero
 * Trust device fingerprint server-side (backend/src/zerotrust/fingerprint.ts), alongside
 * User-Agent — so two machines that happen to share a browser/OS string still fingerprint
 * differently, and the signal isn't purely server-inferred.
 *
 * Deliberately coarse and privacy-conscious: screen/timezone/locale/hardware class, not
 * anything that identifies the person (no canvas fingerprinting, no cross-site tracking).
 */
export function collectTelemetry(): string {
  try {
    return [
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      `${screen.width}x${screen.height}`,
      `${navigator.hardwareConcurrency ?? ''}`,
      navigator.platform ?? '',
    ].join('|')
  } catch {
    // Some environments (very old browsers, certain embedded webviews) may not expose all
    // of these — degrade to an empty signal rather than break every request over it.
    return ''
  }
}
