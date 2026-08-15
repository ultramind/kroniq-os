export type StoreSettings = {
  storeName: string
  address?: string
  phone?: string
  receiptFooter?: string
  vat: number
  lowStock: number
  payments: string[]
  currencyCode: string
}

const key = 'naira-pos-settings'
export const defaultStoreSettings: StoreSettings = {
  storeName: 'KroniqOS Store',
  vat: 0,
  lowStock: 10,
  payments: ['cash', 'card', 'transfer', 'credit'],
  currencyCode: 'NGN',
}

export function getStoreSettings(): StoreSettings {
  try { return { ...defaultStoreSettings, ...JSON.parse(localStorage.getItem(key) ?? '{}') } } catch { return defaultStoreSettings }
}

export function saveStoreSettings(settings: StoreSettings) {
  localStorage.setItem(key, JSON.stringify(settings))
}
