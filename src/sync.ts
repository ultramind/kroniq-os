import { db } from './db'
import { supabase } from './supabase'
import type { CartItem, Sale, StockDelivery, StockMovement } from './types'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function resolveSaleItems(items: CartItem[]) {
  if (!supabase || items.every((item) => isUuid(item.id))) return { items }
  const { data, error } = await supabase
    .from('products')
    .select('id, sku')
    .in(
      'sku',
      items.map((item) => item.sku),
    )
  if (error) return { error: error.message }
  const idsBySku = new Map((data ?? []).map((product) => [product.sku, product.id]))
  const missing = items.find((item) => !isUuid(item.id) && !idsBySku.get(item.sku))
  if (missing)
    return {
      error: `Cannot sync ${missing.name}: it is not in the Supabase catalogue. Reload the catalogue, then retry.`,
    }
  return {
    items: items.map((item) => ({ ...item, id: isUuid(item.id) ? item.id : idsBySku.get(item.sku)! })),
  }
}

/**
 * Pushes pending local sales using their locally-created UUIDs as idempotency keys.
 * A retry can therefore never create a duplicate sale server-side.
 */
export async function syncOutbox(): Promise<{ synced: number; error?: string }> {
  if (!supabase || !navigator.onLine) return { synced: 0 }
  const events = await db.outbox.orderBy('createdAt').toArray()
  let synced = 0
  for (const event of events) {
    if (!event.id) continue
    if (event.entity === 'shift_open' || event.entity === 'shift_close') {
      const payload = event.payload as Record<string, unknown>
      const { error } = await supabase.rpc(
        event.entity === 'shift_open' ? 'open_cash_shift' : 'close_cash_shift',
        event.entity === 'shift_open'
          ? { p_shift: payload }
          : { p_shift_id: payload.shiftId, p_closure: payload },
      )
      if (error) return { synced, error: `Cash shift sync: ${error.message}` }
      const shiftId = event.entity === 'shift_open' ? String(payload.id) : String(payload.shiftId)
      await db.transaction('rw', db.shifts, db.outbox, async () => {
        await db.shifts.update(shiftId, { synced: true })
        await db.outbox.delete(event.id!)
      })
      synced++
      continue
    }
    if (event.entity === 'sale_return') {
      const payload = event.payload as {
        saleId: string
        operationId: string
        activityId?: string
        items: Array<{ productId?: string; saleItemId?: string; quantity: number }>
      }
      const returnItems = await Promise.all(
        payload.items.map(async (item) => {
          const localItem = item.productId ? undefined : await db.saleItems.get(item.saleItemId ?? '')
          return { product_id: item.productId ?? localItem?.productId, quantity: item.quantity }
        }),
      )
      if (returnItems.some((item) => !item.product_id))
        return { synced, error: 'Return sync: product details are unavailable on this device.' }
      const { error } = await supabase.rpc('return_sale_items', {
        p_sale_id: payload.saleId,
        p_operation_id: payload.operationId,
        p_items: returnItems,
      })
      if (error) return { synced, error: `Return sync: ${error.message}` }
      await db.transaction('rw', db.sales, db.returnActivities, db.outbox, async () => {
        await db.sales.update(payload.saleId, { synced: true })
        if (payload.activityId) await db.returnActivities.update(payload.activityId, { synced: true })
        await db.outbox.delete(event.id!)
      })
      synced++
      continue
    }
    if (event.entity === 'stock_movement') {
      const movement = event.payload as StockMovement
      const { error } = await supabase.rpc('adjust_stock', {
        p_product_id: movement.productId,
        p_quantity_delta: movement.quantityDelta,
        p_reason: movement.reason,
        p_operation_id: movement.id,
      })
      if (error) return { synced, error: `Stock adjustment sync: ${error.message}` }
      await db.transaction('rw', db.stockMovements, db.outbox, async () => {
        await db.stockMovements.update(movement.id, { synced: true })
        await db.outbox.delete(event.id!)
      })
      synced++
      continue
    }
    if (event.entity === 'stock_delivery') {
      const payload = event.payload as {
        id: string
        productId: string
        supplierName: string
        quantity: number
        unitCost: number
        receivedAt?: string
      }
      const { error } = await supabase.rpc('record_stock_delivery', {
        p_delivery: {
          id: payload.id,
          product_id: payload.productId,
          supplier_name: payload.supplierName,
          quantity: payload.quantity,
          unit_cost_kobo: Math.round(payload.unitCost * 100),
          received_at: payload.receivedAt,
        },
      })
      if (error) return { synced, error: `Supplier delivery sync: ${error.message}` }
      await db.transaction('rw', db.stockDeliveries, db.outbox, async () => {
        await db.stockDeliveries.update(payload.id, { synced: true })
        await db.outbox.delete(event.id!)
      })
      synced++
      continue
    }
    if (event.entity !== 'sale') continue
    const { sale, items } = event.payload as { sale: Sale; items: CartItem[] }
    const resolved = await resolveSaleItems(items)
    if (resolved.error || !resolved.items)
      return { synced, error: resolved.error ?? 'Could not resolve the products for this sale.' }
    const { error: saleError } = await supabase.rpc('record_sale', {
      p_sale_id: sale.id,
      p_receipt_no: sale.receiptNo,
      p_total_kobo: Math.round(sale.total * 100),
      p_discount_kobo: Math.round((sale.discount ?? 0) * 100),
      p_payment_method: sale.paymentMethod,
      p_sold_at: sale.createdAt,
      p_items: resolved.items.map((item) => ({
        product_id: item.sourceProductId ?? item.id,
        packaging_id: item.packagingId ?? null,
        quantity: item.quantity,
        unit_price_kobo: Math.round(item.price * 100),
        price_override_reason: item.priceOverrideReason ?? null,
      })),
      p_credit:
        sale.paymentMethod === 'credit'
          ? {
              customer_name: sale.creditCustomerName,
              customer_phone: sale.creditCustomerPhone,
              due_date: sale.creditDueDate,
              initial_payment_kobo: Math.round((sale.creditInitialPayment ?? 0) * 100),
            }
          : null,
    })
    if (saleError) return { synced, error: `Sale sync: ${saleError.message}` }
    if (sale.paymentMethod === 'credit' && (sale.creditInitialPayment ?? 0) > 0) {
      const { error: creditError } = await supabase.rpc('record_credit_initial_payment', {
        p_sale_id: sale.id,
        p_initial_payment_kobo: Math.round((sale.creditInitialPayment ?? 0) * 100),
      })
      if (creditError) return { synced, error: `Credit sync: ${creditError.message}` }
    }
    await db.transaction('rw', db.sales, db.outbox, async () => {
      await db.sales.update(sale.id, { synced: true })
      await db.outbox.delete(event.id!)
    })
    synced++
  }
  return { synced }
}

