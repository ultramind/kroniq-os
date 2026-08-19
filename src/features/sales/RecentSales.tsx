import { Button, Card, Table, Tag } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import type { Role, Sale } from '../../types'

type Props = {
  sales: Sale[]
  role: Role
  onViewReceipt: (sale: Sale) => void
  onReturnSale: (sale: Sale) => void
}
export function RecentSales({ sales, role, onViewReceipt, onReturnSale }: Props) {
  const saleItems = useLiveQuery(() => db.saleItems.toArray(), []) ?? []
  const quantityBySale = saleItems.reduce<Record<string, number>>(
    (totals, item) => ({
      ...totals,
      [item.saleId]: (totals[item.saleId] ?? 0) + item.quantity - (item.returnedQuantity ?? 0),
    }),
    {},
  )
  const columns = [
    { title: 'Receipt', dataIndex: 'receiptNo', key: 'receiptNo' },
    {
      title: 'Payment',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      render: (value: string) => value.replace('_', ' '),
    },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (value: number) => formatNaira(value) },
    { title: 'Qty', key: 'quantity', render: (_: unknown, sale: Sale) => quantityBySale[sale.id] ?? 0 },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, sale: Sale) =>
        sale.status === 'returned' ? (
          <Tag color="red">Returned</Tag>
        ) : sale.syncStatus === 'stock_conflict' ? (
          <Tag color="warning">Stock review</Tag>
        ) : sale.historical ? (
          <Tag color="blue">Historical</Tag>
        ) : sale.paymentMethod === 'order' ? (
          <Tag color="gold">Order · {sale.orderStatus ?? 'pending'}</Tag>
        ) : (
          <Tag color={sale.synced ? 'success' : 'gold'}>{sale.synced ? 'Synced' : 'Queued'}</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, sale: Sale) => (
        <div className="flex gap-1">
          <Button type="link" size="small" onClick={() => onViewReceipt(sale)}>
            Receipt
          </Button>
          {role !== 'cashier' && sale.syncStatus === 'stock_conflict' && (
            <Tag color="warning">Restock, then retry in Sales</Tag>
          )}
          {role !== 'cashier' && sale.synced && !sale.historical && sale.status !== 'returned' && (
            <Button type="link" danger size="small" onClick={() => onReturnSale(sale)}>
              Return items
            </Button>
          )}
        </div>
      ),
    },
  ]
  return (
    <Card title="Recent local sales" className="shadow-sm">
      <Table
        columns={columns}
        dataSource={sales}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'No sales recorded yet.' }}
        size="small"
      />
    </Card>
  )
}
