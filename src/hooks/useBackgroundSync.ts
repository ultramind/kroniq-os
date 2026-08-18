import { useCallback, useEffect, useRef } from 'react'
import { pullProducts, pullSales, syncOutbox } from '../sync'

async function withTimeout<T>(request: Promise<T>, label: string): Promise<T> {
  return await Promise.race([
    request,
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error(`${label} timed out. It will retry automatically.`)), 15_000),
    ),
  ])
}

export function useBackgroundSync(onSynced: (count: number) => void, onError: (message?: string) => void) {
  const runningRef = useRef(false)
  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // Push local sales before refreshing catalogue data, so an intermittent PWA
      // connection cannot overwrite the local view during a pending checkout.
      const result = await withTimeout(syncOutbox(), 'Sale sync')
      const [products, sales] = await Promise.all([
        withTimeout(pullProducts(), 'Catalogue refresh'),
        withTimeout(pullSales(), 'Sales refresh'),
      ])
      if (result.error || products.error || sales.error)
        onError(result.error ?? products.error ?? sales.error)
      else onError(undefined)
      if (result.synced) onSynced(result.synced)
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
