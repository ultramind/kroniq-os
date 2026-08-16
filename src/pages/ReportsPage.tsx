import { DownloadOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Select, Space, Table } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { exportSalesCsv } from '../features/sales/exportSalesCsv'
import { ProfitReport } from '../features/sales/ProfitReport'
import { formatNaira } from '../lib/currency'
import type { Role, Sale } from '../types'

type Period = 'day' | 'month' | 'year'

export function ReportsPage({ sales, role }: { sales: Sale[]; role: Role }) {
  const [period, setPeriod] = useState<Period>('day')
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs())
  const [paymentMethod, setPaymentMethod] = useState('all')
  const saleItems = useLiveQuery(() => db.saleItems.toArray(), []) ?? []
  const returns = useLiveQuery(() => db.returnActivities.toArray(), []) ?? []
  const filtered = useMemo(() => {
    const format = period === 'day' ? 'YYYY-MM-DD' : period === 'month' ? 'YYYY-MM' : 'YYYY'
    const selected = selectedDate.format(format)
    return sales.filter((sale) => sale.createdAt.slice(0, selected.length) === selected && (paymentMethod === 'all' || sale.paymentMethod === paymentMethod))
  }, [paymentMethod, period, sales, selectedDate])
  const costBySale = useMemo(() => saleItems.reduce<Record<string, number>>((totals, item) => ({ ...totals, [item.saleId]: (totals[item.saleId] ?? 0) + (item.costPrice ?? 0) * (item.quantity - (item.returnedQuantity ?? 0)) }), {}), [saleItems])
  const quantityBySale = useMemo(() => saleItems.reduce<Record<string, number>>((totals, item) => ({ ...totals, [item.saleId]: (totals[item.saleId] ?? 0) + item.quantity - (item.returnedQuantity ?? 0) }), {}), [saleItems])
  const returnedBySale = useMemo(() => returns.reduce<Record<string, number>>((totals, activity) => ({ ...totals, [activity.saleId]: (totals[activity.saleId] ?? 0) + activity.total }), {}), [returns])

  if (role !== 'admin') return <Card>Only administrators can view profit reports.</Card>

  return <div className="space-y-6">
    <Card title="Report filters" extra={<Button type="primary" icon={<DownloadOutlined />} onClick={() => exportSalesCsv(filtered)}>Export CSV</Button>}>
      <Space wrap>
        <Select value={period} onChange={(value: Period) => setPeriod(value)} options={[{ value: 'day', label: 'By day' }, { value: 'month', label: 'By month' }, { value: 'year', label: 'By year' }]} />
        <DatePicker picker={period === 'day' ? 'date' : period} value={selectedDate} allowClear={false} onChange={(value) => value && setSelectedDate(value)} />
        <Select value={paymentMethod} className="w-44" onChange={setPaymentMethod} options={[{ value: 'all', label: 'All payments' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card / POS' }, { value: 'transfer', label: 'Transfer' }, { value: 'credit', label: 'Mobile money' }]} />
      </Space>
    </Card>
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <ProfitReport sales={filtered} />
      <Card title={`Sales in selected ${period}`} className="min-w-0"><Table rowKey="id" size="small" scroll={{ x: 940 }} pagination={{ pageSize: 12 }} dataSource={filtered.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))} columns={[{ title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) }, { title: 'Receipt', dataIndex: 'receiptNo', key: 'receiptNo' }, { title: 'Payment', dataIndex: 'paymentMethod', key: 'paymentMethod', render: (value: string) => value.replace('_', ' ') }, { title: 'Qty', key: 'quantity', render: (_: unknown, sale: Sale) => quantityBySale[sale.id] ?? 0 }, { title: 'Sales total', dataIndex: 'total', key: 'total', render: (value: number) => formatNaira(value) }, { title: 'Cost price (COGS)', key: 'cost', render: (_: unknown, sale: Sale) => formatNaira(costBySale[sale.id] ?? 0) }, { title: 'Profit', key: 'profit', render: (_: unknown, sale: Sale) => { const profit = sale.status === 'returned' ? 0 : sale.total - (returnedBySale[sale.id] ?? 0) - (costBySale[sale.id] ?? 0); return <span className={profit >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatNaira(profit)}</span> } }]} /></Card>
    </div>
  </div>
}
