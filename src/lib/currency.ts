import { getStoreSettings } from './storeSettings'

const currencyLocales: Record<string, string> = { NGN: 'en-NG', GHS: 'en-GH', KES: 'en-KE', ZAR: 'en-ZA', USD: 'en-US' }
export const formatNaira = (amount: number) => {
  const currency = getStoreSettings().currencyCode || 'NGN'
  return new Intl.NumberFormat(currencyLocales[currency] ?? 'en-NG', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2 }).format(amount)
}
