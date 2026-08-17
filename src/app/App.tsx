import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { App as AntApp, message } from 'antd'
import { db, seedDatabase } from '../db'
import { pullDeliveries, pullProducts, pullSales } from '../sync'
import { useBackgroundSync } from '../hooks/useBackgroundSync'
import { supabase } from '../supabase'
import { usePosStore } from '../store'
import type { Product, ReceiptItem, Role, Sale, SaleItem, StockMovementReason } from '../types'
import { AddProductModal, type ProductFormValues } from '../features/inventory/AddProductModal'
import { InventoryOverview } from '../features/inventory/InventoryOverview'
import { StockAdjustmentModal } from '../features/inventory/StockAdjustmentModal'
import { StockCountModal } from '../features/inventory/StockCountModal'
import { recordStockAdjustment, recordStockDelivery } from '../features/inventory/inventory.service'
import { DeliveryModal } from '../features/inventory/DeliveryModal'
import { updateProductDetails } from '../features/inventory/product.service'
import { CartPanel } from '../features/pos/CartPanel'
import { saveOfflineSale, type CreditDetails } from '../features/pos/checkout.service'
import { ReceiptModal } from '../features/sales/ReceiptModal'
import { RecentSales } from '../features/sales/RecentSales'
import { TodaySalesSummary } from '../features/sales/TodaySalesSummary'
import { returnSaleItems } from '../features/sales/returns.service'
import { AppShell } from './AppShell'
import { CheckoutPage } from '../pages/CheckoutPage'
import { InventoryPage } from '../pages/InventoryPage'
import { SalesPage } from '../pages/SalesPage'
import { StaffPage } from '../pages/StaffPage'
import { ShiftsPage } from '../pages/ShiftsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { ReportsPage } from '../pages/ReportsPage'
import { CreditsPage } from '../pages/CreditsPage'
import { ProductsPage } from '../pages/ProductsPage'
import { DeliveriesPage } from '../pages/DeliveriesPage'
import { ExpensesPage } from '../pages/ExpensesPage'
import { WarehousesPage } from '../pages/WarehousesPage'
import { SummaryPage } from '../pages/SummaryPage'
import { CustomerDisplayPage } from '../pages/CustomerDisplayPage'
import { StorefrontPage } from '../pages/StorefrontPage'
import { ServicesPage } from '../pages/ServicesPage'
import { MaintenanceNoticeBanner } from '../features/support/MaintenanceNoticeBanner'
import { getStoreSettings, saveStoreSettings } from '../lib/storeSettings'

