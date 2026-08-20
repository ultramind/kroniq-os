import {
  ClearOutlined,
  DeleteOutlined,
  MinusOutlined,
  MonitorOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Tooltip,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import { CurrencyInput } from '../../components/CurrencyInput'
import { supabase } from '../../supabase'
import type { CartItem, PaymentMethod, Role } from '../../types'

const { Text } = Typography

const methods: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card / POS' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'order', label: 'Order' },
  { id: 'credit', label: 'Credit' },
]

type Creditor = { key: string; name: string; phone: string }

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
  onCheckout: (credit?: {
    customerName: string
    customerPhone: string
    dueDate?: string
    initialPayment?: number
  }) => void
  onHistoricalCheckout?: (
    credit:
      { customerName: string; customerPhone: string; dueDate?: string; initialPayment?: number } | undefined,
    saleDate: string,
    deductStock: boolean,
  ) => void
  historicalSaving?: boolean
  checkoutSaving?: boolean
  onHold: () => void
  onClearCart: () => void
  onOpenCustomerDisplay: () => void
  orderOnly?: boolean
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
  checkoutSaving = false,
  onHold,
  onClearCart,
  onOpenCustomerDisplay,
  orderOnly = false,
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
  const [clientForm] = Form.useForm()
  const [creditors, setCreditors] = useState<Creditor[]>([])
  const [selectedCreditorKey, setSelectedCreditorKey] = useState<string | undefined>()
  const [loadingCreditors, setLoadingCreditors] = useState(false)
  const [saleDate, setSaleDate] = useState(() => dayjs().format('YYYY-MM-DD'))
  const [deductStock, setDeductStock] = useState(false)
  const today = dayjs().format('YYYY-MM-DD')
  const isHistorical = dayjs(saleDate).isBefore(dayjs(), 'day')
  const canRecordHistorical = role === 'admin' || role === 'manager'
  const change = cashReceived === null ? null : Math.max(0, cashReceived - total)
  const cashIsInsufficient = paymentMethod === 'cash' && (cashReceived === null || cashReceived < total)
  const needsClientDetails = paymentMethod === 'credit' || paymentMethod === 'order'
  const availableMethods = orderOnly ? methods.filter((method) => method.id === 'order') : methods
  const creditDetailsMissing =
    needsClientDetails && (!creditCustomerName.trim() || !creditCustomerPhone.trim())

  function resetCreditDetails() {
    setCreditCustomerName('')
    setCreditCustomerPhone('')
    setCreditDueDate('')
    setCreditInitialPayment(null)
    setSelectedCreditorKey(undefined)
    setCreditError('')
    clientForm.resetFields()
  }

  function clearCreditDetails() {
    resetCreditDetails()
    setCreditModalOpen(false)
  }

  useEffect(() => {
    if (paymentMethod === 'cash' && !cashEntryManual) setCashReceived(total)
    if (paymentMethod !== 'cash') setCashReceived(null)
  }, [paymentMethod, total, cashEntryManual])

  useEffect(() => {
    if (cart.length !== 0) return
    setCashReceived(null)
    setCashEntryManual(false)
    clearCreditDetails()
    setSaleDate(today)
    setDeductStock(false)
  }, [cart.length])

  useEffect(() => {
    if (!creditModalOpen) return

    clientForm.setFieldsValue({
      customerName: creditCustomerName,
      customerPhone: creditCustomerPhone,
      initialPayment: creditInitialPayment,
      dueDate: creditDueDate ? dayjs(creditDueDate) : undefined,
    })

    void (async () => {
      setLoadingCreditors(true)
      try {
        const localSales = await db.sales.toArray()
        const known: Creditor[] = localSales
          .filter(
            (sale) =>
              ['credit', 'order'].includes(sale.paymentMethod) &&
              sale.creditCustomerName &&
              sale.creditCustomerPhone,
          )
          .map((sale) => ({
            key: `credit:${sale.creditCustomerName!.trim().toLowerCase()}|${sale.creditCustomerPhone!.trim()}`,
            name: sale.creditCustomerName!.trim(),
            phone: sale.creditCustomerPhone!.trim(),
          }))

        if (supabase && navigator.onLine) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          const { data: profile } = user
            ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
            : { data: null }
          if (profile?.store_id) {
            const { data: customers } = await supabase
              .from('customers')
              .select('full_name,phone')
              .eq('store_id', profile.store_id)
              .not('phone', 'is', null)
              .order('full_name')
            known.push(
              ...(customers ?? [])
                .filter((customer) => customer.full_name && customer.phone)
                .map((customer) => ({
                  key: `customer:${customer.full_name.trim().toLowerCase()}|${customer.phone.trim()}`,
                  name: customer.full_name.trim(),
                  phone: customer.phone.trim(),
                })),
            )
          }
        }

        const unique = new Map<string, Creditor>()
        known.forEach((creditor) => unique.set(`${creditor.name.toLowerCase()}|${creditor.phone}`, creditor))
        setCreditors([...unique.values()].sort((a, b) => a.name.localeCompare(b.name)))
      } finally {
        setLoadingCreditors(false)
      }
    })()
  }, [clientForm, creditModalOpen])

  function selectPaymentMethod(method: PaymentMethod) {
    onMethodChange(method)
    if (method === 'cash') {
      setCashEntryManual(false)
      setCashReceived(total)
    }
    if (method === 'credit' || method === 'order') {
      setCreditError('')
      setCreditModalOpen(true)
    }
  }

  async function confirmCreditDetails() {
    if (!creditCustomerName.trim() || !creditCustomerPhone.trim()) {
      setCreditError(`Client name and phone number are required for ${paymentMethod} records.`)
      return
    }
    try {
      await clientForm.validateFields()
      setCreditError('')
      setCreditModalOpen(false)
    } catch {
      // Ant Design renders the field-level validation messages.
    }
  }

  return (
    <Card
      className="shadow-sm"
      title={
        <Space>
          <ShoppingCartOutlined />
          Current sale{' '}
          <Text type="secondary">({cart.reduce((count, item) => count + item.quantity, 0)} items)</Text>
        </Space>
      }
      extra={
        <Space size={8}>
          <Tooltip title="Open customer display">
            <Button
              aria-label="Open customer display"
              className="!h-10 !w-10 !text-base"
              icon={<MonitorOutlined />}
              onClick={onOpenCustomerDisplay}
            />
          </Tooltip>
          <Button danger className="!h-10 !px-4 !text-sm" disabled={!cart.length} onClick={onHold}>
            Hold sale
          </Button>
          <Tooltip title="Clear cart">
            <Button
              danger
              aria-label="Clear current cart"
              className="!h-10 !w-10 !text-base"
              disabled={!cart.length}
              icon={<DeleteOutlined />}
              onClick={onClearCart}
            />
          </Tooltip>
        </Space>
      }
      bodyStyle={{ padding: 20 }}
    >
      {cart.length === 0 ? (
        <Empty className="my-16" description="Add products to begin a sale." />
      ) : (
        <div className="max-h-[360px] overflow-y-auto">
          {cart.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-slate-100 py-4"
            >
              <div>
                <Text strong>{item.name}</Text>
                <br />
                {isHistorical && paymentMethod !== 'order' ? (
                  <div className="mt-2">
                    <Text type="secondary" className="mb-1 block text-xs">
                      Unit price
                    </Text>
                    <CurrencyInput
                      aria-label={`Unit price for ${item.name}`}
                      min={0}
                      precision={2}
                      size="middle"
                      className="historical-unit-price"
                      value={item.price}
                      onChange={(value) =>
                        onUnitPriceChange(item.id, typeof value === 'number' ? value : item.price)
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <Text type="secondary" className="text-xs">
                      {formatNaira(item.price)} each
                    </Text>
                    {item.listPrice !== undefined && item.listPrice !== item.price && (
                      <Text className="ml-2 text-xs text-amber-700">
                        Agreed from {formatNaira(item.listPrice)}
                      </Text>
                    )}
                  </div>
                )}
              </div>
              <Space.Compact>
                <Button
                  size="middle"
                  className="touch-target"
                  icon={<MinusOutlined />}
                  onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                />
                <Button size="middle" className="touch-target" disabled>
                  {item.quantity}
                </Button>
                <Button
                  size="middle"
                  className="touch-target"
                  icon={<PlusOutlined />}
                  disabled={item.quantity >= item.stock}
                  onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                />
              </Space.Compact>
              <Text strong>{formatNaira(item.price * item.quantity)}</Text>
            </div>
          ))}
        </div>
      )}

      <div className="my-5 flex items-end justify-between">
        <Text strong>Total</Text>
        <Statistic
          value={total}
          formatter={(value) => formatNaira(Number(value))}
          valueStyle={{ fontSize: 26, color: '#172316' }}
        />
      </div>

      {canRecordHistorical && (
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sale-date">
            {paymentMethod === 'order' ? 'Order date' : 'Sale date'}
          </label>
          <DatePicker
            id="sale-date"
            value={dayjs(saleDate)}
            format="DD MMM YYYY"
            allowClear={false}
            className="w-full"
            disabledDate={(date) => date.isAfter(dayjs(), 'day')}
            onChange={(selectedDay) => {
              const selectedDate = selectedDay?.format('YYYY-MM-DD') ?? today
              setSaleDate(selectedDate)
              if (!selectedDay || !selectedDay.isBefore(dayjs(), 'day')) setDeductStock(false)
            }}
          />
          {isHistorical && (
            <>
              <Alert
                className="historical-sale-notice mt-2"
                type="warning"
                showIcon
                message={
                  <span>
                    <strong>
                      {paymentMethod === 'order'
                        ? 'Backdated order'
                        : deductStock
                          ? 'Stock correction enabled'
                          : 'Historical sale'}
                    </strong>
                    <span className="historical-sale-notice-copy">
                      {paymentMethod === 'order'
                        ? ' Records the order on the selected date; stock remains unchanged.'
                        : deductStock
                          ? ' Reduces current stock; excluded from today’s cash shift.'
                          : ' Reports on the selected date only; current stock stays unchanged.'}
                    </span>
                  </span>
                }
              />
              {paymentMethod !== 'order' ? (
                <Checkbox
                  className="mt-2"
                  checked={deductStock}
                  onChange={(event) => setDeductStock(event.target.checked)}
                >
                  Deduct items from current stock
                </Checkbox>
              ) : null}
            </>
          )}
        </div>
      )}

      {role !== 'cashier' && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <Text>Manager discount (%)</Text>
          <InputNumber
            min={0}
            max={100}
            value={discountPercent}
            onChange={(value) => onDiscountChange(Number(value ?? 0))}
          />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        {availableMethods.map((method) => (
          <Button
            key={method.id}
            size="large"
            danger={method.id === 'credit'}
            className={`touch-target text-base active:scale-[0.98] ${method.id === 'credit' && paymentMethod === method.id ? '!bg-red-600 !text-white hover:!bg-red-500' : ''} ${method.id === 'order' && paymentMethod === method.id ? '!border-amber-500 !bg-amber-500 !text-white hover:!bg-amber-400' : ''}`}
            type={paymentMethod === method.id ? 'primary' : 'default'}
            onClick={() => selectPaymentMethod(method.id)}
          >
            {method.label}
          </Button>
        ))}
      </div>

      {paymentMethod === 'cash' && (
        <div className="cash-received-section mb-4 rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-sm font-medium" htmlFor="cash-received">
              Cash received
            </label>
            <Button
              size="small"
              type={!cashEntryManual ? 'primary' : 'default'}
              onClick={() => {
                setCashEntryManual(false)
                setCashReceived(total)
              }}
            >
              Exact · {formatNaira(total)}
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {[500, 1000, 2000, 5000, 10000].map((amount) => (
              <Button
                key={amount}
                size="small"
                onClick={() => {
                  setCashEntryManual(true)
                  setCashReceived(amount)
                }}
              >
                ₦{amount.toLocaleString('en-NG')}
              </Button>
            ))}
          </div>
          <CurrencyInput
            id="cash-received"
            min={0}
            precision={2}
            value={cashReceived}
            onChange={(value) => {
              setCashEntryManual(true)
              setCashReceived(typeof value === 'number' ? value : null)
            }}
            placeholder="Enter another amount"
            size="large"
            className="w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <Text type={cashIsInsufficient ? 'danger' : 'secondary'}>
              {cashReceived !== null && cashReceived < total
                ? `Add ${formatNaira(total - cashReceived)} more`
                : 'Change due'}
            </Text>
            <Text strong className="text-base">
              {change === null ? '—' : formatNaira(change)}
            </Text>
          </div>
        </div>
      )}

      {paymentMethod === 'credit' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div>
            <Text strong className="text-red-800">
              Customer credit
            </Text>
            <Text className="block text-xs text-red-700">
              {creditCustomerName
                ? `${creditCustomerName} · outstanding ${formatNaira(total - (creditInitialPayment ?? 0))}`
                : 'Customer details required'}
            </Text>
          </div>
          <Button danger size="small" onClick={() => setCreditModalOpen(true)}>
            Edit details
          </Button>
        </div>
      )}
      {paymentMethod === 'order' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div>
            <Text strong className="text-amber-900">
              Customer order
            </Text>
            <Text className="block text-xs text-amber-800">
              {creditCustomerName
                ? `${creditCustomerName} · deposit ${formatNaira(creditInitialPayment ?? 0)} · stock will not be reduced`
                : 'Client details required · stock will not be reduced'}
            </Text>
          </div>
          <Button size="small" onClick={() => setCreditModalOpen(true)}>
            Edit details
          </Button>
        </div>
      )}

      <Button
        type="primary"
        size="large"
        block
        loading={historicalSaving || checkoutSaving}
        className="touch-checkout touch-target whitespace-normal !border-[#15803d] !bg-[#15803d] px-2 text-base font-bold leading-tight hover:!border-[#166534] hover:!bg-[#166534] active:scale-[0.98]"
        disabled={
          !cart.length ||
          cashIsInsufficient ||
          creditDetailsMissing ||
          checkoutSaving ||
          (isHistorical && !onHistoricalCheckout)
        }
        onClick={() => {
          if (needsClientDetails && creditDetailsMissing) {
            setCreditError(`Client name and phone number are required for ${paymentMethod} records.`)
            setCreditModalOpen(true)
            return
          }
          const credit = needsClientDetails
            ? {
                customerName: creditCustomerName.trim(),
                customerPhone: creditCustomerPhone.trim(),
                dueDate: creditDueDate || undefined,
                initialPayment: creditInitialPayment ?? 0,
              }
            : undefined
          if (isHistorical) onHistoricalCheckout?.(credit, saleDate, deductStock)
          else onCheckout(credit)
          if (needsClientDetails) clearCreditDetails()
        }}
      >
        {isHistorical
          ? `${paymentMethod === 'order' ? 'Record backdated order' : deductStock ? 'Record and deduct stock' : 'Record historical sale'} · ${formatNaira(total)}`
          : `${paymentMethod === 'order' ? 'Record order' : 'Complete sale'} · ${formatNaira(total)}`}
      </Button>
      {children && <div className="mt-5">{children}</div>}
      <Modal
        open={creditModalOpen}
        title={paymentMethod === 'order' ? 'Customer order details' : 'Customer credit details'}
        footer={
          <Space>
            <Button onClick={clearCreditDetails}>Cancel</Button>
            <Button icon={<ClearOutlined />} onClick={resetCreditDetails}>
              Clear
            </Button>
            <Button type="primary" onClick={() => void confirmCreditDetails()}>
              {paymentMethod === 'order' ? 'Use order details' : 'Use credit details'}
            </Button>
          </Space>
        }
        onCancel={clearCreditDetails}
        destroyOnClose={false}
        width={460}
      >
        <Form form={clientForm} layout="vertical" className="pt-1">
          <div className="space-y-3">
            {creditError && <Alert type="error" showIcon message={creditError} />}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Existing client <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Select
                showSearch
                allowClear
                value={selectedCreditorKey}
                loading={loadingCreditors}
                optionFilterProp="label"
                placeholder="Search previous creditor or client"
                size="large"
                className="w-full"
                options={creditors.map((creditor) => ({
                  value: creditor.key,
                  label: `${creditor.name} · ${creditor.phone}`,
                }))}
                onChange={(value) => {
                  setSelectedCreditorKey(value)
                  const creditor = creditors.find((item) => item.key === value)
                  if (creditor) {
                    setCreditCustomerName(creditor.name)
                    setCreditCustomerPhone(creditor.phone)
                    clientForm.setFieldsValue({ customerName: creditor.name, customerPhone: creditor.phone })
                    setCreditError('')
                  }
                }}
              />
            </div>
            <div className="border-t border-slate-200 pt-3">
              <Text type="secondary" className="mb-2 block text-xs">
                Or add a new creditor
              </Text>
              <div className="space-y-3">
                <Form.Item
                  name="customerName"
                  label="Customer full name"
                  rules={[{ required: true, whitespace: true, message: 'Enter the client name.' }]}
                  className="mb-0"
                >
                  <Input
                    value={creditCustomerName}
                    onChange={(event) => setCreditCustomerName(event.target.value)}
                    placeholder="Customer full name"
                    size="large"
                  />
                </Form.Item>
                <Form.Item
                  name="customerPhone"
                  label="Phone number"
                  rules={[
                    { required: true, whitespace: true, message: 'Enter the client phone number.' },
                    { min: 7, message: 'Enter a valid phone number.' },
                  ]}
                  className="mb-0"
                >
                  <Input
                    value={creditCustomerPhone}
                    onChange={(event) => setCreditCustomerPhone(event.target.value)}
                    placeholder="Phone number"
                    inputMode="tel"
                    size="large"
                  />
                </Form.Item>
              </div>
            </div>
            <Form.Item
              name="initialPayment"
              label={
                <>
                  Initial payment <span className="font-normal text-slate-400">(optional)</span>
                </>
              }
              rules={[
                {
                  validator: (_, value) =>
                    value == null || (Number(value) >= 0 && Number(value) <= total)
                      ? Promise.resolve()
                      : Promise.reject(new Error('Initial payment cannot exceed the order total.')),
                },
              ]}
              className="mb-0"
            >
              <CurrencyInput
                value={creditInitialPayment}
                onChange={(value) => setCreditInitialPayment(typeof value === 'number' ? value : null)}
                min={0}
                max={total}
                precision={2}
                placeholder="₦0.00"
                size="large"
                className="w-full"
              />
            </Form.Item>
            <Form.Item
              name="dueDate"
              label={
                <>
                  {paymentMethod === 'order' ? 'Expected delivery date' : 'Expected payment date'}{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </>
              }
              className="mb-0"
            >
              <DatePicker
                value={creditDueDate ? dayjs(creditDueDate) : null}
                onChange={(value) => setCreditDueDate(value?.format('YYYY-MM-DD') ?? '')}
                format="DD MMM YYYY"
                size="large"
                className="w-full"
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Card>
  )
}