/** Keeps the checkout catalogue available locally after an online refresh. */
export async function pullProducts(): Promise<{ loaded: number; error?: string }> {
  if (!supabase || !navigator.onLine) return { loaded: 0 }
  const response = await supabase
    .from('products')
    .select(
      'id, name, sku, price_kobo, cost_price_kobo, minimum_selling_price_kobo, stock_quantity, low_stock_threshold, base_unit, description, image_url, image_urls, online_published, is_featured, categories(name), product_packaging(id,name,units_per_pack,sku,price_kobo,active)',
    )
    .eq('active', true)
    .order('name')
  let data: any[] | null = response.data
  let error = response.error
  if (
    error?.code === '42703' &&
    (error.message.includes('image_urls') ||
      error.message.includes('is_featured') ||
      error.message.includes('minimum_selling_price_kobo'))
  ) {
    const legacy = await supabase
      .from('products')
      .select(
        'id, name, sku, price_kobo, cost_price_kobo, stock_quantity, low_stock_threshold, description, image_url, online_published, categories(name)',
      )
      .eq('active', true)
      .order('name')
    data = legacy.data
    error = legacy.error
  }
  if (error) return { loaded: 0, error: error.message }
  const products = (data ?? []).map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0] : row.categories
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      price: row.price_kobo / 100,
      costPrice: (row.cost_price_kobo ?? 0) / 100,
      minimumSellingPrice:
        row.minimum_selling_price_kobo === null || row.minimum_selling_price_kobo === undefined
          ? undefined
          : row.minimum_selling_price_kobo / 100,
      stock: row.stock_quantity,
      baseUnit: row.base_unit ?? 'piece',
      packages: (row.product_packaging ?? [])
        .filter((pack: any) => pack.active !== false)
        .map((pack: any) => ({
          id: pack.id,
          name: pack.name,
          unitsPerPack: pack.units_per_pack,
          sku: pack.sku ?? undefined,
          price: pack.price_kobo / 100,
          active: pack.active,
        })),
      lowStockThreshold: row.low_stock_threshold ?? 10,
      category: category?.name ?? 'Uncategorised',
      description: row.description ?? undefined,
      imageUrl: row.image_url ?? undefined,
      imageUrls: row.image_urls?.length ? row.image_urls : row.image_url ? [row.image_url] : [],
      onlinePublished: row.online_published ?? false,
      featured: row.is_featured ?? false,
    }
  })
  const cachedCount = await db.products.count()
  // Retain an already-downloaded checkout catalogue if a PWA wake-up receives an
  // empty response while authentication or the connection is still settling.
  if (products.length === 0 && cachedCount > 0) return { loaded: cachedCount }

  await db.transaction('rw', db.products, async () => {
    await db.products.clear()
    await db.products.bulkPut(products)
  })
  return { loaded: products.length }
}