export function App({
  enforcedRole,
  enforcedStaffName,
}: {
  enforcedRole?: Role
  enforcedStaffName?: string
}) {
  const { pathname } = useLocation()
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const recentSales = useLiveQuery(() => db.sales.orderBy('createdAt').reverse().limit(5).toArray(), []) ?? []
  const allSales = useLiveQuery(() => db.sales.toArray(), []) ?? []
  const returnActivities =
    useLiveQuery(() => db.returnActivities.orderBy('createdAt').reverse().toArray(), []) ?? []
  const movements = useLiveQuery(() => db.stockMovements.orderBy('createdAt').reverse().toArray(), []) ?? []
  const deliveries = useLiveQuery(() => db.stockDeliveries.orderBy('createdAt').reverse().toArray(), []) ?? []
  const activeShift = useLiveQuery(() => db.shifts.filter((shift) => !shift.closedAt).first(), [])
  const pendingSync = useLiveQuery(() => db.outbox.count(), []) ?? 0
  const state = usePosStore()
  const [api, contextHolder] = message.useMessage()
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [newProductBarcode, setNewProductBarcode] = useState<string>()
  const [savingProduct, setSavingProduct] = useState(false)
  const [adjustingProduct, setAdjustingProduct] = useState<Product>()
  const [savingAdjustment, setSavingAdjustment] = useState(false)
  const [countingProduct, setCountingProduct] = useState<Product>()
  const [savingCount, setSavingCount] = useState(false)
  const [savingHistoricalSale, setSavingHistoricalSale] = useState(false)
  const [syncError, setSyncError] = useState<string>()
  const [flexiblePricingEnabled, setFlexiblePricingEnabled] = useState(
    () => getStoreSettings().flexiblePricingEnabled,
  )
  const [receipt, setReceipt] = useState<{ sale: Sale; items: ReceiptItem[] }>()
  useEffect(() => {
    const loadCatalogue = async () => {
      if (!supabase || !navigator.onLine) {
        await seedDatabase()
        return
      }
      const result = await pullProducts()
      if (result.error) {
        setSyncError(`Catalogue load: ${result.error}`)
        await seedDatabase()
      }
    }
    void loadCatalogue()
  }, [])
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile) return
      const { data: store } = await supabase
        .from('stores')
        .select('currency_code,flexible_pricing_enabled')
        .eq('id', profile.store_id)
        .maybeSingle()
      if (store?.currency_code)
        saveStoreSettings({
          ...getStoreSettings(),
          currencyCode: store.currency_code,
          flexiblePricingEnabled: store.flexible_pricing_enabled ?? getStoreSettings().flexiblePricingEnabled,
        })
      if (store?.flexible_pricing_enabled !== undefined)
        setFlexiblePricingEnabled(store.flexible_pricing_enabled)
    })()
  }, [])
  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      const settings = (event as CustomEvent<ReturnType<typeof getStoreSettings>>).detail
      if (settings) setFlexiblePricingEnabled(settings.flexiblePricingEnabled)
    }
    window.addEventListener('kroniq-settings-updated', onSettingsUpdated)
    return () => window.removeEventListener('kroniq-settings-updated', onSettingsUpdated)
  }, [])
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    void pullSales()
    void pullDeliveries()
    const channel = client
      .channel('store-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => void pullSales())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => void pullProducts())
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [])
  useEffect(() => {
    if (enforcedRole) state.setRole(enforcedRole)
  }, [enforcedRole, state.setRole])
  const notifySynced = useCallback(
    (count: number) => api.success(`${count} record${count === 1 ? '' : 's'} synced.`),
    [api],
  )
  const retrySync = useBackgroundSync(notifySynced, setSyncError)
  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.active !== false &&
          `${product.name} ${product.sku}`.toLowerCase().includes(state.search.toLowerCase()),
      ),
    [products, state.search],
  )
  const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discount = Math.round(subtotal * state.discountPercent) / 100
  const total = subtotal - discount
  function handleBarcodeLookup(code: string): Product | undefined {
    const product = products.find((item) => item.sku === code.trim())
    if (!code.trim()) return
    if (!product) {
      if (state.role !== 'cashier') {
        setNewProductBarcode(code.trim())
        setInventoryOpen(true)
        api.info('Barcode not found. Add the new product details.')
      } else api.warning(`No product found for SKU/barcode: ${code}`)
      return
    }
    if (!product.stock) {
      api.warning(`${product.name} is out of stock.`)
      return
    }
    return product
  }
  async function checkout(credit?: CreditDetails) {
    if (!state.cart.length) return
    const cart = [...state.cart]
    const sale = await saveOfflineSale(cart, total, state.paymentMethod, discount, credit)
    state.clearCart()
    setReceipt({
      sale,
      items: cart.map((item) => ({ productName: item.name, quantity: item.quantity, unitPrice: item.price })),
    })
    api.success(`Sale ${sale.receiptNo} saved locally and queued for sync.`)
  }
  async function recordHistoricalSale(
    credit: CreditDetails | undefined,
    saleDate: string,
    deductStock: boolean,
  ) {
    if ((enforcedRole ?? state.role) === 'cashier') return
    if (!supabase || !navigator.onLine) {
      api.error('Historical sales require an internet connection.')
      return
    }
    if (!state.cart.length || saleDate >= new Date().toISOString().slice(0, 10)) {
      api.error('Choose a date before today for a historical sale.')
      return
    }
    const cart = [...state.cart]
    const id = crypto.randomUUID()
    const createdAt = `${saleDate}T12:00:00.000Z`
    const receiptNo = `HIS-${Date.now().toString().slice(-8)}`
    setSavingHistoricalSale(true)
    try {
      const { error } = await supabase.rpc(
        deductStock ? 'record_historical_sale_with_stock' : 'record_historical_sale',
        {
          p_sale_id: id,
          p_receipt_no: receiptNo,
          p_total_kobo: Math.round(total * 100),
          p_payment_method: state.paymentMethod,
          p_sold_at: createdAt,
          p_discount_kobo: Math.round(discount * 100),
          p_items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
            unit_price_kobo: Math.round(item.price * 100),
          })),
          p_credit:
            state.paymentMethod === 'credit'
              ? {
                  customer_name: credit?.customerName,
                  customer_phone: credit?.customerPhone,
                  due_date: credit?.dueDate,
                  initial_payment_kobo: Math.round((credit?.initialPayment ?? 0) * 100),
                }
              : null,
        },
      )
      if (error) throw error
      const sale: Sale = {
        id,
        receiptNo,
        total,
        paymentMethod: state.paymentMethod,
        createdAt,
        cashier: enforcedStaffName ?? 'Manager',
        synced: true,
        historical: true,
        discount,
        status: 'completed',
        creditCustomerName: credit?.customerName,
        creditCustomerPhone: credit?.customerPhone,
        creditDueDate: credit?.dueDate,
        creditInitialPayment: credit?.initialPayment ?? 0,
      }
      await db.transaction('rw', db.sales, db.saleItems, async () => {
        await db.sales.put(sale)
        await db.saleItems.bulkPut(
          cart.map((item) => ({
            id: crypto.randomUUID(),
            saleId: id,
            productId: item.id,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            costPrice: item.costPrice,
          })),
        )
      })
      state.clearCart()
      setReceipt({
        sale,
        items: cart.map((item) => ({
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
        })),
      })
      void Promise.all([pullSales(), ...(deductStock ? [pullProducts()] : [])])
      api.success(
        deductStock
          ? `Historical sale ${receiptNo} recorded and current stock was corrected.`
          : `Historical sale ${receiptNo} recorded without changing stock.`,
      )
    } catch (error) {
      const details = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
      api.error(details || 'Could not record historical sale.')
    } finally {
      setSavingHistoricalSale(false)
    }
  }
  async function viewReceipt(sale: Sale) {
    let items = await db.saleItems.where('saleId').equals(sale.id).toArray()
    if (!items.length && supabase && navigator.onLine) {
      const { data } = await supabase
        .from('sale_items')
        .select('id, product_id, quantity, unit_price_kobo, cost_price_kobo, products(name)')
        .eq('sale_id', sale.id)
      items = (data ?? []).map((item: any) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        return {
          id: item.id,
          saleId: sale.id,
          productId: item.product_id,
          productName: product?.name ?? 'Product',
          quantity: item.quantity,
          unitPrice: item.unit_price_kobo / 100,
          costPrice: (item.cost_price_kobo ?? 0) / 100,
        }
      })
      if (items.length) await db.saleItems.bulkPut(items)
    }
    setReceipt({
      sale,
      items: items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    })
  }
  async function processReturn(sale: Sale, selected: Array<{ item: SaleItem; quantity: number }>) {
    try {
      await returnSaleItems(sale, selected, enforcedStaffName)
      await Promise.all([pullProducts(), pullSales()])
      api.success(`Selected items from ${sale.receiptNo} were returned and stock was restored online.`)
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not return sale.')
    }
  }
  async function saveProduct(values: ProductFormValues) {
    setSavingProduct(true)
    const categoryName = values.category[0]?.trim() || 'Uncategorised'
    const product: Product = {
      id: crypto.randomUUID(),
      name: values.name,
      sku: values.sku,
      price: values.price,
      costPrice: values.costPrice,
      minimumSellingPrice: values.minimumSellingPrice,
      stock: values.stock,
      lowStockThreshold: values.lowStockThreshold,
      category: categoryName,
    }
    if (supabase) {
      if (!navigator.onLine) {
        api.error('Adding products requires an internet connection.')
        setSavingProduct(false)
        return
      }
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('store_id')
        .limit(1)
      const profile = profiles?.[0]
      if (profileError || !profile) {
        api.error(profileError?.message ?? 'Store profile not found')
        setSavingProduct(false)
        return
      }
      const { data: categoryRows, error: categoryError } = await supabase
        .from('categories')
        .upsert({ store_id: profile.store_id, name: categoryName }, { onConflict: 'store_id,name' })
        .select('id')
      const category = categoryRows?.[0]
      if (categoryError || !category) {
        api.error(categoryError?.message ?? 'Could not save product category')
        setSavingProduct(false)
        return
      }
      const { error } = await supabase.from('products').insert({
        id: product.id,
        store_id: profile.store_id,
        category_id: category.id,
        name: product.name,
        sku: product.sku,
        price_kobo: Math.round(product.price * 100),
        cost_price_kobo: Math.round(product.costPrice * 100),
        minimum_selling_price_kobo:
          product.minimumSellingPrice === undefined ? null : Math.round(product.minimumSellingPrice * 100),
        stock_quantity: product.stock,
        low_stock_threshold: product.lowStockThreshold,
      })
      if (error) {
        api.error(error.message)
        setSavingProduct(false)
        return
      }
    }
    await db.products.put(product)
    setSavingProduct(false)
    setInventoryOpen(false)
    api.success(`${product.name} added to inventory.`)
  }
  async function saveAdjustment(values: { quantityDelta: number; reason: StockMovementReason }) {
    if (!adjustingProduct) return
    setSavingAdjustment(true)
    try {
      await recordStockAdjustment(adjustingProduct, values.quantityDelta, values.reason)
      await pullProducts()
      setAdjustingProduct(undefined)
      api.success('Stock movement saved to Supabase.')
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not adjust stock.')
    } finally {
      setSavingAdjustment(false)
    }
  }
  async function saveDelivery(values: {
    productId: string
    supplierId?: string
    supplierName: string
    supplierPhone?: string
    quantity: number
    unitCost: number
    sellingPrice?: number
    receivedAt: string
    locationId: string
  }) {
    const product = products.find((item) => item.id === values.productId)
    if (!product) return
    setSavingDelivery(true)
    try {
      await recordStockDelivery(
        product,
        values.quantity,
        values.unitCost,
        values.supplierName,
        values.receivedAt,
        values.locationId,
        values.sellingPrice,
        values.supplierId,
        values.supplierPhone,
      )
      await Promise.all([pullProducts(), pullDeliveries()])
      setDeliveryOpen(false)
      api.success(
        values.sellingPrice === undefined
          ? 'Supplier delivery saved to Supabase.'
          : 'Supplier delivery and selling price saved to Supabase.',
      )
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not record delivery.')
    } finally {
      setSavingDelivery(false)
    }
  }
  async function saveStockCount(physicalCount: number) {
    if (!countingProduct) return
    setSavingCount(true)
    try {
      const delta = physicalCount - countingProduct.stock
      if (delta !== 0) await recordStockAdjustment(countingProduct, delta, 'stock_count')
      await pullProducts()
      setCountingProduct(undefined)
      api.success(
        delta === 0 ? 'Stock count matches the system quantity.' : 'Stock count reconciled in Supabase.',
      )
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not reconcile stock.')
    } finally {
      setSavingCount(false)
    }
  }
  async function markCreditPaid(sale: Sale) {
    if (!supabase || !navigator.onLine) {
      api.error('Marking credit as paid requires an internet connection.')
      return
    }
    const { error } = await supabase.rpc('mark_credit_paid', { p_sale_id: sale.id })
    if (error) {
      api.error(error.message)
      return
    }
    const creditSettledAt = new Date().toISOString()
    await db.sales.update(sale.id, { creditSettledAt })
    api.success(`${sale.receiptNo} marked as paid.`)
  }
  async function saveProductDetails(
    product: Product,
    values: {
      name: string
      sku: string
      price: number
      costPrice: number
      minimumSellingPrice?: number
      active: boolean
      description?: string
      imageUrl?: string
      imageUrls?: string[]
      onlinePublished?: boolean
      featured?: boolean
    },
  ) {
    try {
      await updateProductDetails(product, values)
      api.success(`${values.name} updated.`)
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not update product.')
    }
  }
  async function reloadCatalogue() {
    const result = await pullProducts()
    if (result.error) {
      setSyncError(result.error)
      api.error(result.error)
    } else {
      api.success('Catalogue reloaded. Pending sales and returns were kept.')
    }
  }
  if (pathname === '/customer-display') return <CustomerDisplayPage />
  if (pathname.startsWith('/shop/')) return <StorefrontPage />
  return (
    <AppShell
      role={state.role}
      pendingSync={pendingSync}
      syncError={syncError}
      onRetrySync={() => void retrySync()}
      onReloadCatalogue={() => void reloadCatalogue()}
    >
      {contextHolder}
      <MaintenanceNoticeBanner />
      <div className="mx-auto max-w-7xl">
        <Routes>
          <Route path="/settings" element={<SettingsPage role={state.role} />} />
          <Route path="/" element={<SummaryPage sales={allSales} />} />
          <Route path="/summary" element={<SummaryPage sales={allSales} />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route
            path="/checkout"
            element={
              <CheckoutPage
                products={visibleProducts}
                search={state.search}
                cart={state.cart}
                total={total}
                role={enforcedRole ?? state.role}
                flexiblePricingEnabled={flexiblePricingEnabled}
                paymentMethod={state.paymentMethod}
                onSearchChange={state.setSearch}
                onBarcodeLookup={handleBarcodeLookup}
                onQuantityChange={state.updateQuantity}
                onUnitPriceChange={state.updateUnitPrice}
                onPaymentChange={state.setPaymentMethod}
                onCheckout={(credit) => void checkout(credit)}
                onHistoricalCheckout={(credit, saleDate, deductStock) =>
                  void recordHistoricalSale(credit, saleDate, deductStock)
                }
                historicalSaving={savingHistoricalSale}
              />
            }
          />
          <Route
            path="/shifts"
            element={<ShiftsPage activeShift={activeShift} onChanged={() => undefined} />}
          />
          <Route
            path="/sales"
            element={
              <SalesPage
                recentSales={recentSales}
                allSales={allSales}
                returnActivities={returnActivities}
                role={state.role}
                onViewReceipt={(sale) => void viewReceipt(sale)}
                onReturnSale={(sale, selected) => void processReturn(sale, selected)}
              />
            }
          />
          <Route path="/reports" element={<ReportsPage sales={allSales} role={state.role} />} />
          <Route
            path="/credits"
            element={<CreditsPage sales={allSales} onRefreshSales={() => void pullSales()} />}
          />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route
            path="/products"
            element={
              <ProductsPage
                products={products}
                role={state.role}
                onAddProduct={() => {
                  setNewProductBarcode(undefined)
                  setInventoryOpen(true)
                }}
                onSaveProduct={saveProductDetails}
              />
            }
          />
          <Route
            path="/deliveries"
            element={
              <DeliveriesPage
                products={products}
                deliveries={deliveries}
                onReceiveDelivery={() => setDeliveryOpen(true)}
              />
            }
          />
          <Route path="/warehouses" element={<WarehousesPage products={products} />} />
          <Route
            path="/inventory"
            element={
              <InventoryPage
                products={products}
                movements={movements}
                role={state.role}
                onAdjustProduct={setAdjustingProduct}
                onCountProduct={setCountingProduct}
              />
            }
          />
          <Route path="/staff" element={<StaffPage role={state.role} />} />
        </Routes>
      </div>
      <AddProductModal
        open={inventoryOpen}
        saving={savingProduct}
        initialSku={newProductBarcode}
        categories={[...new Set(products.map((product) => product.category))].sort()}
        onClose={() => {
          setInventoryOpen(false)
          setNewProductBarcode(undefined)
        }}
        onSave={saveProduct}
      />
      <DeliveryModal
        open={deliveryOpen}
        products={products}
        saving={savingDelivery}
        onClose={() => setDeliveryOpen(false)}
        onSave={saveDelivery}
      />
      <StockAdjustmentModal
        product={adjustingProduct}
        open={Boolean(adjustingProduct)}
        saving={savingAdjustment}
        onClose={() => setAdjustingProduct(undefined)}
        onSave={saveAdjustment}
      />
      <StockCountModal
        product={countingProduct}
        open={Boolean(countingProduct)}
        saving={savingCount}
        onClose={() => setCountingProduct(undefined)}
        onSave={saveStockCount}
      />
      <ReceiptModal sale={receipt?.sale} items={receipt?.items ?? []} onClose={() => setReceipt(undefined)} />
    </AppShell>
  )
}
