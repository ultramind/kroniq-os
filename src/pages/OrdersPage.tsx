import { MoreOutlined } from '@ant-design/icons'
import { Button, Card, Dropdown, Input, Modal, Select, Statistic, Table, Tag, message } from 'antd'
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
  const [selected, setSelected] = useState<Sale>()
  const [historyOrder, setHistoryOrder] = useState<Sale>()
  const [editing, setEditing] = useState<Sale>()
  const [notes, setNotes] = useState('')
  const [fulfilmentCost, setFulfilmentCost] = useState<number | null>(null)
  const [status, setStatus] = useState<string>('pending')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dueFilter, setDueFilter] = useState<string>('all')
  const [savingPayment, setSavingPayment] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [api, holder] = message.useMessage()
  const load = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('order_payments')
      .select('id,sale_id,amount_kobo,paid_at,created_at,profiles(full_name)')
      .order('paid_at', { ascending: false })
    setPayments(
      (data ?? []).map((p) => ({
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
  const orders = sales.filter((sale) => sale.paymentMethod === 'order' && sale.status !== 'returned')
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
      const { error } = await supabase.rpc('update_order_management', {
        p_sale_id: editing.id,
        p_status: status,
        p_notes: notes,
        p_order_cost_kobo: fulfilmentCost == null ? null : Math.round(fulfilmentCost * 100),
      })
      if (error) return api.error(error.message)
      setEditing(undefined)
      await onRefreshSales()
      api.success('Order updated.')
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
            {
              title: 'Actions',
              align: 'center',
              width: 84,
              render: (_, o: Sale) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'payment', label: 'Add payment', disabled: !balance(o) },
                      { key: 'history', label: 'Payment history' },
                      { key: 'print', label: 'Print receipt' },
                      { type: 'divider' },
                      { key: 'manage', label: 'Manage order' },
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
              ]}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'paidAt',
                  render: (value: string) => dayjs(value).format('DD MMM YYYY'),
                },
                { title: 'Amount', dataIndex: 'amount', render: (value: number) => formatNaira(value) },
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
          onChange={setStatus}
          options={statuses.map((value) => ({ value, label: value.replace('_', ' ') }))}
        />
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
