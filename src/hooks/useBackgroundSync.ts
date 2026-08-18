import { useCallback, useEffect, useRef } from 'react'
import { pullProducts, pullSales, syncOutbox } from '../sync'

export function useBackgroundSync(onSynced: (count: number) => void, onError: (message?: string) => void) {
  const runningRef = useRef(false)
  const run = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      // Push local sales before refreshing catalogue data, so an intermittent PWA
      // connection cannot overwrite the local view during a pending checkout.
      const result = await syncOutbox()
      const [products, sales] = await Promise.all([pullProducts(), pullSales()])
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
