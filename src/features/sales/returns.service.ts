import { db } from '../../db'
import { supabase } from '../../supabase'
import type { Sale, SaleItem } from '../../types'

/**
 * Returns are deliberately cloud-first. A sale must already exist in Supabase,
 * and the database procedure performs the stock restoration atomically.
 * IndexedDB is updated only after that succeeds, as a UI cache—not as a queue.
 */
export async function returnSaleItems(
  sale: Sale,
  selected: Array<{ item: SaleItem; quantity: number }>,
  staffName = 'Current staff',
) {
  if (!supabase || !navigator.onLine)
    throw new Error('Returns require an internet connection because the original sale is verified online.')
  if (!sale.synced)
    throw new Error('This sale is still waiting to sync. Complete the return after it is available online.')
  if (!selected.length) throw new Error('Select at least one item to return.')

  for (const { item, quantity } of selected) {
    const alreadyReturned = item.returnedQuantity ?? 0
    if (quantity < 1 || quantity > item.quantity - alreadyReturned)
      throw new Error('Invalid return quantity.')
  }

  const operationId = crypto.randomUUID()
  const { error } = await supabase.rpc('return_sale_items', {
    p_sale_id: sale.id,
    p_operation_id: operationId,
    p_items: selected.map(({ item, quantity }) => ({ product_id: item.productId, quantity })),
  })
  if (error) throw new Error(error.message)

  const returnedAt = new Date().toISOString()
  const items = selected.map(({ item, quantity }) => ({
    productName: item.productName,
    quantity,
    unitPrice: item.unitPrice,
  }))
  await db.transaction('rw', [db.sales, db.saleItems, db.returnActivities], async () => {
    for (const { item, quantity } of selected)
      await db.saleItems.update(item.id, { returnedQuantity: (item.returnedQuantity ?? 0) + quantity })
    const saleItems = await db.saleItems.where('saleId').equals(sale.id).toArray()
    if (saleItems.length && saleItems.every((item) => (item.returnedQuantity ?? 0) >= item.quantity))
      await db.sales.update(sale.id, { status: 'returned', returnedAt, synced: true })
    await db.returnActivities.add({
      id: crypto.randomUUID(),
      saleId: sale.id,
      receiptNo: sale.receiptNo,
      staffName,
      items,
      total: items.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
      createdAt: returnedAt,
      synced: true,
    })
  })
}

export async function returnSale(sale: Sale) {
  if (sale.status === 'returned') throw new Error('This sale has already been returned.')
  const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
  if (!items.length) throw new Error('Sale items are unavailable on this device.')
  await returnSaleItems(
    sale,
    items.map((item) => ({ item, quantity: item.quantity - (item.returnedQuantity ?? 0) })),
  )
}
