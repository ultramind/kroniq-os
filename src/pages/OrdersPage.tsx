import { MoreOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Dropdown,
  Input,
  Modal,
  Select,
  Statistic,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CreditPaymentModal } from '../features/sales/CreditPaymentModal'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { CreditPayment, Sale } from '../types'
import { CurrencyInput } from '../components/CurrencyInput'
import { syncOutbox } from '../sync'
import { db } from '../db'
import type { CartItem } from '../types'

const statuses = ['pending', 'in_progress', 'ready', 'fulfilled', 'cancelled'] as const
const statusColors: Record<(typeof statuses)[number], string> = {
  pending: 'gold',
  in_progress: 'blue',
  ready: 'cyan',
  fulfilled: 'success',
  cancelled: 'error',
}

type OrderStockItem = {
  id: string
  productId: string
  productName: string
  quantity: number
  unitsPerPackage: number
  availableStock: number
  defaultCost: number
}
type OrderRefund = { id: string; saleId: string; amount: number; refundedAt: string; staffName?: string }
export function OrdersPage({
  sales,
  onRefreshSales,
  onViewReceipt,
}: {
  sales: Sale[]
  onRefreshSales: () => void
  onViewReceipt: (sale: Sale) => void
}) {
  const [payments, setPayments] = useState<CreditPayment[]>([])
  const [refunds, setRefunds] = useState<OrderRefund[]>([])
  const [selected, setSelected] = useState<Sale>()
  const [historyOrder, setHistoryOrder] = useState<Sale>()
  const [editing, setEditing] = useState<Sale>()
  const [notes, setNotes] = useState('')
  const [fulfilmentCost, setFulfilmentCost] = useState<number | null>(null)
  const [status, setStatus] = useState<string>('pending')
  const [deductFromStock, setDeductFromStock] = useState(false)
  const [orderStockItems, setOrderStockItems] = useState<OrderStockItem[]>([])
  const [loadingOrderStock, setLoadingOrderStock] = useState(false)
  const [refundAmount, setRefundAmount] = useState<number | null>(null)
  const [refundDate, setRefundDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dueFilter, setDueFilter] = useState<string>('all')
  const [savingPayment, setSavingPayment] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [api, holder] = message.useMessage()
  const load = async () => {
    if (!supabase) return
    const [{ data: paymentRows }, { data: refundRows, error: refundError }] = await Promise.all([
      supabase
        .from('order_payments')
        .select('id,sale_id,amount_kobo,paid_at,created_at,profiles(full_name)')
        .order('paid_at', { ascending: false }),
      supabase
        .from('order_refunds')
        .select('id,sale_id,amount_kobo,refunded_at,profiles(full_name)')
        .order('refunded_at', { ascending: false }),
    ])
    if (refundError) {
      // The table is introduced by the order-cancellation migration.
      setRefunds([])
    } else {
      setRefunds(
        (refundRows ?? []).map((refund) => ({
          id: refund.id,
          saleId: refund.sale_id,
          amount: refund.amount_kobo / 100,
          refundedAt: refund.refunded_at,
          staffName: (
            (Array.isArray(refund.profiles) ? refund.profiles[0] : refund.profiles) as {
              full_name?: string
            } | null
          )?.full_name,
        })),
      )
    }
    setPayments(
      (paymentRows ?? []).map((p) => ({
        id: p.id,
        saleId: p.sale_id,
        amount: p.amount_kobo / 100,
        paidAt: p.paid_at,
        createdAt: p.created_at,
        staffName: ((Array.isArray(p.profiles) ? p.profiles[0] : p.profiles) as { full_name?: string } | null)
          ?.full_name,
      })),
    )
  }
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    if (!editing || !supabase) {
      setOrderStockItems([])
      setLoadingOrderStock(false)
      return
    }
    const client = supabase
    let cancelled = false
    const loadOrderStock = async () => {
      setLoadingOrderStock(true)
      const { data, error } = await client
        .from('sale_items')
        .select(
          'id,product_id,quantity,units_per_package,package_name,cost_price_kobo,products(name,stock_quantity)',
        )
        .eq('sale_id', editing.id)
      if (cancelled) return
      setLoadingOrderStock(false)
      if (error) {
        api.error(`Could not load current stock: ${error.message}`)
        return
      }
      const items = (data ?? []).map((item) => {
        const product = (Array.isArray(item.products) ? item.products[0] : item.products) as {
          name?: string
          stock_quantity?: number
        } | null
        return {
          id: item.id,
          productId: item.product_id,
          productName: product?.name ?? item.package_name ?? 'Product',
          quantity: item.quantity,
          unitsPerPackage: item.units_per_package ?? 1,
          availableStock: product?.stock_quantity ?? 0,
          defaultCost: (item.cost_price_kobo ?? 0) / 100,
        }
      })
      setOrderStockItems(items)
      // Start with the saved catalogue cost, or reconstruct it for a legacy
      // order. Managers can still replace this with the true sourcing cost.
      setFulfilmentCost(
        (current) =>
          current ??
          items.reduce((sum, item) => sum + item.defaultCost * item.quantity * item.unitsPerPackage, 0),
      )
    }
    void loadOrderStock()
    return () => {
      cancelled = true
    }
  }, [api, editing])
  const orders = sales
    .filter((sale) => sale.paymentMethod === 'order' && sale.status !== 'returned')
    .sort((first, second) => dayjs(second.createdAt).valueOf() - dayjs(first.createdAt).valueOf())
  const today = dayjs().format('YYYY-MM-DD')
  const filteredOrders = orders.filter((order) => {
    const due = order.creditDueDate
    return (
      (statusFilter === 'all' || (order.orderStatus ?? 'pending') === statusFilter) &&
      (dueFilter === 'all' ||
        (dueFilter === 'overdue' && !!due && due < today) ||
        (dueFilter === 'due' && due === today) ||
        (dueFilter === 'upcoming' && !!due && due > today))
    )
  })
  const paid = useMemo(
    () =>
      payments.reduce<Record<string, number>>(
        (sum, p) => ({ ...sum, [p.saleId]: (sum[p.saleId] ?? 0) + p.amount }),
        {},
      ),
    [payments],
  )
  const balance = (sale: Sale) =>
    Math.max(0, sale.total - (sale.creditInitialPayment ?? 0) - (paid[sale.id] ?? 0))
  const refundTotal = (sale: Sale) =>
    refunds.filter((refund) => refund.saleId === sale.id).reduce((sum, refund) => sum + refund.amount, 0)
  const paidTotal = (sale: Sale) => sale.total - balance(sale)
  const refundableAmount = (sale: Sale) => Math.max(0, paidTotal(sale) - refundTotal(sale))
  const ensureOrderSynced = async (sale: Sale) => {
    if (!supabase) return false
    const { data, error } = await supabase.from('sales').select('id').eq('id', sale.id).maybeSingle()
    if (error) {
      api.error(error.message)
      return false
    }
    if (!data) {
      const items = await db.saleItems.where('saleId').equals(sale.id).toArray()
      if (!items.length) {
        api.error('This local order has no line items and cannot be recovered.')
        return false
      }
      const existingEvent = (await db.outbox.toArray()).some((event) => {
        const payload = event.payload as { sale?: Sale }
        return event.entity === 'sale' && payload.sale?.id === sale.id
      })
      if (!existingEvent) {
        const cart: CartItem[] = items.map((item) => ({
          id: item.productId,
          name: item.productName,
          sku: '',
          category: '',
          stock: 0,
          price: item.unitPrice,
          costPrice: item.costPrice ?? 0,
          quantity: item.quantity,
          listPrice: item.listPrice,
          priceOverrideReason: item.priceOverrideReason,
          packagingId: item.packagingId,
          packageName: item.packageName,
          unitsPerPackage: item.unitsPerPackage,
        }))
        await db.outbox.add({
          entity: 'sale',
          action: 'create',
          payload: { sale: { ...sale, synced: false }, items: cart },
          createdAt: sale.createdAt,
        })
        await db.sales.update(sale.id, { synced: false })
      }
    }
    const result = await syncOutbox()
    if (result.error) {
      api.error(`This order could not sync: ${result.error}`)
      return false
    }
    return true
  }
  const recordPayment = async (value: { amount: number; paidAt: string }) => {
    if (!selected || !supabase) return
    setSavingPayment(true)
    try {
      if (!(await ensureOrderSynced(selected))) return
      const { error } = await supabase.rpc('record_order_payment', {
        p_sale_id: selected.id,
        p_amount_kobo: Math.round(value.amount * 100),
        p_paid_at: value.paidAt,
      })
      if (error) {
        api.error(error.message)
        return
      }
      setSelected(undefined)
      await load()
      onRefreshSales()
      api.success('Order payment recorded.')
    } finally {
      setSavingPayment(false)
    }
  }
  const saveStatus = async () => {
    if (!editing || !supabase) return
    setSavingOrder(true)
    try {
      if (!(await ensureOrderSynced(editing))) return
      const derivedCatalogueCost = orderStockItems.reduce(
        (sum, item) => sum + item.defaultCost * item.quantity * item.unitsPerPackage,
        0,
      )
      const { error } = await supabase.rpc('update_order_management', {
        p_sale_id: editing.id,
        p_status: status,
        p_notes: notes,
        p_order_cost_kobo: Math.round((fulfilmentCost ?? derivedCatalogueCost) * 100),
        p_deduct_stock: status === 'fulfilled' && deductFromStock,
      })
      if (error) return api.error(error.message)
      if (status === 'cancelled' && refundAmount && refundAmount > 0) {
        const { error: refundError } = await supabase.rpc('record_order_refund', {
          p_sale_id: editing.id,
          p_amount_kobo: Math.round(refundAmount * 100),
          p_refunded_at: refundDate,
        })
        if (refundError) return api.error(refundError.message)
      }
      setEditing(undefined)
      setRefundAmount(null)
      await onRefreshSales()
      await load()
      api.success(
        status === 'cancelled' && refundAmount ? 'Order cancelled and refund recorded.' : 'Order updated.',
      )
    } finally {
      setSavingOrder(false)
    }
  }
  return (
    <div className="space-y-6">
      {holder}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Statistic
            title="Open orders"
            value={
              orders.filter((o) => !['fulfilled', 'cancelled'].includes(o.orderStatus ?? 'pending')).length
            }
          />
        </Card>
        <Card>
          <Statistic
            title="Outstanding balance"
            value={orders.reduce((s, o) => s + balance(o), 0)}
            formatter={(v) => formatNaira(Number(v))}
          />
        </Card>
        <Card>
          <Statistic
            title="Order value"
            value={orders.reduce((s, o) => s + o.total, 0)}
            formatter={(v) => formatNaira(Number(v))}
          />
        </Card>
        <Card>
          <Statistic
            title="Fulfilled revenue"
            value={orders.filter((o) => o.orderStatus === 'fulfilled').reduce((sum, o) => sum + o.total, 0)}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
      </div>
      <Card title="Customer orders" extra="Orders do not deduct stock">
        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All statuses' },
              ...statuses.map((value) => ({ value, label: value.replace('_', ' ') })),
            ]}
            className="min-w-40"
          />
          <Select
            value={dueFilter}
            onChange={setDueFilter}
            options={[
              { value: 'all', label: 'All due dates' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'due', label: 'Due today' },
              { value: 'upcoming', label: 'Upcoming' },
            ]}
            className="min-w-36"
          />
        </div>
        <Table
          rowKey="id"
          scroll={{ x: 1320 }}
          dataSource={filteredOrders}
          columns={[
            {
              title: 'Actions',
              align: 'center',
              width: 84,
              fixed: 'left',
              render: (_, o: Sale) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'payment',
                        label: 'Add payment',
                        disabled:
                          !balance(o) || ['fulfilled', 'cancelled'].includes(o.orderStatus ?? 'pending'),
                      },
                      { key: 'history', label: 'Payment history' },
                      { key: 'print', label: 'Print receipt' },
                      { type: 'divider' },
                      {
                        key: 'manage',
                        label: 'Manage order',
                        disabled: ['fulfilled', 'cancelled'].includes(o.orderStatus ?? 'pending'),
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'payment') setSelected(o)
                      if (key === 'history') setHistoryOrder(o)
                      if (key === 'print') onViewReceipt(o)
                      if (key === 'manage') {
                        setEditing(o)
                        setStatus(o.orderStatus ?? 'pending')
                        setNotes(o.orderNotes ?? '')
                        setFulfilmentCost(o.orderCost ?? null)
                        setDeductFromStock(false)
                        setRefundAmount(null)
                        setRefundDate(dayjs().format('YYYY-MM-DD'))
                      }
                    },
                  }}
                >
                  <Button
                    type="text"
                    shape="circle"
                    aria-label={`Actions for order ${o.receiptNo}`}
                    icon={<MoreOutlined />}
                  />
                </Dropdown>
              ),
            },
            { title: 'Client', dataIndex: 'creditCustomerName' },
            { title: 'Phone', dataIndex: 'creditCustomerPhone' },
            { title: 'Total', render: (_, o: Sale) => formatNaira(o.total) },
            { title: 'Paid', render: (_, o: Sale) => formatNaira(o.total - balance(o)) },
            { title: 'Balance', render: (_, o: Sale) => formatNaira(balance(o)) },
            {
              title: 'Fulfilment cost',
              render: (_, o: Sale) => (o.orderCost == null ? '—' : formatNaira(o.orderCost)),
            },
            {
              title: 'Actual profit',
              render: (_, o: Sale) =>
                o.orderStatus === 'fulfilled' && o.orderCost != null
                  ? formatNaira(o.total - o.orderCost)
                  : '—',
            },
            {
              title: 'Due date',
              render: (_, o: Sale) =>
                o.creditDueDate ? (
                  <span>
                    {o.creditDueDate < today ? 'Overdue · ' : o.creditDueDate === today ? 'Due today · ' : ''}
                    {dayjs(o.creditDueDate).format('DD MMM YYYY')}
                  </span>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Status',
              render: (_, o: Sale) => (
                <Tag color={statusColors[o.orderStatus ?? 'pending']}>
                  {(o.orderStatus ?? 'pending').replace('_', ' ')}
                </Tag>
              ),
            },
          ]}
        />
      </Card>
      <CreditPaymentModal
        open={!!selected}
        maxAmount={selected ? balance(selected) : 0}
        saving={savingPayment}
        onClose={() => setSelected(undefined)}
        onSave={recordPayment}
      />
      <Modal
        open={!!historyOrder}
        title="Order payment history"
        footer={
          <Button type="primary" onClick={() => historyOrder && onViewReceipt(historyOrder)}>
            Print order receipt
          </Button>
        }
        onCancel={() => setHistoryOrder(undefined)}
        width={720}
        className="wide-modal"
      >
        {historyOrder ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="block text-slate-500">Total</span>
                {formatNaira(historyOrder.total)}
              </div>
              <div>
                <span className="block text-slate-500">Amount paid</span>
                {formatNaira(historyOrder.total - balance(historyOrder))}
              </div>
              <div>
                <span className="block text-slate-500">Balance</span>
                {formatNaira(balance(historyOrder))}
              </div>
            </div>
            <Table
              size="small"
              rowKey="id"
              scroll={{ x: 580 }}
              pagination={false}
              dataSource={[
                ...(historyOrder.creditInitialPayment
                  ? [
                      {
                        id: 'initial',
                        paidAt: historyOrder.createdAt,
                        amount: historyOrder.creditInitialPayment,
                        staffName: historyOrder.cashier,
                      },
                    ]
                  : []),
                ...payments.filter((payment) => payment.saleId === historyOrder.id),
                ...refunds
                  .filter((refund) => refund.saleId === historyOrder.id)
                  .map((refund) => ({
                    id: `refund-${refund.id}`,
                    paidAt: refund.refundedAt,
                    amount: -refund.amount,
                    staffName: refund.staffName,
                  })),
              ]}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'paidAt',
                  render: (value: string) => dayjs(value).format('DD MMM YYYY'),
                },
                {
                  title: 'Amount',
                  dataIndex: 'amount',
                  render: (value: number) =>
                    value < 0 ? (
                      <span className="text-red-600">Refund · {formatNaira(Math.abs(value))}</span>
                    ) : (
                      formatNaira(value)
                    ),
                },
                { title: 'Recorded by', dataIndex: 'staffName', render: (value: string) => value || '—' },
              ]}
            />
          </>
        ) : null}
      </Modal>
      <Modal
        open={!!editing}
        title="Manage order"
        onCancel={() => setEditing(undefined)}
        onOk={() => void saveStatus()}
        confirmLoading={savingOrder}
        cancelButtonProps={{ disabled: savingOrder }}
      >
        <label>Status</label>
        <Select
          className="mb-4 mt-1 w-full"
          value={status}
          onChange={(value) => {
            setStatus(value)
            if (value !== 'fulfilled') setDeductFromStock(false)
          }}
          options={statuses.map((value) => ({ value, label: value.replace('_', ' ') }))}
        />
        {status === 'fulfilled' ? (
          <Alert
            className="mb-3 [&_.ant-alert-description]:mt-1 [&_.ant-alert-message]:mb-0"
            type="warning"
            showIcon
            message="Fulfil from current stock?"
            description={
              <div className="space-y-1.5">
                <p className="m-0 text-xs">Choose Yes only when this order should use current shop stock.</p>
                {loadingOrderStock ? (
                  <span className="text-xs">Checking current stock…</span>
                ) : (
                  <div className="space-y-0.5 text-xs">
                    {orderStockItems.map((item) => {
                      const required = item.quantity * item.unitsPerPackage
                      const enough = item.availableStock >= required
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">{item.productName}</span>
                          <span className={enough ? 'whitespace-nowrap' : 'whitespace-nowrap text-red-600'}>
                            {item.availableStock} in stock · needs {required}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 pt-1">
                  <span className="text-xs font-medium">Deduct from current stock</span>
                  <Switch
                    checked={deductFromStock}
                    disabled={
                      loadingOrderStock ||
                      !orderStockItems.length ||
                      orderStockItems.some(
                        (item) => item.availableStock < item.quantity * item.unitsPerPackage,
                      )
                    }
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                    onChange={setDeductFromStock}
                  />
                </div>
                {!loadingOrderStock &&
                orderStockItems.some((item) => item.availableStock < item.quantity * item.unitsPerPackage) ? (
                  <p className="m-0 text-xs text-red-600">
                    One or more items do not have enough stock, so deduction is unavailable.
                  </p>
                ) : null}
              </div>
            }
          />
        ) : null}
        {status === 'cancelled' && editing ? (
          <Alert
            className="mb-3 [&_.ant-alert-description]:mt-1 [&_.ant-alert-message]:mb-0"
            type="warning"
            showIcon
            message="Cancel order and optionally record a refund"
            description={
              <div className="space-y-2">
                <p className="m-0 text-xs">
                  Paid {formatNaira(paidTotal(editing))} · refunded {formatNaira(refundTotal(editing))} ·
                  available: <strong>{formatNaira(refundableAmount(editing))}</strong>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <CurrencyInput
                    min={0}
                    max={refundableAmount(editing)}
                    precision={2}
                    placeholder="Refund amount"
                    className="w-full"
                    value={refundAmount ?? undefined}
                    onChange={(value) => setRefundAmount(value ?? null)}
                  />
                  <DatePicker
                    className="w-full"
                    allowClear={false}
                    value={dayjs(refundDate)}
                    onChange={(value) => value && setRefundDate(value.format('YYYY-MM-DD'))}
                  />
                </div>
              </div>
            }
          />
        ) : null}
        <label>Delivery / pickup notes</label>
        <Input.TextArea className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        <label className="mt-4 block">Actual fulfilment cost</label>
        <p className="mb-1 text-xs text-slate-500">
          Optional. Use the final cost incurred to make or source this order.
        </p>
        <CurrencyInput
          min={0}
          precision={2}
          className="w-full"
          value={fulfilmentCost ?? undefined}
          onChange={(value) => setFulfilmentCost(value ?? null)}
        />
        {editing && fulfilmentCost != null ? (
          <p className="mt-2 text-sm font-medium">
            Expected profit: {formatNaira(editing.total - fulfilmentCost)}
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
