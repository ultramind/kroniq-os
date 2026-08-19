import {
  Button,
  Card,
  DatePicker,
  Input,
  message,
  Modal,
  Progress,
  Select,
  Statistic,
  Table,
  Tag,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { CreditPaymentModal } from '../features/sales/CreditPaymentModal'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { CreditPayment, Sale } from '../types'

export function CreditsPage({ sales, onRefreshSales }: { sales: Sale[]; onRefreshSales: () => void }) {
  const [payments, setPayments] = useState<CreditPayment[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale>()
  const [historySale, setHistorySale] = useState<Sale>()
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | 'overdue' | 'paid'>('all')
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month'>('all')
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null)
  const [messageApi, contextHolder] = message.useMessage()
  const loadPayments = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('credit_payments')
      .select('id, sale_id, amount_kobo, paid_at, created_at')
      .order('paid_at', { ascending: false })
    setPayments(
      (data ?? []).map((payment) => ({
        id: payment.id,
        saleId: payment.sale_id,
        amount: payment.amount_kobo / 100,
        paidAt: payment.paid_at,
        createdAt: payment.created_at,
      })),
    )
  }
  useEffect(() => {
    void loadPayments()
  }, [])
  const creditSales = sales.filter((sale) => sale.paymentMethod === 'credit' && sale.status !== 'returned')
  const paidBySale = useMemo(
    () =>
      payments.reduce<Record<string, number>>(
        (totals, payment) => ({
          ...totals,
          [payment.saleId]: (totals[payment.saleId] ?? 0) + payment.amount,
        }),
        {},
      ),
    [payments],
  )
  const balance = (sale: Sale) =>
    Math.max(0, sale.total - (sale.creditInitialPayment ?? 0) - (paidBySale[sale.id] ?? 0))
  const today = new Date().toISOString().slice(0, 10)

  function changePeriod(value: 'all' | 'day' | 'week' | 'month') {
    setPeriod(value)
    setSelectedDate(null)
  }
  const filteredCreditSales = creditSales
    .filter((sale) => {
      const haystack =
        `${sale.creditCustomerName ?? ''} ${sale.creditCustomerPhone ?? ''} ${sale.receiptNo}`.toLowerCase()
      const overdue = Boolean(sale.creditDueDate && sale.creditDueDate < today)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' && balance(sale) === 0) ||
        (statusFilter === 'overdue' && balance(sale) > 0 && overdue) ||
        (statusFilter === 'outstanding' && balance(sale) > 0 && !overdue)
      const created = dayjs(sale.createdAt)
      const matchesDate = selectedDate
        ? created.isSame(selectedDate, 'day')
        : period === 'day'
          ? created.isSame(dayjs(), 'day')
          : period === 'week'
            ? created.isSame(dayjs(), 'week')
            : period === 'month'
              ? created.isSame(dayjs(), 'month')
              : true
      return haystack.includes(search.trim().toLowerCase()) && matchesStatus && matchesDate
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const outstanding = filteredCreditSales.filter((sale) => balance(sale) > 0)
  const outstandingTotal = outstanding.reduce((sum, sale) => sum + balance(sale), 0)
  const paidTotal = filteredCreditSales.reduce((sum, sale) => sum + sale.total - balance(sale), 0)
  async function recordPayment(values: { amount: number; paidAt: string }) {
    if (!selectedSale || !supabase) return
    if (values.amount > balance(selectedSale)) {
      messageApi.error('Payment cannot be more than the remaining balance.')
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('record_credit_payment', {
      p_sale_id: selectedSale.id,
      p_amount_kobo: Math.round(values.amount * 100),
      p_paid_at: values.paidAt,
    })
    setSaving(false)
    if (error) {
      messageApi.error(error.message)
      return
    }
    setSelectedSale(undefined)
    await loadPayments()
    onRefreshSales()
    messageApi.success('Credit payment recorded.')
  }
  const columns = [
    {
      title: 'Customer',
      dataIndex: 'creditCustomerName',
      key: 'customer',
      render: (value: string | undefined) => value ?? 'Not captured',
    },
    {
      title: 'Phone',
      dataIndex: 'creditCustomerPhone',
      key: 'phone',
      render: (value: string | undefined) => value ?? '—',
    },
    {
      title: 'Receipt no.',
      dataIndex: 'receiptNo',
      key: 'receiptNo',
      render: (value: string) => <span className="font-medium">{value}</span>,
    },
    { title: 'Total', dataIndex: 'total', key: 'total', render: (value: number) => formatNaira(value) },
    {
      title: 'Paid',
      key: 'paid',
      render: (_: unknown, sale: Sale) => formatNaira(sale.total - balance(sale)),
    },
    {
      title: 'Balance',
      key: 'balance',
      render: (_: unknown, sale: Sale) => (
        <strong className={balance(sale) ? 'text-red-600' : 'text-emerald-700'}>
          {formatNaira(balance(sale))}
        </strong>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      render: (_: unknown, sale: Sale) => (
        <Progress percent={Math.round(((sale.total - balance(sale)) / sale.total) * 100)} size="small" />
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, sale: Sale) =>
        balance(sale) === 0 ? (
          <Tag color="success">Paid</Tag>
        ) : sale.creditDueDate && sale.creditDueDate < today ? (
          <Tag color="error">Overdue</Tag>
        ) : (
          <Tag color="gold">Outstanding</Tag>
        ),
    },
    {
      title: '',
      key: 'action',
      render: (_: unknown, sale: Sale) => (
        <div className="flex gap-1">
          <Button type="link" size="small" onClick={() => setHistorySale(sale)}>
            History
          </Button>
          {balance(sale) > 0 && (
            <Button type="link" size="small" onClick={() => setSelectedSale(sale)}>
              Add payment
            </Button>
          )}
        </div>
      ),
    },
  ]
  const history = payments
    .filter((payment) => payment.saleId === historySale?.id)
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
  return (
    <div className="space-y-6">
      {contextHolder}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Statistic
            title="Outstanding credit"
            value={outstandingTotal}
            formatter={(value) => formatNaira(Number(value))}
            valueStyle={{ color: '#b45309' }}
          />
        </Card>
        <Card>
          <Statistic
            title="Credit collected"
            value={paidTotal}
            formatter={(value) => formatNaira(Number(value))}
            valueStyle={{ color: '#167843' }}
          />
        </Card>
        <Card>
          <Statistic title="Customers owing" value={outstanding.length} />
        </Card>
      </div>
      <Card title="Customer credit register" extra="Record and track instalment payments">
        <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_180px_250px_auto]">
          <Input.Search
            allowClear
            size="large"
            className="credit-search"
            enterButton={<Button type="primary" icon={<SearchOutlined />} aria-label="Search credits" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, phone, or receipt"
          />
          <Select
            value={statusFilter}
            size="large"
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'outstanding', label: 'Outstanding' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
          <Select
            value={period}
            size="large"
            onChange={changePeriod}
            options={[
              { value: 'all', label: 'All dates' },
              { value: 'day', label: 'Today' },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
            ]}
          />
          <DatePicker
            value={selectedDate}
            size="large"
            onChange={(value) => {
              setSelectedDate(value)
              setPeriod('all')
            }}
            className="w-full"
          />
          <Button
            size="large"
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              changePeriod('all')
            }}
          >
            Clear filters
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredCreditSales}
          pagination={{ pageSize: 12 }}
          scroll={{ x: 1120 }}
          locale={{ emptyText: 'No customer credit recorded yet.' }}
        />
      </Card>
      <CreditPaymentModal
        open={Boolean(selectedSale)}
        maxAmount={selectedSale ? balance(selectedSale) : 0}
        saving={saving}
        onClose={() => setSelectedSale(undefined)}
        onSave={recordPayment}
      />
      <Modal
        open={Boolean(historySale)}
        title={`Payment history · ${historySale?.creditCustomerName ?? ''}`}
        footer={
          <div className="flex justify-between">
            <Button onClick={() => window.print()}>Print history</Button>
            <Button type="primary" onClick={() => setHistorySale(undefined)}>
              Close
            </Button>
          </div>
        }
        onCancel={() => setHistorySale(undefined)}
      >
        <div id="credit-payment-history">
          <p>
            <strong>{historySale?.receiptNo}</strong> · Total {historySale && formatNaira(historySale.total)}
          </p>
          {historySale && (historySale.creditInitialPayment ?? 0) > 0 && (
            <p>Initial payment: {formatNaira(historySale.creditInitialPayment ?? 0)}</p>
          )}
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Date',
                dataIndex: 'paidAt',
                render: (value: string) =>
                  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-NG'),
              },
              { title: 'Amount', dataIndex: 'amount', render: (value: number) => formatNaira(value) },
            ]}
            dataSource={history}
            locale={{ emptyText: 'No instalment payments recorded yet.' }}
          />
        </div>
      </Modal>
    </div>
  )
}
