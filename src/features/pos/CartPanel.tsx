import { MinusOutlined, MonitorOutlined, PlusOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Checkbox, DatePicker, Empty, Input, InputNumber, Modal, Space, Statistic, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import type { CartItem, PaymentMethod, Role } from '../../types'

const { Text } = Typography

const methods: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card / POS' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'credit', label: 'Credit' },
]

type Props = {
  cart: CartItem[]
  total: number
  role: Role
  discountPercent: number
  onDiscountChange: (value: number) => void
  paymentMethod: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  onQuantityChange: (id: string, quantity: number) => void
  onUnitPriceChange: (id: string, price: number) => void
  onCheckout: (credit?: { customerName: string; customerPhone: string; dueDate?: string; initialPayment?: number }) => void
  onHistoricalCheckout?: (credit: { customerName: string; customerPhone: string; dueDate?: string; initialPayment?: number } | undefined, saleDate: string, deductStock: boolean) => void
  historicalSaving?: boolean
  onHold: () => void
  onOpenCustomerDisplay: () => void
  children?: React.ReactNode
}

export function CartPanel({
  cart,
  total,
  role,
  discountPercent,
  onDiscountChange,
  paymentMethod,
  onMethodChange,
  onQuantityChange,
  onUnitPriceChange,
  onCheckout,
  onHistoricalCheckout,
  historicalSaving = false,
  onHold,
  onOpenCustomerDisplay,
  children,
}: Props) {
  const [cashReceived, setCashReceived] = useState<number | null>(null)
  const [cashEntryManual, setCashEntryManual] = useState(false)
  const [creditCustomerName, setCreditCustomerName] = useState('')
  const [creditCustomerPhone, setCreditCustomerPhone] = useState('')
  const [creditDueDate, setCreditDueDate] = useState('')
  const [creditInitialPayment, setCreditInitialPayment] = useState<number | null>(null)
  const [creditModalOpen, setCreditModalOpen] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10))
  const [deductStock, setDeductStock] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const isHistorical = saleDate < today
  const canRecordHistorical = role === 'admin' || role === 'manager'
  const change = cashReceived === null ? null : Math.max(0, cashReceived - total)
  const cashIsInsufficient = paymentMethod === 'cash' && (cashReceived === null || cashReceived < total)
  const creditDetailsMissing = paymentMethod === 'credit' && (!creditCustomerName.trim() || !creditCustomerPhone.trim())

  useEffect(() => {
    if (paymentMethod === 'cash' && !cashEntryManual) setCashReceived(total)
    if (paymentMethod !== 'cash') setCashReceived(null)
  }, [paymentMethod, total, cashEntryManual])

  useEffect(() => {
    if (cart.length !== 0) return
    setCashReceived(null)
    setCashEntryManual(false)
    setCreditCustomerName('')
    setCreditCustomerPhone('')
    setCreditDueDate('')
    setCreditInitialPayment(null)
    setCreditError('')
    setCreditModalOpen(false)
    setSaleDate(today)
    setDeductStock(false)
  }, [cart.length])

  function selectPaymentMethod(method: PaymentMethod) {
    onMethodChange(method)
    if (method === 'cash') { setCashEntryManual(false); setCashReceived(total) }
    if (method === 'credit') { setCreditError(''); setCreditModalOpen(true) }
  }

  function confirmCreditDetails() {
    if (!creditCustomerName.trim() || !creditCustomerPhone.trim()) { setCreditError('Customer name and phone number are required for credit sales.'); return }
    setCreditError('')
    setCreditModalOpen(false)
  }

  return (
    <Card
      className="shadow-sm"
      title={<Space><ShoppingCartOutlined />Current sale <Text type="secondary">({cart.reduce((count, item) => count + item.quantity, 0)} items)</Text></Space>}
      extra={<Space size={8}><Tooltip title="Open customer display"><Button aria-label="Open customer display" className="!h-10 !w-10 !text-base" icon={<MonitorOutlined />} onClick={onOpenCustomerDisplay} /></Tooltip><Button danger className="!h-10 !px-4 !text-sm" disabled={!cart.length} onClick={onHold}>Hold sale</Button></Space>}
      bodyStyle={{ padding: 20 }}
    >
      {cart.length === 0 ? (
        <Empty className="my-16" description="Add products to begin a sale." />
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {cart.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-slate-100 py-4">
              <div><Text strong>{item.name}</Text><br />{isHistorical ? <div className="mt-2"><Text type="secondary" className="mb-1 block text-xs">Unit price</Text><InputNumber aria-label={`Unit price for ${item.name}`} min={0} precision={2} prefix="₦" size="middle" className="historical-unit-price" value={item.price} onChange={(value) => onUnitPriceChange(item.id, typeof value === 'number' ? value : item.price)} /></div> : <Text type="secondary" className="text-xs">{formatNaira(item.price)} each</Text>}</div>
              <Space.Compact>
                <Button size="middle" className="touch-target" icon={<MinusOutlined />} onClick={() => onQuantityChange(item.id, item.quantity - 1)} />
                <Button size="middle" className="touch-target" disabled>{item.quantity}</Button>
                <Button size="middle" className="touch-target" icon={<PlusOutlined />} disabled={item.quantity >= item.stock} onClick={() => onQuantityChange(item.id, item.quantity + 1)} />
              </Space.Compact>
              <Text strong>{formatNaira(item.price * item.quantity)}</Text>
            </div>
          ))}
        </div>
      )}

      <div className="my-5 flex items-end justify-between"><Text strong>Total</Text><Statistic value={total} formatter={(value) => formatNaira(Number(value))} valueStyle={{ fontSize: 26, color: '#172316' }} /></div>

      {canRecordHistorical && <div className="mb-4"><label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sale-date">Sale date</label><DatePicker id="sale-date" value={dayjs(saleDate)} format="DD MMM YYYY" allowClear={false} className="w-full" disabledDate={(date) => date.isAfter(dayjs(), 'day')} onChange={(_, value) => { const selectedDate = value || today; setSaleDate(selectedDate); if (selectedDate >= today) setDeductStock(false) }} />{isHistorical && <><Alert className="historical-sale-notice mt-2" type="warning" showIcon message={<span><strong>{deductStock ? 'Stock correction enabled' : 'Historical sale'}</strong><span className="historical-sale-notice-copy">{deductStock ? ' Reduces current stock; excluded from today’s cash shift.' : ' Reports on the selected date only; current stock stays unchanged.'}</span></span>} /><Checkbox className="mt-2" checked={deductStock} onChange={(event) => setDeductStock(event.target.checked)}>Deduct items from current stock</Checkbox></>}</div>}

      {role !== 'cashier' && <div className="mb-4 flex items-center justify-between gap-3"><Text>Manager discount (%)</Text><InputNumber min={0} max={100} value={discountPercent} onChange={(value) => onDiscountChange(Number(value ?? 0))} /></div>}

      <div className="mb-4 grid grid-cols-2 gap-3">
        {methods.map((method) => <Button key={method.id} size="large" danger={method.id === 'credit'} className={`touch-target text-base active:scale-[0.98] ${method.id === 'credit' && paymentMethod === method.id ? '!bg-red-600 !text-white hover:!bg-red-500' : ''}`} type={paymentMethod === method.id ? 'primary' : 'default'} onClick={() => selectPaymentMethod(method.id)}>{method.label}</Button>)}
      </div>

      {paymentMethod === 'cash' && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3"><label className="block text-sm font-medium text-slate-700" htmlFor="cash-received">Cash received</label><Button size="small" type={!cashEntryManual ? 'primary' : 'default'} onClick={() => { setCashEntryManual(false); setCashReceived(total) }}>Exact · {formatNaira(total)}</Button></div>
          <div className="mb-3 flex flex-wrap gap-2">
            {[500, 1000, 2000, 5000, 10000].map((amount) => <Button key={amount} size="small" onClick={() => { setCashEntryManual(true); setCashReceived(amount) }}>₦{amount.toLocaleString('en-NG')}</Button>)}
          </div>
          <InputNumber id="cash-received" min={0} precision={2} prefix="₦" value={cashReceived} onChange={(value) => { setCashEntryManual(true); setCashReceived(typeof value === 'number' ? value : null) }} placeholder="Enter another amount" size="large" className="w-full" />
          <div className="mt-2 flex items-center justify-between">
            <Text type={cashIsInsufficient ? 'danger' : 'secondary'}>{cashReceived !== null && cashReceived < total ? `Add ${formatNaira(total - cashReceived)} more` : 'Change due'}</Text>
            <Text strong className="text-base">{change === null ? '—' : formatNaira(change)}</Text>
          </div>
        </div>
      )}

      {paymentMethod === 'credit' && <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2"><div><Text strong className="text-red-800">Customer credit</Text><Text className="block text-xs text-red-700">{creditCustomerName ? `${creditCustomerName} · outstanding ${formatNaira(total - (creditInitialPayment ?? 0))}` : 'Customer details required'}</Text></div><Button danger size="small" onClick={() => setCreditModalOpen(true)}>Edit details</Button></div>}

      <Button type="primary" size="large" block loading={historicalSaving} className="touch-checkout touch-target whitespace-normal px-2 text-base font-bold leading-tight active:scale-[0.98]" disabled={!cart.length || cashIsInsufficient || creditDetailsMissing || (isHistorical && !onHistoricalCheckout)} onClick={() => { const credit = paymentMethod === 'credit' ? { customerName: creditCustomerName.trim(), customerPhone: creditCustomerPhone.trim(), dueDate: creditDueDate || undefined, initialPayment: creditInitialPayment ?? 0 } : undefined; if (isHistorical) onHistoricalCheckout?.(credit, saleDate, deductStock); else onCheckout(credit) }}>{isHistorical ? `${deductStock ? 'Record and deduct stock' : 'Record historical sale'} · ${formatNaira(total)}` : `Complete sale · ${formatNaira(total)}`}</Button>
      {children && <div className="mt-5">{children}</div>}
      <Modal open={creditModalOpen} title="Customer credit details" okText="Use credit details" onOk={confirmCreditDetails} onCancel={() => { setCreditModalOpen(false); if (!creditCustomerName.trim() || !creditCustomerPhone.trim()) onMethodChange('cash') }} destroyOnClose={false}>
        <div className="space-y-4 pt-2">{creditError && <Alert type="error" showIcon message={creditError} />}<div><label className="mb-1 block text-sm font-medium text-slate-700">Customer full name</label><Input value={creditCustomerName} onChange={(event) => setCreditCustomerName(event.target.value)} placeholder="Customer full name" size="large" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Phone number</label><Input value={creditCustomerPhone} onChange={(event) => setCreditCustomerPhone(event.target.value)} placeholder="Phone number" inputMode="tel" size="large" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Initial payment <span className="font-normal text-slate-400">(optional)</span></label><InputNumber value={creditInitialPayment} onChange={(value) => setCreditInitialPayment(typeof value === 'number' ? value : null)} min={0} max={total} precision={2} prefix="₦" placeholder="₦0.00" size="large" className="w-full" /></div><div><label className="mb-1 block text-sm font-medium text-slate-700">Expected payment date <span className="font-normal text-slate-400">(optional)</span></label><DatePicker value={creditDueDate ? dayjs(creditDueDate) : null} onChange={(value) => setCreditDueDate(value?.format('YYYY-MM-DD') ?? '')} format="DD MMM YYYY" size="large" className="w-full" /></div></div>
      </Modal>
    </Card>
  )
}
