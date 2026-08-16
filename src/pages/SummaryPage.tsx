import { PrinterOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Select, Statistic, Table, Tabs, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { Sale } from '../types'
import { db } from '../db'
import { useLiveQuery } from 'dexie-react-hooks'
import { ServiceDashboard } from '../features/services/ServiceDashboard'

type Period = 'day' | 'week' | 'month' | 'year'
type RemoteExpense = { id: string; amount: number; spentAt: string; description: string }
type RemotePayment = { id: string; amount: number; paidAt: string }
type RemoteDelivery = { id: string; value: number; receivedAt: string }
function rangeFor(period: Period, anchor: string) {
  const date = new Date(`${anchor}T12:00:00`)
  const start = new Date(date); const end = new Date(date)
  if (period === 'week') { const offset = (date.getDay() + 6) % 7; start.setDate(date.getDate() - offset); end.setDate(start.getDate() + 6) }
  if (period === 'month') { start.setDate(1); end.setMonth(date.getMonth() + 1, 0) }
  if (period === 'year') { start.setMonth(0, 1); end.setMonth(11, 31) }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}
export function SummaryPage({ sales }: { sales: Sale[] }) {
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10))
  const [expenses, setExpenses] = useState<RemoteExpense[]>([])
  const [payments, setPayments] = useState<RemotePayment[]>([])
  const [deliveries, setDeliveries] = useState<RemoteDelivery[]>([])
  const [businessModes, setBusinessModes] = useState<string[]>(['retail'])
  const [dashboardTab, setDashboardTab] = useState('retail')
  const [api, holder] = message.useMessage()
  const returns = useLiveQuery(() => db.returnActivities.toArray(), []) ?? []
  const shifts = useLiveQuery(() => db.shifts.toArray(), []) ?? []
  const { start, end } = rangeFor(period, anchor)
  useEffect(() => { void (async () => { if (!supabase) return; const { data: { user } } = await supabase.auth.getUser(); const { data: profile } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null }; if (!profile) return; const { data: store } = await supabase.from('stores').select('organization_id').eq('id', profile.store_id).maybeSingle(); const { data: organization } = store ? await supabase.from('organizations').select('business_modes').eq('id', store.organization_id).maybeSingle() : { data: null }; if (organization?.business_modes?.length) { setBusinessModes(organization.business_modes); if (!organization.business_modes.includes('retail') && organization.business_modes.includes('services')) setDashboardTab('services') } })() }, [])
  useEffect(() => { const load = async () => { if (!supabase) return; const [{ data: expenseRows, error: expenseError }, { data: paymentRows, error: paymentError }, { data: deliveryRows, error: deliveryError }] = await Promise.all([supabase.from('expenses').select('id, amount_kobo, spent_at, description').gte('spent_at', start).lte('spent_at', end), supabase.from('credit_payments').select('id, amount_kobo, paid_at').gte('paid_at', start).lte('paid_at', end), supabase.from('supplier_deliveries').select('id, quantity, unit_cost_kobo, received_at').gte('received_at', start).lte('received_at', end)]); const error = expenseError ?? paymentError ?? deliveryError; if (error) { api.error(error.message); return }; setExpenses((expenseRows ?? []).map((row) => ({ id: row.id, amount: row.amount_kobo / 100, spentAt: row.spent_at, description: row.description }))); setPayments((paymentRows ?? []).map((row) => ({ id: row.id, amount: row.amount_kobo / 100, paidAt: row.paid_at }))); setDeliveries((deliveryRows ?? []).map((row) => ({ id: row.id, value: (row.quantity * row.unit_cost_kobo) / 100, receivedAt: row.received_at }))) }; void load() }, [api, end, start])
  const filteredSales = useMemo(() => sales.filter((sale) => sale.createdAt.slice(0, 10) >= start && sale.createdAt.slice(0, 10) <= end && sale.status !== 'returned'), [end, sales, start])
  const salesTotal = filteredSales.reduce((sum, sale) => sum + sale.total, 0)
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const creditIssued = filteredSales.filter((sale) => sale.paymentMethod === 'credit').reduce((sum, sale) => sum + sale.total - (sale.creditInitialPayment ?? 0), 0)
  const creditCollected = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const deliveryValue = deliveries.reduce((sum, delivery) => sum + delivery.value, 0)
  const returnTotal = returns.filter((item) => item.createdAt.slice(0, 10) >= start && item.createdAt.slice(0, 10) <= end).reduce((sum, item) => sum + item.total, 0)
  const cashVariance = shifts.filter((shift) => {
    const closedDate = shift.closedAt?.slice(0, 10) ?? ''
    return closedDate >= start && closedDate <= end
  }).reduce((sum, shift) => sum + (shift.variance ?? 0), 0)
  const paymentRows = Object.entries(filteredSales.reduce<Record<string, number>>((totals, sale) => ({ ...totals, [sale.paymentMethod]: (totals[sale.paymentMethod] ?? 0) + sale.total }), {})).map(([method, total]) => ({ method, total }))
  const financialMetrics = [{ label: 'Sales', value: salesTotal, color: 'bg-emerald-500' }, { label: 'Expenses', value: expenseTotal, color: 'bg-amber-500' }, { label: 'Credit collected', value: creditCollected, color: 'bg-sky-500' }]
  const chartMax = Math.max(1, ...financialMetrics.map((metric) => metric.value), ...paymentRows.map((row) => row.total))
  const retailDashboard = <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Card><Statistic title="Sales recorded" value={salesTotal} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#167843' }} /></Card><Card><Statistic title="Expenses" value={expenseTotal} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#b45309' }} /></Card><Card><Statistic title="Sales less expenses" value={salesTotal - expenseTotal} formatter={(value) => formatNaira(Number(value))} /></Card><Card><Statistic title="Credit issued" value={creditIssued} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#b45309' }} /></Card><Card><Statistic title="Credit collected" value={creditCollected} formatter={(value) => formatNaira(Number(value))} valueStyle={{ color: '#167843' }} /></Card><Card><Statistic title="Supplier delivery value" value={deliveryValue} formatter={(value) => formatNaira(Number(value))} /></Card><Card><Statistic title="Returns recorded" value={returnTotal} formatter={(value) => formatNaira(Number(value))} /></Card><Card><Statistic title="Cash-shift variance" value={cashVariance} formatter={(value) => formatNaira(Number(value))} /></Card></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Financial movement"><div className="flex h-52 items-end justify-around gap-5 px-3 pt-6">{financialMetrics.map((metric) => <div key={metric.label} className="flex h-full flex-1 flex-col justify-end"><div className="mb-2 text-center text-xs font-semibold text-slate-700">{formatNaira(metric.value)}</div><div className={`${metric.color} min-h-[4px] rounded-t-lg transition-all`} style={{ height: `${(metric.value / chartMax) * 100}%` }} /><div className="mt-2 text-center text-xs text-slate-500">{metric.label}</div></div>)}</div></Card><Card title="Sales by payment method"><div className="space-y-4 pt-1">{paymentRows.length ? paymentRows.map((row) => <div key={row.method}><div className="mb-1 flex justify-between text-sm"><span className="capitalize text-slate-600">{row.method.replace('_', ' ')}</span><strong>{formatNaira(row.total)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(row.total / chartMax) * 100}%` }} /></div></div>) : <p className="text-sm text-slate-500">No sales in this period.</p>}</div></Card></div><div className="grid gap-4 xl:grid-cols-2"><Card title="Sales by payment method" className="payment-summary-table min-w-0"><Table rowKey="method" size="small" pagination={false} dataSource={paymentRows} columns={[{ title: 'Payment method', dataIndex: 'method', render: (value: string) => <Tag className="capitalize">{value.replace('_', ' ')}</Tag> }, { title: 'Sales', dataIndex: 'total', align: 'right', render: (value: number) => formatNaira(value) }]} summary={() => <Table.Summary.Row><Table.Summary.Cell index={0}><strong>Total sales</strong></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><strong>{formatNaira(salesTotal)}</strong></Table.Summary.Cell></Table.Summary.Row>} locale={{ emptyText: 'No sales in this period.' }} /></Card><Card title="Recent expenses" className="min-w-0"><div className="dashboard-table-scroll"><Table rowKey="id" size="small" pagination={false} scroll={{ x: 640 }} dataSource={expenses.slice(0, 6)} columns={[{ title: 'Date', dataIndex: 'spentAt', render: (value: string) => value }, { title: 'Description', dataIndex: 'description' }, { title: 'Amount', dataIndex: 'amount', render: (value: number) => formatNaira(value) }]} locale={{ emptyText: 'No expenses in this period.' }} /></div></Card></div></div>
  const tabs = [{ key: 'retail', label: 'Retail', children: retailDashboard }, { key: 'services', label: 'Services', children: <ServiceDashboard start={start} end={end} /> }].filter((tab) => businessModes.includes(tab.key))
  return <div id="end-of-day-report" className="space-y-6">{holder}<div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="mb-1 text-xl font-semibold text-slate-900">Business dashboard</h2><p className="mb-0 text-sm text-slate-500">Choose an operating module to view its performance.</p></div><div className="flex gap-2"><Select value={period} onChange={setPeriod} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} /><DatePicker value={dayjs(anchor)} allowClear={false} format="DD MMM YYYY" onChange={(value) => value && setAnchor(value.format('YYYY-MM-DD'))} /><Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button></div></div><div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Reporting period: <strong>{new Date(`${start}T12:00:00`).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</strong> to <strong>{new Date(`${end}T12:00:00`).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</strong></div><Tabs activeKey={dashboardTab} onChange={setDashboardTab} items={tabs}/></div>
}
