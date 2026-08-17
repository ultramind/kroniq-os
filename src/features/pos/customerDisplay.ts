import type { CartItem, PaymentMethod } from '../../types'

export type CustomerDisplayState = {
  cart: Array<Pick<CartItem, 'id' | 'name' | 'price' | 'quantity'>>
  total: number
  paymentMethod: PaymentMethod
  updatedAt: string
}

const channelName = 'naira-pos-customer-display'
const storageKey = 'naira-pos-customer-display-state'

export function publishCustomerDisplay(cart: CartItem[], total: number, paymentMethod: PaymentMethod) {
  const state: CustomerDisplayState = {
    cart: cart.map(({ id, name, price, quantity }) => ({ id, name, price, quantity })),
    total,
    paymentMethod,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(storageKey, JSON.stringify(state))
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(channelName)
    channel.postMessage(state)
    channel.close()
  }
}

export function readCustomerDisplay(): CustomerDisplayState {
  try {
    const value = localStorage.getItem(storageKey)
    if (value) return JSON.parse(value) as CustomerDisplayState
  } catch {
    /* A blank customer screen is safer than a broken checkout. */
  }
  return { cart: [], total: 0, paymentMethod: 'cash', updatedAt: new Date().toISOString() }
}

export function subscribeToCustomerDisplay(onUpdate: (state: CustomerDisplayState) => void) {
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(channelName) : undefined
  if (channel) channel.onmessage = (event: MessageEvent<CustomerDisplayState>) => onUpdate(event.data)
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey && event.newValue) {
      try {
        onUpdate(JSON.parse(event.newValue) as CustomerDisplayState)
      } catch {
        /* Ignore malformed stale data. */
      }
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    channel?.close()
    window.removeEventListener('storage', onStorage)
  }
}
