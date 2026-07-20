/**
 * Offline IP geolocation + travel-velocity check — the "IP / geovelocity" risk signal
 * (ROADMAP §4.1: "impossible travel → high risk").
 *
 * Deliberately OFFLINE. ROADMAP §8's ethics constraint is a self-contained prototype with
 * "no third-party systems", so this resolves locations from a local table rather than calling
 * a commercial GeoIP service. That keeps every evaluation run reproducible — the same IP always
 * yields the same location, so the metrics do not depend on a vendor's database version or on
 * network availability during a run.
 *
 * The table uses the RFC 5737 documentation ranges (TEST-NET-1/2/3), which exist precisely to
 * stand in for real addresses in examples and simulations and can never route on the public
 * internet. The Phase 8 scenarios drive them via `X-Forwarded-For` (the app sets `trust proxy`).
 *
 * Production would swap `GEO_TABLE` for a MaxMind GeoLite2 lookup; nothing else here changes.
 * That substitution is the documented future work, in line with ROADMAP §8's "simulated
 * signals are simplified" framing.
 */

export interface GeoPoint {
  lat: number
  lon: number
  /** Human-readable label, for audit reasons and the admin trail. */
  label: string
}

/**
 * Synthetic address space → location. Prefix-matched, longest prefix first.
 *
 * The three blocks are far enough apart that any pair of them is unreachable inside a session:
 * London → Sydney is ~17,000 km, which no aircraft covers in the minutes a scenario runs.
 */
const GEO_TABLE: Array<{ prefix: string; point: GeoPoint }> = [
  { prefix: '192.0.2.', point: { lat: 51.5072, lon: -0.1276, label: 'London, GB' } },
  { prefix: '198.51.100.', point: { lat: -33.8688, lon: 151.2093, label: 'Sydney, AU' } },
  { prefix: '203.0.113.', point: { lat: 55.7558, lon: 37.6173, label: 'Moscow, RU' } },
]

/** Loopback and RFC 1918 private space — a real deployment behind NAT, or localhost in a demo.
 * These carry no location information, so the signal must stay silent rather than guess. */
function isUnlocatable(ip: string): boolean {
  return (
    ip === '::1' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}

/**
 * Resolve an IP to a coarse location, or null when it cannot be located.
 *
 * null is the honest answer for localhost, private ranges and anything outside the table —
 * and it must propagate, because a fabricated location would manufacture impossible travel
 * out of nothing and inflate the attack-resistance numbers.
 */
export function locate(ip: string | null | undefined): GeoPoint | null {
  if (!ip) return null
  // Express reports IPv4-mapped IPv6 for IPv4 clients on a dual-stack socket.
  const normalized = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip
  if (isUnlocatable(normalized)) return null
  return GEO_TABLE.find((entry) => normalized.startsWith(entry.prefix))?.point ?? null
}

const EARTH_RADIUS_KM = 6371

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export interface TravelLeg {
  ip: string | null
  at: Date
}

export interface TravelVerdict {
  /** True only when both ends located AND the implied speed exceeds the configured maximum. */
  impossible: boolean
  distanceKm: number | null
  impliedKmh: number | null
  from: GeoPoint | null
  to: GeoPoint | null
}

/**
 * Guard against a divide-by-zero, and against two requests in the same instant reporting an
 * infinite speed. One second is the smallest interval this prototype treats as real elapsed time.
 */
const MIN_ELAPSED_MS = 1000

/**
 * Would getting from `from` to `to` in the elapsed time require travelling faster than
 * `maxKmh`? That is the "impossible travel" test.
 *
 * Returns impossible=false whenever EITHER end is unlocatable. Unknown is not suspicious:
 * treating an unlocatable IP as impossible travel would fire this signal on every request from
 * localhost, which is exactly how a demo runs.
 */
export function assessTravel(from: TravelLeg, to: TravelLeg, maxKmh: number): TravelVerdict {
  const a = locate(from.ip)
  const b = locate(to.ip)
  if (!a || !b) return { impossible: false, distanceKm: null, impliedKmh: null, from: a, to: b }

  const distanceKm = haversineKm(a, b)
  const elapsedMs = Math.max(MIN_ELAPSED_MS, to.at.getTime() - from.at.getTime())
  const impliedKmh = distanceKm / (elapsedMs / 3_600_000)

  return {
    impossible: impliedKmh > maxKmh,
    distanceKm: Number(distanceKm.toFixed(1)),
    impliedKmh: Number(impliedKmh.toFixed(1)),
    from: a,
    to: b,
  }
}
