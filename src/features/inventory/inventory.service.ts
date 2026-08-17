import { db } from '../../db'
import { supabase } from '../../supabase'
import type { Product, StockMovementReason } from '../../types'

function requireOnlineInventory() {
  if (!supabase || !navigator.onLine) throw new Error('Inventory changes require an internet connection.')
  return supabase
}

export async function recordStockAdjustment(
  product: Product,
  quantityDelta: number,
  reason: StockMovementReason,
) {
  if (product.stock + quantityDelta < 0) throw new Error('Stock cannot fall below zero.')
  const client = requireOnlineInventory()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const { error } = await client.rpc('adjust_stock', {
    p_product_id: product.id,
    p_quantity_delta: quantityDelta,
    p_reason: reason,
    p_operation_id: id,
  })
  if (error) throw error
  const movement = { id, productId: product.id, quantityDelta, reason, createdAt, synced: true }
  await db.transaction('rw', db.products, db.stockMovements, async () => {
    await db.products.update(product.id, { stock: product.stock + quantityDelta })
    await db.stockMovements.add(movement)
  })
  return movement
}

export async function recordStockDelivery(
  product: Product,
  quantity: number,
  unitCost: number,
  supplierName: string,
  receivedAt: string,
  locationId: string,
  sellingPrice?: number,
  supplierId?: string,
  supplierPhone?: string,
) {
  if (quantity < 1 || unitCost < 0 || !supplierName.trim())
    throw new Error('Enter a supplier, quantity, and cost price.')
  if (sellingPrice !== undefined && sellingPrice < 0) throw new Error('Selling price cannot be negative.')
  const client = requireOnlineInventory()
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const { error } = await client.rpc('record_stock_delivery', {
    p_delivery: {
      id,
      product_id: product.id,
      supplier_id: supplierId ?? null,
      supplier_name: supplierName.trim(),
      supplier_phone: supplierPhone ?? null,
      quantity,
      unit_cost_kobo: Math.round(unitCost * 100),
      selling_price_kobo: sellingPrice === undefined ? null : Math.round(sellingPrice * 100),
      received_at: receivedAt,
      location_id: locationId,
    },
  })
  if (error) throw error
  const delivery = {
    id,
    productId: product.id,
    supplierName: supplierName.trim(),
    quantity,
    unitCost,
    receivedAt,
    createdAt,
    synced: true,
  }
  const movement = {
    id: crypto.randomUUID(),
    productId: product.id,
    quantityDelta: quantity,
    reason: 'delivery' as const,
    createdAt,
    synced: true,
  }
  await db.transaction('rw', db.products, db.stockDeliveries, db.stockMovements, async () => {
    await db.products.update(product.id, {
      stock: product.stock + quantity,
      costPrice: unitCost,
      ...(sellingPrice === undefined ? {} : { price: sellingPrice }),
    })
    await db.stockDeliveries.add(delivery)
    await db.stockMovements.add(movement)
  })
}
