import { Card, Table, Tag, Typography } from 'antd'
import type { Product, StockMovement } from '../../types'

const { Text } = Typography
const labels: Record<StockMovement['reason'], string> = { sale: 'Sale', delivery: 'Delivery', correction: 'Correction', damaged: 'Damaged / waste', sale_return: 'Sale return', stock_count: 'Stock count' }
export function InventoryMovementHistory({ movements, products }: { movements: StockMovement[]; products: Product[] }) {
  const names = new Map(products.map((product) => [product.id, product.name]))
  const columns = [{ title: 'Time', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => new Date(value).toLocaleString('en-NG') }, { title: 'Product', dataIndex: 'productId', key: 'productId', render: (id: string) => names.get(id) ?? 'Unknown product' }, { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (reason: StockMovement['reason']) => <Tag>{labels[reason]}</Tag> }, { title: 'Change', dataIndex: 'quantityDelta', key: 'quantityDelta', render: (value: number) => <Text type={value < 0 ? 'danger' : 'success'} strong>{value > 0 ? '+' : ''}{value}</Text> }]
  return <Card title="Inventory movement history"><Table columns={columns} dataSource={movements} rowKey="id" pagination={{ pageSize: 12 }} locale={{ emptyText: 'No inventory movements recorded yet.' }} /></Card>
}
