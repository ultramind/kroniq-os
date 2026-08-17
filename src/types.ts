export type Role = 'admin' | 'manager' | 'cashier'
export interface StaffMember {
  id: string
  email: string
  fullName: string
  role: Role
  createdAt: string
  active: boolean
}
export interface CashShift {
  id: string
  openedAt: string
  openingCash: number
  closedAt?: string
  countedCash?: number
  expectedCash?: number
  variance?: number
  varianceReason?: string
  synced?: boolean
}
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit'

export interface ProductPackage {
  id: string
  name: string
  unitsPerPack: number
  sku?: string
  price: number
  minimumSellingPrice?: number
  active?: boolean
}
export interface Product {
  id: string
  name: string
  sku: string
  price: number
  costPrice: number
  minimumSellingPrice?: number
  stock: number
  category: string
  baseUnit?: string
  packages?: ProductPackage[]
  sourceProductId?: string
  packagingId?: string
  packageName?: string
  unitsPerPackage?: number
  lowStockThreshold?: number
  active?: boolean
  description?: string
  imageUrl?: string
  imageUrls?: string[]
  onlinePublished?: boolean
  featured?: boolean
}
export interface CartItem extends Product {
  quantity: number
  listPrice?: number
  priceOverrideReason?: string
  sourceProductId?: string
  packagingId?: string
  packageName?: string
  unitsPerPackage?: number
}
export interface HeldSale {
  id: string
  items: CartItem[]
  paymentMethod: PaymentMethod
  note?: string
  createdAt: string
}
export interface Sale {
  id: string
  receiptNo: string
  total: number
  paymentMethod: PaymentMethod
  createdAt: string
  cashier: string
  synced: boolean
  historical?: boolean
  discount?: number
  discountReason?: string
  status?: 'completed' | 'returned'
  returnedAt?: string
  creditCustomerName?: string
  creditCustomerPhone?: string
  creditDueDate?: string
  creditInitialPayment?: number
  creditSettledAt?: string
}
export interface SaleItem {
  id: string
  saleId: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  listPrice?: number
  priceOverrideReason?: string
  costPrice?: number
  packagingId?: string
  packageName?: string
  unitsPerPackage?: number
  returnedQuantity?: number
}
export interface ReturnActivity {
  id: string
  saleId: string
  receiptNo: string
  staffName: string
  items: Array<{ productName: string; quantity: number; unitPrice: number }>
  total: number
  createdAt: string
  synced: boolean
}
export interface ReceiptItem {
  productName: string
  quantity: number
  unitPrice: number
}
export type StockMovementReason =
  'sale' | 'delivery' | 'correction' | 'damaged' | 'sale_return' | 'stock_count'
export interface StockMovement {
  id: string
  productId: string
  quantityDelta: number
  reason: StockMovementReason
  createdAt: string
  synced: boolean
}
export interface StockDelivery {
  id: string
  productId: string
  supplierName: string
  quantity: number
  unitCost: number
  receivedAt: string
  createdAt: string
  synced: boolean
}
export interface CreditPayment {
  id: string
  saleId: string
  amount: number
  paidAt: string
  createdAt: string
}
export interface Expense {
  id: string
  category: string
  description: string
  amount: number
  spentAt: string
  createdAt: string
}
export interface InventoryLocation {
  id: string
  name: string
  type: 'shop_floor' | 'warehouse'
  active: boolean
}
export interface SyncEvent {
  id?: number
  entity: 'sale' | 'stock_movement' | 'stock_delivery' | 'sale_return' | 'shift_open' | 'shift_close'
  action: 'create'
  payload: unknown
  createdAt: string
}
