import { Card, Divider, Statistic, Typography } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import type { Sale } from '../../types'

const { Text } = Typography
export function TodaySalesSummary({ sales }: { sales: Sale[] }) {
  const saleItems = useLiveQuery(() => db.saleItems.toArray(), []) ?? []
  const today = new Date().toDateString()
  const todaySales = sales.filter((sale) => new Date(sale.createdAt).toDateString() === today && sale.status !== 'returned')
  const total = todaySales.reduce((sum, sale) => sum + sale.total, 0)
  const todaySaleIds = new Set(todaySales.map((sale) => sale.id))
  const grossProfit = saleItems.filter((item) => todaySaleIds.has(item.saleId) && (item.costPrice ?? 0) > 0).reduce((sum, item) => sum + (item.unitPrice - (item.costPrice ?? 0)) * (item.quantity - (item.returnedQuantity ?? 0)), 0)
  const byPayment = todaySales.reduce<Record<string, number>>((totals, sale) => ({ ...totals, [sale.paymentMethod]: (totals[sale.paymentMethod] ?? 0) + sale.total }), {})
  return <Card title="Today’s sales" className="shadow-sm"><Statistic title="Sales recorded" value={todaySales.length} /><Statistic className="mt-4" title="Sales total" value={total} formatter={(value) => formatNaira(Number(value))} /><Statistic className="mt-4" title="Gross profit" value={grossProfit} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#167843' }} /><Divider className="!my-4" /><Text strong>Payment reconciliation</Text><div className="mt-3 space-y-2">{(['cash', 'card', 'transfer', 'credit'] as const).map((method) => <div key={method} className="flex justify-between"><Text className="capitalize">{method.replace('_', ' ')}</Text><Text strong>{formatNaira(byPayment[method] ?? 0)}</Text></div>)}</div><Text type="secondary" className="mt-4 block">Gross profit uses the cost captured when the local sale was made.</Text></Card>
}
