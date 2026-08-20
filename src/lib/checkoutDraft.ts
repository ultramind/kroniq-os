import type { CartItem, PaymentMethod } from '../types'
import { usePosStore } from '../store'

type CheckoutDraft = {
  cart: CartItem[]
  paymentMethod: PaymentMethod
  discountPercent: number
}

function keyFor(userId: string, organizationId: string) {
  return `kroniq-checkout-draft:${userId}:${organizationId}`
}

export function saveCheckoutDraft(userId: string, organizationId: string, draft: CheckoutDraft) {
  const key = keyFor(userId, organizationId)
  if (!draft.cart.length) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, JSON.stringify(draft))
}

export function restoreCheckoutDraft(userId: string, organizationId: string): CheckoutDraft | undefined {
  try {
    const draft = JSON.parse(localStorage.getItem(keyFor(userId, organizationId)) ?? '') as CheckoutDraft
    return Array.isArray(draft.cart) ? draft : undefined
  } catch {
    return undefined
  }
}

export function startCheckoutDraftPersistence(userId: string, organizationId: string) {
  const persistCurrentDraft = () => {
    const state = usePosStore.getState()
    saveCheckoutDraft(userId, organizationId, {
      cart: state.cart,
      paymentMethod: state.paymentMethod,
      discountPercent: state.discountPercent,
    })
  }
  const unsubscribe = usePosStore.subscribe((state, previousState) => {
    if (
      state.cart === previousState.cart &&
      state.paymentMethod === previousState.paymentMethod &&
      state.discountPercent === previousState.discountPercent
    )
      return
    saveCheckoutDraft(userId, organizationId, {
      cart: state.cart,
      paymentMethod: state.paymentMethod,
      discountPercent: state.discountPercent,
    })
  })
  window.addEventListener('pagehide', persistCurrentDraft)
  return () => {
    window.removeEventListener('pagehide', persistCurrentDraft)
    unsubscribe()
  }
}
