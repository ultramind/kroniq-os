import { useCallback, useEffect, useRef } from 'react'
import { pullProducts, pullSales, syncOutbox } from '../sync'

async function withTimeout<T>(request: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error(`${label} timed out. It will retry automatically.`)),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

export function useBackgroundSync(onSynced: (count: number) => void, onError: (message?: string) => void) {
  const runningRef = useRef(false)
  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // Push local sales before refreshing catalogue data, so an intermittent PWA
      // connection cannot overwrite the local view during a pending checkout.
      const result = await withTimeout(syncOutbox(), 'Sale sync', 20_000)
      await Promise.all([
        // Read refreshes do not alter a pending sale. Give catalogue requests
        // room on slower connections and keep the existing IndexedDB data if a
        // request is late; a slow download is not a sync failure.
        withTimeout(pullProducts(), 'Catalogue refresh', 45_000),
        withTimeout(pullSales(), 'Sales refresh', 45_000),
      ])
      // Only queued write failures require attention. Catalogue and sales
      // refreshes are safe to retry in the background and must not alarm a
      // cashier who has no pending records.
      onError(result.error)
      if (result.synced) onSynced(result.synced)
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Sync paused unexpectedly. It will retry automatically.',
      )
    } finally {
      runningRef.current = false
    }
  }, [onError, onSynced])

  useEffect(() => {
    void run()
    const onOnline = () => void run()
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void run(), 30_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [run])

  return run
}
