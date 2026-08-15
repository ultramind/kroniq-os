import { Card, Table } from 'antd'
import type { Product, StockDelivery } from '../../types'
import { formatNaira } from '../../lib/currency'

export function DeliveryHistory({ deliveries, products }: { deliveries: StockDelivery[]; products: Product[] }) {
  const names = new Map(products.map((product) => [product.id, product.name]))
  const columns = [
    { title: 'Received date', dataIndex: 'receivedAt', key: 'receivedAt', render: (value: string | undefined, delivery: StockDelivery) => { const date = value ?? delivery.createdAt; return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-NG', { dateStyle: 'medium' }) } },
    { title: 'Product', dataIndex: 'productId', key: 'productId', render: (id: string) => names.get(id) ?? 'Unknown product' },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
    { title: 'Unit cost', dataIndex: 'unitCost', key: 'unitCost', render: (value: number) => formatNaira(value) },
  ]
  return <Card title="Supplier delivery log" extra="Stock received into the store"><Table columns={columns} dataSource={deliveries} rowKey="id" pagination={{ pageSize: 8 }} locale={{ emptyText: 'No supplier deliveries recorded yet.' }} /></Card>
}
