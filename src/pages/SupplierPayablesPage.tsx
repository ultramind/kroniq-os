import { MoreOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Dropdown, Form, Modal, Statistic, Table, Tag, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { CurrencyInput } from '../components/CurrencyInput'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'

type Payable = {
  id: string
  supplier: string
  total: number
  deposit: number
  dueDate?: string
  reference?: string
  receivedAt: string
  createdAt: string
  lines: Array<{ productName: string; sku?: string; quantity: number; unitCost: number }>
}
type Payment = { id: string; batchId: string; amount: number; paidAt: string }

export function SupplierPayablesPage() {
  const [bills, setBills] = useState<Payable[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [selected, setSelected] = useState<Payable>()
  const [historyBill, setHistoryBill] = useState<Payable>()
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ amount: number; paidAt: Dayjs }>()
  const [api, holder] = message.useMessage()
  const load = async () => {
    if (!supabase) return
    const [{ data: batchRows, error }, { data: paymentRows }] = await Promise.all([
      supabase
        .from('supplier_delivery_batches')
        .select(
          'id,total_kobo,amount_paid_kobo,due_date,reference_no,received_at,created_at,suppliers(name),supplier_deliveries(quantity,unit_cost_kobo,products(name,sku))',
        )
        .order('received_at', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('supplier_delivery_payments')
        .select('id,batch_id,amount_kobo,paid_at')
        .order('paid_at', { ascending: false }),
    ])
    if (error) return api.error(error.message)
    setBills(
      (batchRows ?? []).map((row) => {
        const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
        const deliveryLines = Array.isArray(row.supplier_deliveries) ? row.supplier_deliveries : []
        return {
          id: row.id,
          supplier: supplier?.name ?? 'Supplier',
          total: row.total_kobo / 100,
          deposit: row.amount_paid_kobo / 100,
          dueDate: row.due_date ?? undefined,
          reference: row.reference_no ?? undefined,
          receivedAt: row.received_at,
          createdAt: row.created_at,
          lines: deliveryLines.map((line) => {
            const product = Array.isArray(line.products) ? line.products[0] : line.products
            return {
              productName: product?.name ?? 'Product',
              sku: product?.sku ?? undefined,
              quantity: Number(line.quantity ?? 0),
              unitCost: Number(line.unit_cost_kobo ?? 0) / 100,
            }
          }),
        }
      }),
    )
    setPayments(
      (paymentRows ?? []).map((row) => ({
        id: row.id,
        batchId: row.batch_id,
        amount: row.amount_kobo / 100,
        paidAt: row.paid_at,
      })),
    )
  }
  useEffect(() => {
    void load()
  }, [])
  const paid = (bill: Payable) =>
    bill.deposit + payments.filter((p) => p.batchId === bill.id).reduce((sum, p) => sum + p.amount, 0)
  const balance = (bill: Payable) => Math.max(0, bill.total - paid(bill))
  const outstanding = useMemo(() => bills.reduce((sum, bill) => sum + balance(bill), 0), [bills, payments])
  const save = async ({ amount, paidAt }: { amount: number; paidAt: Dayjs }) => {
    if (!supabase || !selected) return
    setSaving(true)
    const { error } = await supabase.rpc('record_supplier_delivery_payment', {
      p_batch_id: selected.id,
      p_amount_kobo: Math.round(amount * 100),
      p_paid_at: paidAt.format('YYYY-MM-DD'),
    })
    setSaving(false)
    if (error) return api.error(error.message)
    setSelected(undefined)
    form.resetFields()
    await load()
    api.success('Supplier payment recorded.')
  }
  const printBill = (bill: Payable) => {
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (character) =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character,
      )
    const rows = payments.filter((payment) => payment.batchId === bill.id)
    const productRows = bill.lines.length
      ? bill.lines
          .map(
            (line) =>
              `<tr><td><strong>${escape(line.productName)}</strong>${line.sku ? `<br><small>${escape(line.sku)}</small>` : ''}</td><td class="right">${line.quantity}</td><td class="right">${formatNaira(line.unitCost)}</td><td class="right">${formatNaira(line.quantity * line.unitCost)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4">No individual products were recorded for this delivery.</td></tr>'
    const paymentRows =
      [...(bill.deposit ? [{ paidAt: bill.receivedAt, amount: bill.deposit }] : []), ...rows]
        .map(
          (payment) =>
            `<tr><td>${dayjs(payment.paidAt).format('DD MMM YYYY')}</td><td>₦${payment.amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td></tr>`,
        )
        .join('') || '<tr><td colspan="2">No payments recorded</td></tr>'
    const page = window.open('', '_blank', 'width=720,height=800')
    if (!page) return
    page.document.write(
      `<!doctype html><title>Supplier bill</title><style>body{font-family:Arial,sans-serif;padding:36px;color:#0B1121;max-width:760px;margin:auto}h1{margin:0;font-size:25px}h2{margin:30px 0 0;font-size:15px}p{color:#64748b;margin:7px 0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}.right{text-align:right}.summary{margin-top:22px}.summary td{font-weight:700}.balance{font-size:17px}.total{margin-top:24px;font-size:13px}small{color:#64748b}@media print{body{padding:0}}</style><h1>${escape(bill.supplier)}</h1><p>Supplier delivery receipt · Received ${dayjs(bill.receivedAt).format('DD MMM YYYY')} · Recorded ${dayjs(bill.createdAt).format('h:mm A')}</p><h2>Delivered products</h2><table><tr><th>Product</th><th class="right">Qty</th><th class="right">Cost</th><th class="right">Amount</th></tr>${productRows}</table><table class="summary"><tr><th>Total bill</th><th>Paid</th><th class="balance">Balance</th></tr><tr><td>${formatNaira(bill.total)}</td><td>${formatNaira(paid(bill))}</td><td class="balance">${formatNaira(balance(bill))}</td></tr></table><h2>Payment history</h2><table><tr><th>Date</th><th class="right">Amount</th></tr>${paymentRows}</table><p class="total">Reference: ${escape(bill.reference ?? '—')}</p><script>window.onload=()=>window.print()</script>`,
    )
    page.document.close()
  }
  return (
    <div className="space-y-6">
      {holder}
      <div>
        <h2 className="mb-1 text-xl font-semibold">Supplier debts</h2>
        <p className="mb-0 text-sm text-slate-500">
          Track stock deliveries the company has not fully paid for.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Statistic
            title="Outstanding supplier debt"
            value={outstanding}
            formatter={(v) => formatNaira(Number(v))}
          />
        </Card>
        <Card>
          <Statistic title="Open supplier bills" value={bills.filter((b) => balance(b) > 0).length} />
        </Card>
        <Card>
          <Statistic
            title="Overdue"
            value={
              bills.filter((b) => balance(b) > 0 && b.dueDate && b.dueDate < dayjs().format('YYYY-MM-DD'))
                .length
            }
          />
        </Card>
      </div>
      <Card title="Supplier bills">
        <Table
          rowKey="id"
          scroll={{ x: 900 }}
          dataSource={bills}
          columns={[
            {
              title: 'Actions',
              fixed: 'left',
              width: 76,
              align: 'center',
              render: (_, b: Payable) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'history', label: 'Payment history' },
                      { key: 'print', label: 'Print supplier bill' },
                      { type: 'divider' },
                      { key: 'pay', label: 'Add payment', disabled: !balance(b) },
                    ],
                    onClick: ({ key }) => {
                      if (key === 'history') setHistoryBill(b)
                      if (key === 'print') printBill(b)
                      if (key === 'pay') {
                        setSelected(b)
                        form.setFieldsValue({ paidAt: dayjs() })
                      }
                    },
                  }}
                >
                  <Button
                    type="text"
                    shape="circle"
                    icon={<MoreOutlined />}
                    aria-label={`Actions for ${b.supplier}`}
                  />
                </Dropdown>
              ),
            },
            { title: 'Supplier', dataIndex: 'supplier' },
            {
              title: 'Received',
              dataIndex: 'receivedAt',
              render: (_, b: Payable) => (
                <div className="whitespace-nowrap">
                  <div>{dayjs(b.receivedAt).format('DD MMM YYYY')}</div>
                  <div className="text-xs text-slate-500">Recorded {dayjs(b.createdAt).format('h:mm A')}</div>
                </div>
              ),
            },
            { title: 'Total', render: (_, b: Payable) => formatNaira(b.total) },
            { title: 'Paid', render: (_, b: Payable) => formatNaira(paid(b)) },
            { title: 'Balance', render: (_, b: Payable) => formatNaira(balance(b)) },
            {
              title: 'Due date',
              render: (_, b: Payable) => (b.dueDate ? dayjs(b.dueDate).format('DD MMM YYYY') : '—'),
            },
            {
              title: 'Status',
              render: (_, b: Payable) =>
                balance(b) === 0 ? (
                  <Tag color="success">Paid</Tag>
                ) : b.dueDate && b.dueDate < dayjs().format('YYYY-MM-DD') ? (
                  <Tag color="error">Overdue</Tag>
                ) : (
                  <Tag color="warning">Outstanding</Tag>
                ),
            },
          ]}
        />
      </Card>
      <Modal
        open={!!selected}
        title="Record supplier payment"
        okText="Save payment"
        confirmLoading={saving}
        onCancel={() => setSelected(undefined)}
        onOk={() => void form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <p className="text-sm">
            Balance: <strong>{selected ? formatNaira(balance(selected)) : '—'}</strong>
          </p>
          <Form.Item name="amount" label="Amount paid" rules={[{ required: true }]}>
            <CurrencyInput min={0} max={selected ? balance(selected) : 0} className="w-full" />
          </Form.Item>
          <Form.Item name="paidAt" label="Payment date" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!historyBill}
        title="Supplier payment history"
        footer={null}
        onCancel={() => setHistoryBill(undefined)}
      >
        {historyBill && (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="block text-slate-500">Total</span>
                {formatNaira(historyBill.total)}
              </div>
              <div>
                <span className="block text-slate-500">Paid</span>
                {formatNaira(paid(historyBill))}
              </div>
              <div>
                <span className="block text-slate-500">Balance</span>
                {formatNaira(balance(historyBill))}
              </div>
            </div>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={[
                ...(historyBill.deposit
                  ? [{ id: 'deposit', paidAt: historyBill.receivedAt, amount: historyBill.deposit }]
                  : []),
                ...payments.filter((payment) => payment.batchId === historyBill.id),
              ]}
              columns={[
                { title: 'Date', dataIndex: 'paidAt', render: (value) => dayjs(value).format('DD MMM YYYY') },
                { title: 'Amount', dataIndex: 'amount', render: (value) => formatNaira(value) },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
