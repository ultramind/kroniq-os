import { Card, Statistic, Typography } from 'antd'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import type { Sale } from '../../types'

const { Text } = Typography

export function ProfitReport({ sales }: { sales: Sale[] }) {
  const saleItems = useLiveQuery(() => db.saleItems.toArray(), []) ?? []
  const returns = useLiveQuery(() => db.returnActivities.toArray(), []) ?? []
  const activeSales = sales.filter((sale) => sale.status !== 'returned')
  const saleIds = new Set(activeSales.map((sale) => sale.id))
  const returnedValue = returns.filter((activity) => saleIds.has(activity.saleId)).reduce((total, activity) => total + activity.total, 0)
  const revenue = activeSales.reduce((total, sale) => total + sale.total, 0) - returnedValue
  const costOfGoods = saleItems.filter((item) => saleIds.has(item.saleId) && (item.costPrice ?? 0) > 0).reduce((total, item) => total + (item.costPrice ?? 0) * (item.quantity - (item.returnedQuantity ?? 0)), 0)
  const grossProfit = revenue - costOfGoods
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  return <Card title="Profit report" className="shadow-sm">
    <Statistic title="Net revenue" value={revenue} formatter={(value) => formatNaira(Number(value))} />
    <Statistic className="mt-4" title="Cost of goods sold" value={costOfGoods} formatter={(value) => formatNaira(Number(value))} />
    <Statistic className="mt-4" title="Gross profit" value={grossProfit} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: grossProfit >= 0 ? '#167843' : '#cf1322' }} />
    <div className="mt-3 flex justify-between"><Text type="secondary">Gross margin</Text><Text strong>{margin.toFixed(1)}%</Text></div>
    <Text type="secondary" className="mt-4 block text-xs">Uses the cost price captured at sale time and subtracts locally recorded returns.</Text>
  </Card>
}
