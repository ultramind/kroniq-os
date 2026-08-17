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
  constructor() {
    super('naira-pos')
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
export const db = new PosDatabase()

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
  await db.transaction('rw', [...db.tables], async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
}