/** Pulls completed sales created by any terminal in this store into the local dashboard cache. */
export async function pullSales(): Promise<{ loaded: number; error?: string }> {
  if (!supabase || !navigator.onLine) return { loaded: 0 }
  const { data, error } = await supabase
    .from('sales')
    .select(
      'id, receipt_no, total_kobo, payment_method, sold_at, cashier_id, returned_at, is_historical, credit_customer_name, credit_customer_phone, credit_due_date, credit_initial_payment_kobo, credit_settled_at, sale_items(id, product_id, quantity, unit_price_kobo, list_price_kobo, price_override_reason, cost_price_kobo, products(name))',
    )
    .order('sold_at', { ascending: false })
    .limit(500)
  if (error) return { loaded: 0, error: error.message }

  await db.transaction('rw', db.sales, db.saleItems, async () => {
    for (const row of data ?? []) {
      const existing = await db.sales.get(row.id)
      if (existing && !existing.synced) continue
      await db.sales.put({
        id: row.id,
        receiptNo: row.receipt_no,
        total: row.total_kobo / 100,
        paymentMethod: row.payment_method,
        createdAt: row.sold_at,
        cashier: existing?.cashier ?? `Staff ${row.cashier_id.slice(0, 8)}`,
        synced: true,
        historical: row.is_historical ?? false,
        status: row.returned_at ? 'returned' : 'completed',
        returnedAt: row.returned_at ?? undefined,
        creditCustomerName: row.credit_customer_name ?? undefined,
        creditCustomerPhone: row.credit_customer_phone ?? undefined,
        creditDueDate: row.credit_due_date ?? undefined,
        creditInitialPayment: (row.credit_initial_payment_kobo ?? 0) / 100,
        creditSettledAt: row.credit_settled_at ?? undefined,
      })
      const items = (row.sale_items ?? []).map((item: any) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        return {
          id: item.id,
          saleId: row.id,
          productId: item.product_id,
          productName: product?.name ?? 'Product',
          quantity: item.quantity,
          unitPrice: item.unit_price_kobo / 100,
          listPrice:
            item.list_price_kobo === null || item.list_price_kobo === undefined
              ? undefined
              : item.list_price_kobo / 100,
          priceOverrideReason: item.price_override_reason ?? undefined,
          costPrice: (item.cost_price_kobo ?? 0) / 100,
        }
      })
      if (items.length) {
        await db.saleItems.where('saleId').equals(row.id).delete()
        await db.saleItems.bulkPut(items)
      }
    }
  })
  return { loaded: data?.length ?? 0 }
}

/** Loads the supplier delivery register from Supabase for the inventory operations page. */
export async function pullDeliveries(): Promise<{ loaded: number; error?: string }> {
  if (!supabase || !navigator.onLine) return { loaded: 0 }
  const { data, error } = await supabase
    .from('supplier_deliveries')
    .select('id, product_id, quantity, unit_cost_kobo, received_at, created_at, suppliers(name)')
    .order('received_at', { ascending: false })
    .limit(500)
  if (error) return { loaded: 0, error: error.message }
  const deliveries: StockDelivery[] = (data ?? []).map((row) => {
    const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
    return {
      id: row.id,
      productId: row.product_id,
      supplierName: supplier?.name ?? 'Unknown supplier',
      quantity: row.quantity,
      unitCost: row.unit_cost_kobo / 100,
      receivedAt: row.received_at,
      createdAt: row.created_at,
      synced: true,
    }
  })
  await db.transaction('rw', db.stockDeliveries, async () => {
    await db.stockDeliveries.clear()
    await db.stockDeliveries.bulkPut(deliveries)
  })
  return { loaded: deliveries.length }
}
