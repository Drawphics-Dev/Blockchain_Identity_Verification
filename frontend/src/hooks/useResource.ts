/**
 * Loads data from the API with loading/error state.
 *
 * `load` is captured on first render and re-run when `deps` change or `reload()` is called,
 * so callers can pass an inline arrow without re-fetching on every render.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

interface Resource<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Replace the data locally — used after a mutation returns the new state. */
  set: (data: T) => void
}

export function useResource<T>(load: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // Keep the latest `load` without making it a dependency — otherwise an inline arrow
  // would re-trigger the effect on every render.
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, reload, set: setData }
}
