import { db } from '../../db'
import type { CartItem, PaymentMethod } from '../../types'

export type CreditDetails = { customerName: string; customerPhone: string; dueDate?: string; initialPayment?: number }
export async function saveOfflineSale(cart: CartItem[], total: number, paymentMethod: PaymentMethod, discount = 0, credit?: CreditDetails) {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const sale = { id, receiptNo: `POS-${Date.now().toString().slice(-6)}`, total, paymentMethod, createdAt, cashier: 'Cashier 001', synced: false, discount, status: 'completed' as const, creditCustomerName: credit?.customerName, creditCustomerPhone: credit?.customerPhone, creditDueDate: credit?.dueDate, creditInitialPayment: credit?.initialPayment ?? 0 }
  await db.transaction('rw', db.sales, db.saleItems, db.products, db.stockMovements, db.outbox, async () => {
    await db.sales.add(sale)
    await db.saleItems.bulkAdd(cart.map((item) => ({ id: crypto.randomUUID(), saleId: id, productId: item.id, productName: item.name, quantity: item.quantity, unitPrice: item.price, listPrice: item.listPrice ?? item.price, priceOverrideReason: item.priceOverrideReason, costPrice: item.costPrice })))
    for (const item of cart) {
      await db.products.update(item.id, { stock: Math.max(0, item.stock - item.quantity) })
      await db.stockMovements.add({ id: crypto.randomUUID(), productId: item.id, quantityDelta: -item.quantity, reason: 'sale', createdAt, synced: false })
    }
    await db.outbox.add({ entity: 'sale', action: 'create', payload: { sale, items: cart }, createdAt })
  })
  return sale
}
