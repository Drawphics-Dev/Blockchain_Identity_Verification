/**
 * In-memory per-session request-timestamp tracker, for the highRequestRate signal.
 *
 * Prototype-scale by design (ROADMAP §8: "functional, not production") — a single Node
 * process is the deployment target, so an in-process Map is sufficient and avoids adding
 * Redis just for a sliding window counter.
 */
const activity = new Map<string, number[]>()

/** Bound memory per session regardless of how long it stays open. */
const MAX_HISTORY = 100

export function recordActivity(sessionId: string, at: Date): void {
  const list = activity.get(sessionId) ?? []
  list.push(at.getTime())
  if (list.length > MAX_HISTORY) list.shift()
  activity.set(sessionId, list)
}

export function requestRateInWindow(sessionId: string, now: Date, windowMs: number): number {
  const list = activity.get(sessionId)
  if (!list) return 0
  const cutoff = now.getTime() - windowMs
  return list.filter((t) => t >= cutoff).length
}

/** Drop a session's history once it ends, so revoked sessions don't linger in memory. */
export function clearActivity(sessionId: string): void {
  activity.delete(sessionId)
}
