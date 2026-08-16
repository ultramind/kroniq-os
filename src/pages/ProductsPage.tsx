import { PlusOutlined } from '@ant-design/icons'
import { Button, Card, Statistic } from 'antd'
import { formatNaira } from '../lib/currency'
import { ProductManagement } from '../features/inventory/ProductManagement'
import type { Product, Role } from '../types'

export function ProductsPage({ products, role, onAddProduct, onSaveProduct }: { products: Product[]; role: Role; onAddProduct: () => void; onSaveProduct: (product: Product, values: { name: string; sku: string; price: number; costPrice: number; minimumSellingPrice?: number; active: boolean; description?: string; imageUrl?: string; imageUrls?: string[]; onlinePublished?: boolean; featured?: boolean }) => Promise<void> }) {
  const active = products.filter((product) => product.active !== false)
  const lowStock = active.filter((product) => product.stock <= (product.lowStockThreshold ?? 10)).length
  const sellingValue = active.reduce((sum, product) => sum + product.stock * product.price, 0)
  const costValue = active.reduce((sum, product) => sum + product.stock * product.costPrice, 0)
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="mb-1 text-xl font-semibold text-slate-900">Product management</h2><p className="mb-0 text-sm text-slate-500">Manage catalogue details, pricing, availability, and stock alerts.</p></div>{role !== 'cashier' && <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onAddProduct}>Add product</Button>}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card><Statistic title="Active products" value={active.length} /></Card><Card><Statistic title="Low-stock products" value={lowStock} valueStyle={{ color: lowStock ? '#d46b08' : undefined }} /></Card><Card><Statistic title="Stock cost value" value={costValue} formatter={(value) => formatNaira(Number(value))} /></Card><Card><Statistic title="Stock selling value" value={sellingValue} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#167843' }} /></Card></div><ProductManagement products={products} role={role} onSave={onSaveProduct} /></div>
}
