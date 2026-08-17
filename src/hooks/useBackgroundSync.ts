import { useCallback, useEffect } from 'react'
import { pullProducts, pullSales, syncOutbox } from '../sync'

export function useBackgroundSync(onSynced: (count: number) => void, onError: (message?: string) => void) {
  const run = useCallback(async () => {
    const products = await pullProducts()
    const result = await syncOutbox()
    const sales = await pullSales()
    if (result.error || products.error || sales.error) onError(result.error ?? products.error ?? sales.error)
    else onError(undefined)
    if (result.synced) onSynced(result.synced)
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
