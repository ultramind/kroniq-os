import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Progress,
  Select,
  Skeleton,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { exportSalesCsv } from '../features/sales/exportSalesCsv'
import { ProfitReport } from '../features/sales/ProfitReport'
import { ServiceDashboard } from '../features/services/ServiceDashboard'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { Product, Role, Sale } from '../types'

type Period = 'day' | 'week' | 'month' | 'year' | 'custom'
type ExpenseRow = { id: string; category: string; description: string; amount: number; spentAt: string }
type PaymentRow = { saleId: string; amount: number }

const paymentLabel = (method: string) => (method === 'card' ? 'Card / POS' : method.replace('_', ' '))
const businessDate = (value: string) => dayjs(value).format('YYYY-MM-DD')

function datesFor(period: Period, anchor: Dayjs, custom: [Dayjs, Dayjs] | null) {
  if (period === 'custom' && custom)
    return { start: custom[0].format('YYYY-MM-DD'), end: custom[1].format('YYYY-MM-DD') }
  if (period === 'week')
    return {
      start: anchor.startOf('week').format('YYYY-MM-DD'),
      end: anchor.endOf('week').format('YYYY-MM-DD'),
    }
  if (period === 'month')
    return {
      start: anchor.startOf('month').format('YYYY-MM-DD'),
      end: anchor.endOf('month').format('YYYY-MM-DD'),
    }
  if (period === 'year')
    return {
      start: anchor.startOf('year').format('YYYY-MM-DD'),
      end: anchor.endOf('year').format('YYYY-MM-DD'),
    }
  return { start: anchor.format('YYYY-MM-DD'), end: anchor.format('YYYY-MM-DD') }
}

function MoneyCard({ title, value, tone }: { title: string; value: number; tone?: string }) {
  return (
    <Card>
      <Statistic
        title={title}
        value={value}
        formatter={(current) => formatNaira(Number(current))}
        valueStyle={tone ? { color: tone } : undefined}
      />
    </Card>
  )
}

function ReportTable({ children }: { children: React.ReactNode }) {
  return <div className="dashboard-table-scroll">{children}</div>
}

