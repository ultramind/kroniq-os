import { PlusOutlined } from '@ant-design/icons'
import { Button, Card, Statistic } from 'antd'
import { DeliveryHistory } from '../features/inventory/DeliveryHistory'
import { formatNaira } from '../lib/currency'
import type { Product, StockDelivery } from '../types'

export function DeliveriesPage({ products, deliveries, onReceiveDelivery }: { products: Product[]; deliveries: StockDelivery[]; onReceiveDelivery: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const todayDeliveries = deliveries.filter((delivery) => delivery.receivedAt?.slice(0, 10) === today)
  const units = deliveries.reduce((sum, delivery) => sum + delivery.quantity, 0)
  const value = deliveries.reduce((sum, delivery) => sum + delivery.quantity * delivery.unitCost, 0)
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="mb-1 text-xl font-semibold text-slate-900">Supplier deliveries</h2><p className="mb-0 text-sm text-slate-500">Record stock received and keep an auditable supplier delivery register.</p></div><Button type="primary" icon={<PlusOutlined />} size="large" onClick={onReceiveDelivery}>Receive delivery</Button></div><div className="grid gap-4 sm:grid-cols-3"><Card><Statistic title="Deliveries today" value={todayDeliveries.length} /></Card><Card><Statistic title="Total units received" value={units} /></Card><Card><Statistic title="Recorded delivery value" value={value} formatter={(amount) => formatNaira(Number(amount))} valueStyle={{ color: '#167843' }} /></Card></div><DeliveryHistory products={products} deliveries={deliveries} /></div>
}
