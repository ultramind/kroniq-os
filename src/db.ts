import Dexie, { type EntityTable } from 'dexie'
import type {
  CashShift,
  HeldSale,
  Product,
  ReturnActivity,
  Sale,
  SaleItem,
  StockDelivery,
  StockMovement,
  SyncEvent,
} from './types'

class PosDatabase extends Dexie {
  products!: EntityTable<Product, 'id'>
  sales!: EntityTable<Sale, 'id'>
  saleItems!: EntityTable<SaleItem, 'id'>
  shifts!: EntityTable<CashShift, 'id'>
  heldSales!: EntityTable<HeldSale, 'id'>
  returnActivities!: EntityTable<ReturnActivity, 'id'>
  stockDeliveries!: EntityTable<StockDelivery, 'id'>
  stockMovements!: EntityTable<StockMovement, 'id'>
  outbox!: EntityTable<SyncEvent, 'id'>
  constructor(name: string) {
    super(name)
    this.version(1).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(2).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(3).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      saleItems: 'id, saleId, productId',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(4).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      saleItems: 'id, saleId, productId',
      shifts: 'id, openedAt, closedAt',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(5).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      saleItems: 'id, saleId, productId',
      shifts: 'id, openedAt, closedAt',
      heldSales: 'id, createdAt',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(6).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      saleItems: 'id, saleId, productId',
      shifts: 'id, openedAt, closedAt',
      heldSales: 'id, createdAt',
      returnActivities: 'id, saleId, createdAt, synced',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
    this.version(7).stores({
      products: 'id, sku, name, category',
      sales: 'id, createdAt, synced',
      saleItems: 'id, saleId, productId',
      shifts: 'id, openedAt, closedAt',
      heldSales: 'id, createdAt',
      returnActivities: 'id, saleId, createdAt, synced',
      stockDeliveries: 'id, productId, createdAt, synced',
      stockMovements: 'id, productId, createdAt, synced',
      outbox: '++id, entity, createdAt',
    })
  }
}

const legacyDatabaseName = 'naira-pos'
const scopedDatabaseName = (userId: string, organizationId: string) =>
  `kroniqos-pos:${userId}:${organizationId}`

// This binding intentionally changes before a workspace mounts. ES module
// imports are live bindings, so all POS services use the active workspace DB.
export let db = new PosDatabase(legacyDatabaseName)

export async function selectOfflineDatabase(userId: string, organizationId: string) {
  const nextName = scopedDatabaseName(userId, organizationId)
  if (db.name === nextName) return
  db.close()
  db = new PosDatabase(nextName)
  await db.open()
}

/**
 * Move a verified legacy cache into its first scoped database. It runs only
 * when the saved owner and company match, so old data is never copied into a
 * different account or organisation.
 */
export async function migrateLegacyOfflineDatabase(userId: string, organizationId: string) {
  const targetName = scopedDatabaseName(userId, organizationId)
  if (db.name !== targetName) return
  const legacy = new PosDatabase(legacyDatabaseName)
  await legacy.open()
  try {
    if ((await db.products.count()) > 0 || (await db.sales.count()) > 0 || (await db.outbox.count()) > 0)
      return
    const [
      products,
      sales,
      saleItems,
      shifts,
      heldSales,
      returnActivities,
      stockDeliveries,
      stockMovements,
      outbox,
    ] = await Promise.all([
      legacy.products.toArray(),
      legacy.sales.toArray(),
      legacy.saleItems.toArray(),
      legacy.shifts.toArray(),
      legacy.heldSales.toArray(),
      legacy.returnActivities.toArray(),
      legacy.stockDeliveries.toArray(),
      legacy.stockMovements.toArray(),
      legacy.outbox.toArray(),
    ])
    if (
      !products.length &&
      !sales.length &&
      !saleItems.length &&
      !shifts.length &&
      !heldSales.length &&
      !returnActivities.length &&
      !stockDeliveries.length &&
      !stockMovements.length &&
      !outbox.length
    )
      return
    await db.transaction('rw', [...db.tables], async () => {
      await db.products.bulkPut(products)
      await db.sales.bulkPut(sales)
      await db.saleItems.bulkPut(saleItems)
      await db.shifts.bulkPut(shifts)
      await db.heldSales.bulkPut(heldSales)
      await db.returnActivities.bulkPut(returnActivities)
      await db.stockDeliveries.bulkPut(stockDeliveries)
      await db.stockMovements.bulkPut(stockMovements)
      await db.outbox.bulkPut(outbox)
    })
    await legacy.delete()
  } finally {
    legacy.close()
  }
}

export const starterProducts: Product[] = [
  {
    id: 'rice-5kg',
    name: 'Mama Gold Rice 5kg',
    sku: '10001',
    price: 14500,
    costPrice: 11500,
    stock: 18,
    category: 'Groceries',
  },
  {
    id: 'milk-peak',
    name: 'Peak Milk 400g',
    sku: '10002',
    price: 3200,
    costPrice: 2500,
    stock: 24,
    category: 'Dairy',
  },
  {
    id: 'milo-500',
    name: 'Milo Refill 500g',
    sku: '10003',
    price: 4900,
    costPrice: 3800,
    stock: 12,
    category: 'Beverages',
  },
  {
    id: 'indomie',
    name: 'Indomie Super Pack',
    sku: '10004',
    price: 850,
    costPrice: 620,
    stock: 45,
    category: 'Groceries',
  },
  {
    id: 'coke-60cl',
    name: 'Coca-Cola 60cl',
    sku: '10005',
    price: 750,
    costPrice: 520,
    stock: 31,
    category: 'Beverages',
  },
  {
    id: 'detergent',
    name: 'Morning Fresh 450ml',
    sku: '10006',
    price: 1700,
    costPrice: 1250,
    stock: 9,
    category: 'Household',
  },
]

export async function seedDatabase() {
  if ((await db.products.count()) === 0) await db.products.bulkAdd(starterProducts)
}

export async function resetLocalPosData() {
  if (await db.outbox.count()) throw new Error('Cannot reset this device while records are waiting to sync.')
  await db.transaction('rw', [...db.tables], async () => {
    await db.products.clear()
    await db.sales.clear()
    await db.saleItems.clear()
    await db.shifts.clear()
    await db.stockMovements.clear()
    await db.outbox.clear()
  })
}

export async function clearLocalPosDataForNewTenant() {
  // A full database reset is intentional at a company boundary. Clearing each
  // table can leave stale connections alive in installed PWA sessions.
  await db.delete()
  await db.open()
}
