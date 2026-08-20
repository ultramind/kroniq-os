export type StoreSettings = {
  storeName: string
  address?: string
  phone?: string
  receiptFooter?: string
  vat: number
  lowStock: number
  payments: string[]
  currencyCode: string
  flexiblePricingEnabled: boolean
}

const key = 'naira-pos-settings'
export const defaultStoreSettings: StoreSettings = {
  storeName: 'Kroniqos Store',
  vat: 0,
  lowStock: 10,
  payments: ['cash', 'card', 'transfer', 'credit'],
  currencyCode: 'NGN',
  flexiblePricingEnabled: true,
}

export function getStoreSettings(): StoreSettings {
  try {
    return { ...defaultStoreSettings, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
  } catch {
    return defaultStoreSettings
  }
}

export function saveStoreSettings(settings: StoreSettings) {
  localStorage.setItem(key, JSON.stringify(settings))
}

export function clearStoreSettings() {
  localStorage.removeItem(key)
}
