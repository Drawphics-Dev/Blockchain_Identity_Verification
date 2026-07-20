/**
 * In-memory per-session request history, backing two behaviour signals (ROADMAP §4.1's
 * "Behaviour pattern — request rate, navigation sequence"):
 *
 *   - request RATE      — how many requests in a sliding window (highRequestRate)
 *   - navigation BREADTH — how many DISTINCT resources in a sliding window (abnormalNavigation)
 *
 * Prototype-scale by design (ROADMAP §8: "functional, not production") — a single Node
 * process is the deployment target, so an in-process Map is sufficient and avoids adding
 * Redis just for a sliding window counter.
 */
interface Visit {
  at: number
  /** Request path with the query string stripped, e.g. '/api/fees'. */
  resource: string
}

const activity = new Map<string, Visit[]>()

/** Bound memory per session regardless of how long it stays open. */
const MAX_HISTORY = 100

export function recordActivity(sessionId: string, at: Date, resource: string): void {
  const list = activity.get(sessionId) ?? []
  list.push({ at: at.getTime(), resource })
  if (list.length > MAX_HISTORY) list.shift()
  activity.set(sessionId, list)
}

function since(sessionId: string, now: Date, windowMs: number): Visit[] {
  const list = activity.get(sessionId)
  if (!list) return []
  const cutoff = now.getTime() - windowMs
  return list.filter((v) => v.at >= cutoff)
}

export function requestRateInWindow(sessionId: string, now: Date, windowMs: number): number {
  return since(sessionId, now, windowMs).length
}

/**
 * How many DISTINCT resources this session touched in the window.
 *
 * This is the navigation-sequence measure: a human moves through a small, connected set of
 * pages, whereas a script sweeping for anything it can reach touches many unrelated endpoints
 * in quick succession. Breadth separates those two far more cleanly than raw rate does — a
 * dashboard load is 4 requests but only ever the same 4 resources, however many times it runs.
 */
export function distinctResourcesInWindow(sessionId: string, now: Date, windowMs: number): number {
  return new Set(since(sessionId, now, windowMs).map((v) => v.resource)).size
}

/** Drop a session's history once it ends, so revoked sessions don't linger in memory. */
export function clearActivity(sessionId: string): void {
  activity.delete(sessionId)
}