export function ReportsPage({ sales, role }: { sales: Sale[]; role: Role }) {
  const [period, setPeriod] = useState<Period>('day')
  const [anchor, setAnchor] = useState(dayjs())
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('all')
  const [cashier, setCashier] = useState('all')
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [creditPayments, setCreditPayments] = useState<PaymentRow[]>([])
  const [orderPayments, setOrderPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const products = useLiveQuery(() => db.products.toArray(), []) ?? []
  const saleItems = useLiveQuery(() => db.saleItems.toArray(), []) ?? []
  const returns = useLiveQuery(() => db.returnActivities.toArray(), []) ?? []
  const movements = useLiveQuery(() => db.stockMovements.toArray(), []) ?? []
  const shifts = useLiveQuery(() => db.shifts.toArray(), []) ?? []
  const { start, end } = datesFor(period, anchor, customRange)

  useEffect(() => {
    void (async () => {
      if (!supabase) return setLoading(false)
      setLoading(true)
      setError(undefined)
      const [expenseResult, creditResult, orderResult] = await Promise.all([
        supabase
          .from('expenses')
          .select('id,description,amount_kobo,spent_at,expense_categories(name)')
          .gte('spent_at', start)
          .lte('spent_at', end)
          .order('spent_at', { ascending: false }),
        supabase.from('credit_payments').select('sale_id,amount_kobo'),
        supabase.from('order_payments').select('sale_id,amount_kobo'),
      ])
      const requestError = expenseResult.error ?? creditResult.error ?? orderResult.error
      if (requestError) setError(requestError.message)
      setExpenses(
        (expenseResult.data ?? []).map((row) => {
          const category = Array.isArray(row.expense_categories)
            ? row.expense_categories[0]
            : row.expense_categories
          return {
            id: row.id,
            category: (category as { name?: string } | null)?.name ?? 'Uncategorised',
            description: row.description,
            amount: row.amount_kobo / 100,
            spentAt: row.spent_at,
          }
        }),
      )
      setCreditPayments(
        (creditResult.data ?? []).map((row) => ({ saleId: row.sale_id, amount: row.amount_kobo / 100 })),
      )
      setOrderPayments(
        (orderResult.data ?? []).map((row) => ({ saleId: row.sale_id, amount: row.amount_kobo / 100 })),
      )
      setLoading(false)
    })()
  }, [end, start])

  const filteredSales = useMemo(
    () =>
      sales.filter(
        (sale) =>
          businessDate(sale.createdAt) >= start &&
          businessDate(sale.createdAt) <= end &&
          (paymentMethod === 'all' || sale.paymentMethod === paymentMethod) &&
          (cashier === 'all' || sale.cashier === cashier),
      ),
    [cashier, end, paymentMethod, sales, start],
  )
  const filteredIds = useMemo(() => new Set(filteredSales.map((sale) => sale.id)), [filteredSales])
  const returnBySale = useMemo(
    () =>
      returns.reduce<Record<string, number>>(
        (totals, item) =>
          filteredIds.has(item.saleId)
            ? { ...totals, [item.saleId]: (totals[item.saleId] ?? 0) + item.total }
            : totals,
        {},
      ),
    [filteredIds, returns],
  )
  const itemsBySale = useMemo(
    () =>
      saleItems.reduce<Record<string, typeof saleItems>>(
        (rows, item) =>
          filteredIds.has(item.saleId)
            ? { ...rows, [item.saleId]: [...(rows[item.saleId] ?? []), item] }
            : rows,
        {},
      ),
    [filteredIds, saleItems],
  )
  const costBySale = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(itemsBySale).map(([id, items]) => [
          id,
          items.reduce(
            (total, item) => total + (item.costPrice ?? 0) * (item.quantity - (item.returnedQuantity ?? 0)),
            0,
          ),
        ]),
      ),
    [itemsBySale],
  )
  const quantityBySale = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(itemsBySale).map(([id, items]) => [
          id,
          items.reduce((total, item) => total + item.quantity - (item.returnedQuantity ?? 0), 0),
        ]),
      ),
    [itemsBySale],
  )
  const recognizedSales = filteredSales.filter(
    (sale) =>
      sale.status !== 'returned' && (sale.paymentMethod !== 'order' || sale.orderStatus === 'fulfilled'),
  )
  const revenue = recognizedSales.reduce(
    (total, sale) => total + sale.total - (returnBySale[sale.id] ?? 0),
    0,
  )
  const cogs = recognizedSales.reduce((total, sale) => total + Number(costBySale[sale.id] ?? 0), 0)
  const grossProfit = revenue - cogs
  const expenseTotal = expenses.reduce((total, expense) => total + expense.amount, 0)
  const totalQuantity = Object.values(quantityBySale).reduce((total, quantity) => total + Number(quantity), 0)
  const paymentRows = useMemo(() => {
    const totals = recognizedSales.reduce<Record<string, number>>(
      (rows, sale) => ({ ...rows, [sale.paymentMethod]: (rows[sale.paymentMethod] ?? 0) + sale.total }),
      {},
    )
    return Object.entries(totals)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total)
  }, [recognizedSales])
  const creditPaid = useMemo(
    () =>
      creditPayments.reduce<Record<string, number>>(
        (rows, item) => ({ ...rows, [item.saleId]: (rows[item.saleId] ?? 0) + item.amount }),
        {},
      ),
    [creditPayments],
  )
  const orderPaid = useMemo(
    () =>
      orderPayments.reduce<Record<string, number>>(
        (rows, item) => ({ ...rows, [item.saleId]: (rows[item.saleId] ?? 0) + item.amount }),
        {},
      ),
    [orderPayments],
  )
  const creditBalance = (sale: Sale) =>
    Math.max(0, sale.total - (sale.creditInitialPayment ?? 0) - (creditPaid[sale.id] ?? 0))
  const orderBalance = (sale: Sale) =>
    Math.max(0, sale.total - (sale.creditInitialPayment ?? 0) - (orderPaid[sale.id] ?? 0))
  const credits = sales.filter(
    (sale) => sale.paymentMethod === 'credit' && sale.status !== 'returned' && creditBalance(sale) > 0,
  )
  const orders = sales.filter((sale) => sale.paymentMethod === 'order' && sale.status !== 'returned')
  const openOrders = orders.filter(
    (sale) => !['fulfilled', 'cancelled'].includes(sale.orderStatus ?? 'pending'),
  )
  const today = dayjs().format('YYYY-MM-DD')
  const activeProducts = products.filter((product) => product.active !== false)
  const lowStock = activeProducts.filter((product) => product.stock <= (product.lowStockThreshold ?? 10))
  const stockAtCost = activeProducts.reduce((total, product) => total + product.stock * product.costPrice, 0)
  const stockAtRetail = activeProducts.reduce((total, product) => total + product.stock * product.price, 0)
  const productsSold = useMemo(() => {
    const rows = new Map<string, { name: string; quantity: number; revenue: number; cost: number }>()
    Object.values(itemsBySale)
      .flat()
      .forEach((item) => {
        const current = rows.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
          revenue: 0,
          cost: 0,
        }
        const quantity = item.quantity - (item.returnedQuantity ?? 0)
        current.quantity += quantity
        current.revenue += item.unitPrice * quantity
        current.cost += (item.costPrice ?? 0) * quantity
        rows.set(item.productId, current)
      })
    return [...rows.values()]
      .map((row) => ({ ...row, profit: row.revenue - row.cost }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [itemsBySale])
  const staffRows = useMemo(() => {
    const rows = recognizedSales.reduce<
      Record<string, { sales: number; transactions: number; discounts: number; returns: number }>
    >(
      (result, sale) => ({
        ...result,
        [sale.cashier]: {
          sales: (result[sale.cashier]?.sales ?? 0) + sale.total - (returnBySale[sale.id] ?? 0),
          transactions: (result[sale.cashier]?.transactions ?? 0) + 1,
          discounts: (result[sale.cashier]?.discounts ?? 0) + (sale.discount ?? 0),
          returns: (result[sale.cashier]?.returns ?? 0) + (returnBySale[sale.id] ?? 0),
        },
      }),
      {},
    )
    return Object.entries(rows)
      .map(([name, values]) => ({ name, ...values, average: values.sales / values.transactions }))
      .sort((a, b) => b.sales - a.sales)
  }, [recognizedSales, returnBySale])
  const expenseCategories = useMemo(() => {
    const totals = expenses.reduce<Record<string, number>>(
      (rows, expense) => ({ ...rows, [expense.category]: (rows[expense.category] ?? 0) + expense.amount }),
      {},
    )
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [expenses])
  const cashVariance = shifts
    .filter(
      (shift) =>
        (shift.closedAt ? businessDate(shift.closedAt) : '') >= start &&
        (shift.closedAt ? businessDate(shift.closedAt) : '') <= end,
    )
    .reduce((total, shift) => total + (shift.variance ?? 0), 0)
  const maxPayment = Math.max(1, ...paymentRows.map((row) => row.total))
  const cashierOptions = [...new Set(sales.map((sale) => sale.cashier).filter(Boolean))].sort()

  if (role === 'cashier') return <Card>Reports are available to managers and administrators.</Card>

  const overview = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MoneyCard title="Recognised sales" value={revenue} tone="#167843" />
        <MoneyCard title="Gross profit" value={grossProfit} tone={grossProfit >= 0 ? '#167843' : '#cf1322'} />
        <MoneyCard title="Operating expenses" value={expenseTotal} tone="#b45309" />
        <MoneyCard
          title="Net operating result"
          value={grossProfit - expenseTotal}
          tone={grossProfit - expenseTotal >= 0 ? '#167843' : '#cf1322'}
        />
        <MoneyCard
          title="Average sale"
          value={recognizedSales.length ? revenue / recognizedSales.length : 0}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Sales by payment method">
          {paymentRows.length ? (
            <div className="space-y-4">
              {paymentRows.map((row) => (
                <div key={row.method}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="capitalize text-slate-500">{paymentLabel(row.method)}</span>
                    <strong>{formatNaira(row.total)}</strong>
                  </div>
                  <Progress percent={Math.round((row.total / maxPayment) * 100)} showInfo={false} />
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sales in this period" />
          )}
        </Card>
        <Card title="Period controls">
          <div className="grid grid-cols-2 gap-5 text-sm">
            <div>
              <p className="mb-1 text-slate-500">Transactions</p>
              <strong className="text-xl">{recognizedSales.length}</strong>
            </div>
            <div>
              <p className="mb-1 text-slate-500">Items sold</p>
              <strong className="text-xl">{totalQuantity}</strong>
            </div>
            <div>
              <p className="mb-1 text-slate-500">Discounts</p>
              <strong>
                {formatNaira(recognizedSales.reduce((total, sale) => total + (sale.discount ?? 0), 0))}
              </strong>
            </div>
            <div>
              <p className="mb-1 text-slate-500">Cash variance</p>
              <strong className={cashVariance < 0 ? 'text-red-600' : 'text-emerald-700'}>
                {formatNaira(cashVariance)}
              </strong>
            </div>
          </div>
        </Card>
      </div>
      <Card title="Best-selling products" className="min-w-0">
        <ReportTable>
          <Table
            rowKey="name"
            size="small"
            scroll={{ x: 680 }}
            pagination={{ pageSize: 8 }}
            dataSource={productsSold}
            columns={[
              { title: 'Product', dataIndex: 'name' },
              { title: 'Quantity', dataIndex: 'quantity', align: 'right' },
              {
                title: 'Revenue',
                dataIndex: 'revenue',
                align: 'right',
                render: (value: number) => formatNaira(value),
              },
              {
                title: 'Profit',
                dataIndex: 'profit',
                align: 'right',
                render: (value: number) => formatNaira(value),
              },
            ]}
            locale={{ emptyText: 'No product performance data in this period.' }}
          />
        </ReportTable>
      </Card>
    </div>
  )

  const salesReport = (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <ProfitReport sales={filteredSales} />
      <Card title="Sales and profit ledger" className="min-w-0">
        <ReportTable>
          <Table
            rowKey="id"
            size="small"
            scroll={{ x: 1050 }}
            pagination={{ pageSize: 12 }}
            dataSource={filteredSales.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
            columns={[
              {
                title: 'Date',
                dataIndex: 'createdAt',
                render: (value: string) => dayjs(value).format('DD MMM, h:mm A'),
              },
              { title: 'Receipt', dataIndex: 'receiptNo' },
              { title: 'Cashier', dataIndex: 'cashier' },
              { title: 'Payment', dataIndex: 'paymentMethod', render: paymentLabel },
              {
                title: 'Qty',
                align: 'right',
                render: (_: unknown, sale: Sale) => quantityBySale[sale.id] ?? 0,
              },
              {
                title: 'Revenue',
                dataIndex: 'total',
                align: 'right',
                render: (value: number) => formatNaira(value),
              },
              {
                title: 'COGS',
                align: 'right',
                render: (_: unknown, sale: Sale) => formatNaira(Number(costBySale[sale.id] ?? 0)),
              },
              {
                title: 'Profit',
                align: 'right',
                render: (_: unknown, sale: Sale) =>
                  formatNaira(
                    sale.status === 'returned'
                      ? 0
                      : sale.total - (returnBySale[sale.id] ?? 0) - Number(costBySale[sale.id] ?? 0),
                  ),
              },
            ]}
          />
        </ReportTable>
      </Card>
    </div>
  )

  const inventoryReport = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard title="Inventory at cost" value={stockAtCost} />
        <MoneyCard title="Inventory retail value" value={stockAtRetail} />
        <Card>
          <Statistic
            title="Low-stock products"
            value={lowStock.length}
            valueStyle={{ color: lowStock.length ? '#b45309' : undefined }}
          />
        </Card>
        <Card>
          <Statistic title="Active products" value={activeProducts.length} />
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Low-stock queue" className="min-w-0">
          <ReportTable>
            <Table<Product>
              rowKey="id"
              size="small"
              scroll={{ x: 620 }}
              pagination={{ pageSize: 8 }}
              dataSource={lowStock.slice().sort((a, b) => a.stock - b.stock)}
              columns={[
                { title: 'Product', dataIndex: 'name' },
                { title: 'On hand', dataIndex: 'stock', align: 'right' },
                {
                  title: 'Alert at',
                  dataIndex: 'lowStockThreshold',
                  align: 'right',
                  render: (value: number) => value ?? 10,
                },
                {
                  title: 'Stock value',
                  align: 'right',
                  render: (_: unknown, product) => formatNaira(product.stock * product.costPrice),
                },
              ]}
            />
          </ReportTable>
        </Card>
        <Card title="Recent stock movements" className="min-w-0">
          <ReportTable>
            <Table
              rowKey="id"
              size="small"
              scroll={{ x: 660 }}
              pagination={{ pageSize: 8 }}
              dataSource={movements
                .filter(
                  (item) => businessDate(item.createdAt) >= start && businessDate(item.createdAt) <= end,
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'createdAt',
                  render: (value: string) => dayjs(value).format('DD MMM, h:mm A'),
                },
                {
                  title: 'Product',
                  dataIndex: 'productId',
                  render: (id: string) =>
                    products.find((product) => product.id === id)?.name ?? 'Archived product',
                },
                {
                  title: 'Reason',
                  dataIndex: 'reason',
                  render: (value: string) => value.replaceAll('_', ' '),
                },
                {
                  title: 'Change',
                  dataIndex: 'quantityDelta',
                  align: 'right',
                  render: (value: number) => (
                    <span className={value >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {value >= 0 ? '+' : ''}
                      {value}
                    </span>
                  ),
                },
              ]}
            />
          </ReportTable>
        </Card>
      </div>
    </div>
  )

  const creditOrderReport = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard
          title="Outstanding credit"
          value={credits.reduce((total, sale) => total + creditBalance(sale), 0)}
          tone="#b45309"
        />
        <Card>
          <Statistic title="Customers owing" value={credits.length} />
        </Card>
        <MoneyCard
          title="Open order value"
          value={openOrders.reduce((total, sale) => total + sale.total, 0)}
        />
        <MoneyCard
          title="Order balances"
          value={openOrders.reduce((total, sale) => total + orderBalance(sale), 0)}
          tone="#b45309"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Credit follow-up" className="min-w-0">
          <ReportTable>
            <Table
              rowKey="id"
              size="small"
              scroll={{ x: 760 }}
              pagination={{ pageSize: 8 }}
              dataSource={credits
                .slice()
                .sort((a, b) => (a.creditDueDate ?? '9999').localeCompare(b.creditDueDate ?? '9999'))}
              columns={[
                {
                  title: 'Client',
                  dataIndex: 'creditCustomerName',
                  render: (value: string) => value || 'Not captured',
                },
                { title: 'Receipt', dataIndex: 'receiptNo' },
                {
                  title: 'Due',
                  dataIndex: 'creditDueDate',
                  render: (value?: string) => (value ? dayjs(value).format('DD MMM YYYY') : 'Not set'),
                },
                {
                  title: 'Balance',
                  align: 'right',
                  render: (_: unknown, sale: Sale) => formatNaira(creditBalance(sale)),
                },
                {
                  title: 'Status',
                  render: (_: unknown, sale: Sale) =>
                    sale.creditDueDate && sale.creditDueDate < today ? (
                      <Tag color="error">Overdue</Tag>
                    ) : (
                      <Tag color="gold">Outstanding</Tag>
                    ),
                },
              ]}
            />
          </ReportTable>
        </Card>
        <Card title="Order pipeline" className="min-w-0">
          <ReportTable>
            <Table
              rowKey="id"
              size="small"
              scroll={{ x: 760 }}
              pagination={{ pageSize: 8 }}
              dataSource={openOrders
                .slice()
                .sort((a, b) => (a.creditDueDate ?? '9999').localeCompare(b.creditDueDate ?? '9999'))}
              columns={[
                {
                  title: 'Client',
                  dataIndex: 'creditCustomerName',
                  render: (value: string) => value || 'Not captured',
                },
                {
                  title: 'Status',
                  dataIndex: 'orderStatus',
                  render: (value: string) => (
                    <Tag className="capitalize">{(value ?? 'pending').replace('_', ' ')}</Tag>
                  ),
                },
                {
                  title: 'Delivery',
                  dataIndex: 'creditDueDate',
                  render: (value?: string) => (value ? dayjs(value).format('DD MMM') : 'Not set'),
                },
                {
                  title: 'Value',
                  dataIndex: 'total',
                  align: 'right',
                  render: (value: number) => formatNaira(value),
                },
                {
                  title: 'Balance',
                  align: 'right',
                  render: (_: unknown, sale: Sale) => formatNaira(orderBalance(sale)),
                },
              ]}
            />
          </ReportTable>
        </Card>
      </div>
    </div>
  )

  const expenseReport = (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Expense summary" className="min-w-0">
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-sm text-slate-500">Total expenses</p>
            <strong className="text-xl text-amber-700">{formatNaira(expenseTotal)}</strong>
          </div>
          <div>
            <p className="mb-1 text-sm text-slate-500">Categories used</p>
            <strong className="text-xl">{expenseCategories.length}</strong>
          </div>
        </div>
        <ReportTable>
          <Table
            rowKey="category"
            size="small"
            scroll={{ x: 500 }}
            pagination={false}
            dataSource={expenseCategories}
            columns={[
              { title: 'Category', dataIndex: 'category' },
              {
                title: 'Amount',
                dataIndex: 'amount',
                align: 'right',
                render: (value: number) => formatNaira(value),
              },
            ]}
          />
        </ReportTable>
      </Card>
      <Card title="Expense register" className="min-w-0">
        <ReportTable>
          <Table
            rowKey="id"
            size="small"
            scroll={{ x: 660 }}
            pagination={{ pageSize: 8 }}
            dataSource={expenses}
            columns={[
              {
                title: 'Date',
                dataIndex: 'spentAt',
                render: (value: string) => dayjs(value).format('DD MMM YYYY'),
              },
              { title: 'Category', dataIndex: 'category' },
              { title: 'Description', dataIndex: 'description' },
              {
                title: 'Amount',
                dataIndex: 'amount',
                align: 'right',
                render: (value: number) => formatNaira(value),
              },
            ]}
          />
        </ReportTable>
      </Card>
    </div>
  )

  const staffReport = (
    <Card title="Staff sales performance" className="min-w-0">
      <ReportTable>
        <Table
          rowKey="name"
          size="small"
          scroll={{ x: 900 }}
          pagination={{ pageSize: 12 }}
          dataSource={staffRows}
          columns={[
            { title: 'Staff member', dataIndex: 'name' },
            { title: 'Transactions', dataIndex: 'transactions', align: 'right' },
            {
              title: 'Sales',
              dataIndex: 'sales',
              align: 'right',
              render: (value: number) => formatNaira(value),
            },
            {
              title: 'Average basket',
              dataIndex: 'average',
              align: 'right',
              render: (value: number) => formatNaira(value),
            },
            {
              title: 'Discounts',
              dataIndex: 'discounts',
              align: 'right',
              render: (value: number) => formatNaira(value),
            },
            {
              title: 'Returns',
              dataIndex: 'returns',
              align: 'right',
              render: (value: number) => formatNaira(value),
            },
          ]}
        />
      </ReportTable>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Business reports</h2>
          <p className="mb-0 text-sm text-slate-500">
            Sales, profit, inventory, debt, expenses, staff, and contracts in one workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
            Print report
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => exportSalesCsv(filteredSales)}>
            Export sales CSV
          </Button>
        </div>
      </div>
      <Card title="Report filters" className="report-filters">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={period}
            onChange={(value: Period) => setPeriod(value)}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
              { value: 'custom', label: 'Custom range' },
            ]}
          />
          {period === 'custom' ? (
            <DatePicker.RangePicker
              value={customRange}
              className="w-full"
              onChange={(value) => value?.[0] && value[1] && setCustomRange([value[0], value[1]])}
            />
          ) : (
            <DatePicker
              value={anchor}
              className="w-full"
              allowClear={false}
              picker={period === 'day' ? 'date' : period}
              onChange={(value) => value && setAnchor(value)}
            />
          )}
          <Select
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={[
              { value: 'all', label: 'All payment methods' },
              ...['cash', 'card', 'transfer', 'credit', 'order'].map((value) => ({
                value,
                label: paymentLabel(value),
              })),
            ]}
          />
          <Select
            value={cashier}
            onChange={setCashier}
            options={[
              { value: 'all', label: 'All staff' },
              ...cashierOptions.map((value) => ({ value, label: value })),
            ]}
          />
        </div>
      </Card>
      {error && (
        <Alert type="warning" showIcon message={`Some online report data could not load: ${error}`} />
      )}
      {loading ? (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      ) : (
        <Tabs
          defaultActiveKey="overview"
          items={[
            { key: 'overview', label: 'Overview', children: overview },
            { key: 'sales', label: 'Sales & profit', children: salesReport },
            { key: 'inventory', label: 'Inventory', children: inventoryReport },
            { key: 'credit-orders', label: 'Credit & orders', children: creditOrderReport },
            { key: 'expenses', label: 'Expenses', children: expenseReport },
            { key: 'staff', label: 'Staff & shifts', children: staffReport },
            {
              key: 'services',
              label: 'Service contracts',
              children: <ServiceDashboard start={start} end={end} />,
            },
          ]}
        />
      )}
    </div>
  )
}
