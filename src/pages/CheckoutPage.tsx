import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { Badge, Button, Card, Drawer, Input, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { CartItem, PaymentMethod, Product } from '../types'
import type { CreditDetails } from '../features/pos/checkout.service'
import { CartPanel } from '../features/pos/CartPanel'
import { HeldSales } from '../features/pos/HeldSales'
import { QuantityKeypadModal } from '../features/pos/QuantityKeypadModal'
import { publishCustomerDisplay } from '../features/pos/customerDisplay'
import { db } from '../db'
import { usePosStore } from '../store'

type Props = {
  products: Product[]
  search: string
  cart: CartItem[]
  total: number
  role?: import('../types').Role
  flexiblePricingEnabled?: boolean
  discountPercent?: number
  onDiscountChange?: (value: number) => void
  paymentMethod: PaymentMethod
  onSearchChange: (value: string) => void
  onBarcodeLookup: (code: string) => void
  onQuantityChange: (id: string, quantity: number) => void
  onUnitPriceChange: (id: string, price: number) => void
  onPaymentChange: (method: PaymentMethod) => void
  onCheckout: (credit?: CreditDetails) => void
  onHistoricalCheckout?: (credit: CreditDetails | undefined, saleDate: string, deductStock: boolean) => void
  historicalSaving?: boolean
  onHold?: () => void
}

export function CheckoutPage({ products, search, cart, total, role = 'cashier', flexiblePricingEnabled = true, discountPercent = 0, onDiscountChange = () => undefined, paymentMethod, onSearchChange, onBarcodeLookup, onQuantityChange, onUnitPriceChange, onPaymentChange, onCheckout, onHistoricalCheckout, historicalSaving, onHold }: Props) {
  const state = usePosStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [quantityProduct, setQuantityProduct] = useState<Product>()
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
  const heldSales = useLiveQuery(() => db.heldSales.toArray(), []) ?? []
  const hold = onHold ?? (() => {
    void db.heldSales.add({ id: crypto.randomUUID(), items: cart, paymentMethod, createdAt: new Date().toISOString() })
    state.clearCart()
  })

  useEffect(() => { publishCustomerDisplay(cart, total, paymentMethod) }, [cart, total, paymentMethod])
  useEffect(() => { if (searchParams.has('cart')) setCartDrawerOpen(true) }, [searchParams])
  const openCustomerDisplay = () => {
    const display = window.open(new URL('/customer-display', window.location.origin).toString(), '_blank', 'noopener,noreferrer')
    display?.focus()
  }
  const quantityAlreadyInCart = quantityProduct ? cart.find((item) => item.id === quantityProduct.id)?.quantity ?? 0 : 0
  const columns: TableColumnsType<Product> = [
    {
      title: 'Product',
      key: 'product',
      render: (_, product) => <div className="min-w-[180px]"><Typography.Text strong className="block">{product.name}</Typography.Text><Typography.Text type="secondary" className="text-xs">SKU {product.sku}</Typography.Text></div>,
    },
    { title: 'Category', dataIndex: 'category', key: 'category', responsive: ['md'], render: (category) => <Tag className="!m-0 !border-0 !bg-slate-100 !text-slate-600">{category}</Tag> },
    { title: 'Price', dataIndex: 'price', key: 'price', align: 'right', render: (price) => <Typography.Text strong>₦{price.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</Typography.Text> },
    { title: 'Stock', dataIndex: 'stock', key: 'stock', align: 'center', responsive: ['sm'], render: (stock: number) => <span className={stock < 10 ? 'font-semibold text-red-600' : 'text-slate-600'}>{stock}</span> },
  ]
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0)
  const cartPanel = <CartPanel cart={cart} total={total} role={role} discountPercent={state.discountPercent ?? discountPercent} onDiscountChange={state.setDiscountPercent ?? onDiscountChange} paymentMethod={paymentMethod} onMethodChange={onPaymentChange} onQuantityChange={onQuantityChange} onUnitPriceChange={onUnitPriceChange} onCheckout={onCheckout} onHistoricalCheckout={onHistoricalCheckout} historicalSaving={historicalSaving} onHold={hold} onOpenCustomerDisplay={openCustomerDisplay}>
    <HeldSales sales={heldSales} onResume={(sale) => { state.replaceCart(sale.items); onPaymentChange(sale.paymentMethod); void db.heldSales.delete(sale.id) }} />
  </CartPanel>

  return <><div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_410px]">
    <div className="fixed right-0 top-16 z-30 lg:hidden">
      <Badge count={cartItemCount} size="small" className="cart-drawer-trigger">
        <Button type="primary" aria-label="Open current sale" className="!h-[46px] !w-[46px] !rounded-l !rounded-r-none !p-0" icon={<ShoppingCartOutlined />} onClick={() => setCartDrawerOpen(true)} />
      </Badge>
    </div>
    <Card className="checkout-catalogue-card min-w-0" bodyStyle={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
      <div className="border-b border-slate-100 p-4 md:p-5">
        <Input.Search
          size="large"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onSearch={onBarcodeLookup}
          placeholder="Search name, SKU, or scan barcode"
          enterButton={<Button size="large" icon={<SearchOutlined />}>Search</Button>}
          allowClear
          className="checkout-product-search"
        />
        <div className="mt-3 flex items-center justify-between gap-3"><Typography.Text type="secondary" className="text-xs">{products.length} products available</Typography.Text><Typography.Text type="secondary" className="hidden text-xs sm:inline">Tap a product to choose quantity</Typography.Text></div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Table<Product>
          rowKey="id"
          columns={columns}
          dataSource={products}
          size="middle"
          sticky
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showQuickJumper: true,
            hideOnSinglePage: false,
            position: ['topRight', 'bottomRight'],
            showTotal: (count, range) => `${range[0]}–${range[1]} of ${count} products`,
          }}
          scroll={{ x: 540 }}
          rowClassName={(product) => product.stock > 0 ? 'checkout-product-row cursor-pointer' : 'checkout-product-row cursor-not-allowed opacity-55'}
          onRow={(product) => product.stock > 0 ? {
            onClick: () => setQuantityProduct(product),
            onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setQuantityProduct(product) } },
            tabIndex: 0,
            role: 'button',
            'aria-label': `Add ${product.name} to the current sale`,
          } : { 'aria-label': `${product.name} is out of stock` }}
          locale={{ emptyText: 'No products match your search.' }}
          className="checkout-product-table"
        />
      </div>
    </Card>
    <div className="hidden lg:block">{cartPanel}</div>
  </div>
    <Drawer title={<span className="flex items-center gap-2"><ShoppingCartOutlined /> Current sale <span className="text-sm font-normal text-slate-500">({cartItemCount} items)</span></span>} placement="right" open={cartDrawerOpen} onClose={() => { setCartDrawerOpen(false); navigate('/checkout', { replace: true }) }} width="min(100vw, 430px)" className="lg:hidden" bodyStyle={{ padding: 16 }}>
    {cartPanel}
  </Drawer>
  <QuantityKeypadModal product={quantityProduct} maxQuantity={Math.max(0, (quantityProduct?.stock ?? 0) - quantityAlreadyInCart)} role={role} flexiblePricingEnabled={flexiblePricingEnabled} open={Boolean(quantityProduct)} onClose={() => setQuantityProduct(undefined)} onConfirm={(quantity, agreedPrice, reason) => { if (quantityProduct) state.addToCartQuantity(quantityProduct, quantity, agreedPrice, reason) }} /></>
}
