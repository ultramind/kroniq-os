import { db } from '../../db'
import type { CartItem, PaymentMethod, Sale } from '../../types'

export type CreditDetails = {
  customerName: string
  customerPhone: string
  dueDate?: string
  initialPayment?: number
}
export async function saveOfflineSale(
  cart: CartItem[],
  total: number,
  paymentMethod: PaymentMethod,
  discount = 0,
  credit?: CreditDetails,
) {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const sale: Sale = {
    id,
    receiptNo: `POS-${Date.now().toString().slice(-6)}`,
    total,
    paymentMethod,
    createdAt,
    cashier: 'Cashier 001',
    synced: false,
    discount,
    status: 'completed' as const,
    orderStatus: paymentMethod === 'order' ? 'pending' : undefined,
    creditCustomerName: credit?.customerName,
    creditCustomerPhone: credit?.customerPhone,
    creditDueDate: credit?.dueDate,
    creditInitialPayment: credit?.initialPayment ?? 0,
  }
  await db.transaction('rw', db.sales, db.saleItems, db.products, db.stockMovements, db.outbox, async () => {
    await db.sales.add(sale)
    await db.saleItems.bulkAdd(
      cart.map((item) => ({
        id: crypto.randomUUID(),
        saleId: id,
        productId: item.sourceProductId ?? item.id,
        productName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        listPrice: item.listPrice ?? item.price,
        priceOverrideReason: item.priceOverrideReason,
        costPrice: item.costPrice,
        packagingId: item.packagingId,
        packageName: item.packageName,
        unitsPerPackage: item.unitsPerPackage,
      })),
    )
    if (paymentMethod !== 'order') {
      for (const item of cart) {
        const productId = item.sourceProductId ?? item.id
        const stockUnits = item.quantity * (item.unitsPerPackage ?? 1)
        const currentProduct = await db.products.get(productId)
        await db.products.update(productId, { stock: Math.max(0, (currentProduct?.stock ?? 0) - stockUnits) })
        await db.stockMovements.add({
          id: crypto.randomUUID(),
          productId,
          quantityDelta: -stockUnits,
          reason: 'sale',
          createdAt,
          synced: false,
        })
      }
    }
    await db.outbox.add({ entity: 'sale', action: 'create', payload: { sale, items: cart }, createdAt })
  })
  return sale
}
