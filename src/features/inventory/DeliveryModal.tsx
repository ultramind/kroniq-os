import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Steps,
  Switch,
  message,
} from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { CurrencyInput } from '../../components/CurrencyInput'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'
import type { InventoryLocation, Product } from '../../types'

type Line = {
  productId: string
  quantity: number
  unitCost: number
  sellingPrice?: number
  updateSellingPrice?: boolean
}
type Values = {
  supplierId?: string
  supplierName: string
  supplierPhone?: string
  lines: Line[]
  receivedAt: string
  locationId: string
  amountPaid: number
  dueDate?: string
  referenceNo?: string
  notes?: string
}
type FormValues = Omit<Values, 'receivedAt' | 'dueDate'> & { receivedAt: Dayjs; dueDate?: Dayjs }
type Supplier = { id: string; name: string; phone?: string | null }

export function DeliveryModal({
  open,
  products,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  products: Product[]
  saving: boolean
  onClose: () => void
  onSave: (values: Values) => Promise<void>
}) {
  const [form] = Form.useForm<FormValues>()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [lineSnapshot, setLineSnapshot] = useState<Line[]>([])
  const lines = Form.useWatch('lines', form) ?? []
  const amountPaid = Form.useWatch('amountPaid', form) ?? 0
  const activeProducts = products.filter((p) => p.active !== false)
  const calculatedLines = lineSnapshot.length ? lineSnapshot : lines
  const total = useMemo(
    () =>
      calculatedLines.reduce(
        (sum, line) => sum + Number(line?.quantity ?? 0) * Number(line?.unitCost ?? 0),
        0,
      ),
    [calculatedLines],
  )
  const close = () => {
    setStep(0)
    form.resetFields()
    onClose()
  }
  useEffect(() => {
    if (!open) return
    setStep(0)
    setLineSnapshot([])
    form.setFieldsValue({ receivedAt: dayjs(), amountPaid: 0, lines: [{}] })
    if (!supabase) return
    void supabase
      .from('inventory_locations')
      .select('id,name,location_type,active')
      .eq('active', true)
      .then(({ data }) => {
        const rows = (data ?? []).map(
          (r) => ({ id: r.id, name: r.name, type: r.location_type, active: r.active }) as InventoryLocation,
        )
        setLocations(rows)
        const floor = rows.find((r) => r.type === 'shop_floor')
        if (floor) form.setFieldValue('locationId', floor.id)
      })
    void supabase
      .from('suppliers')
      .select('id,name,phone')
      .order('name')
      .then(({ data }) => setSuppliers((data ?? []) as Supplier[]))
  }, [form, open])
  const next = async () => {
    try {
      await form.validateFields(
        step === 0 ? ['supplierName', 'supplierPhone', 'locationId', 'receivedAt'] : ['lines'],
      )
      setStep((x) => x + 1)
    } catch {
      message.warning('Complete the required fields before continuing.')
    }
  }
  const submit = async () => {
    try {
      await form.validateFields(['amountPaid', 'dueDate', 'referenceNo', 'notes'])
      setSubmitting(true)
      form.submit()
    } catch {
      message.warning('Review the payment details before recording this delivery.')
    }
  }
  return (
    <Modal
      open={open}
      title="Receive supplier delivery"
      width={860}
      onCancel={close}
      confirmLoading={saving}
      footer={
        <div className="flex justify-between">
          <Button onClick={step ? () => setStep((x) => x - 1) : close}>{step ? 'Back' : 'Cancel'}</Button>
          {step < 2 ? (
            <Button type="primary" onClick={() => void next()}>
              Continue
            </Button>
          ) : (
            <Button type="primary" loading={saving || submitting} onClick={submit}>
              Record delivery
            </Button>
          )}
        </div>
      }
    >
      <Steps
        current={step}
        size="small"
        className="mb-4"
        items={[{ title: 'Supplier' }, { title: 'Products' }, { title: 'Payment' }]}
      />
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(_, allValues) => {
          if (Array.isArray(allValues.lines) && allValues.lines.length) setLineSnapshot(allValues.lines)
        }}
        onFinish={async () => {
          const v = form.getFieldsValue(true) as FormValues
          try {
            await onSave({
              ...v,
              supplierId: v.supplierId || undefined,
              supplierPhone: v.supplierPhone?.trim() || undefined,
              receivedAt: v.receivedAt.format('YYYY-MM-DD'),
              dueDate: v.dueDate?.format('YYYY-MM-DD'),
              referenceNo: v.referenceNo?.trim() || undefined,
              notes: v.notes?.trim() || undefined,
              lines: v.lines.map(({ updateSellingPrice, ...line }) => ({
                ...line,
                sellingPrice: updateSellingPrice ? line.sellingPrice : undefined,
              })),
            })
          } catch (error) {
            message.error(
              error instanceof Error
                ? error.message
                : typeof error === 'object' &&
                    error &&
                    'message' in error &&
                    typeof error.message === 'string'
                  ? error.message
                  : 'Could not record delivery.',
            )
          } finally {
            setSubmitting(false)
          }
        }}
        onFinishFailed={({ errorFields }) => {
          setSubmitting(false)
          const first = errorFields[0]?.name
          setStep(first?.[0] === 'lines' ? 1 : 0)
          message.error('Complete the required fields before recording this delivery.')
        }}
      >
        {step === 0 && (
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="supplierId" label="Existing supplier">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select supplier"
                onChange={(id) => {
                  const s = suppliers.find((x) => x.id === id)
                  if (s) form.setFieldsValue({ supplierName: s.name, supplierPhone: s.phone ?? '' })
                }}
                options={suppliers.map((s) => ({
                  value: s.id,
                  label: s.phone ? `${s.name} · ${s.phone}` : s.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="locationId"
              label="Receive into"
              rules={[{ required: true, message: 'Choose where this stock should be received.' }]}
            >
              <Select
                placeholder="Choose stock location"
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
              />
            </Form.Item>
            <Form.Item
              name="supplierName"
              label="Supplier name"
              rules={[
                { required: true, whitespace: true, message: 'Enter the supplier name.' },
                { max: 120, message: 'Supplier name must be 120 characters or less.' },
              ]}
            >
              <Input maxLength={120} placeholder="e.g. Lagos Wholesale Mart" />
            </Form.Item>
            <Form.Item
              name="supplierPhone"
              label="Phone (optional)"
              rules={[
                {
                  pattern: /^[+]?[-()\s\d]{7,20}$/,
                  message: 'Enter a valid phone number or leave it empty.',
                },
              ]}
            >
              <Input inputMode="tel" maxLength={20} placeholder="e.g. 0801 234 5678" />
            </Form.Item>
            <Form.Item
              name="receivedAt"
              label="Received date"
              rules={[{ required: true, message: 'Choose the delivery date.' }]}
            >
              <DatePicker className="w-full" disabledDate={(date) => date.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </div>
        )}
        {step === 1 && (
          <Form.List
            name="lines"
            rules={[
              {
                validator: async (_, value: Line[] | undefined) => {
                  if (!value?.length) throw new Error('Add at least one product to this delivery.')
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.key} className="rounded border border-slate-200 px-3 py-2">
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>Product {i + 1}</span>
                      {fields.length > 1 && (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => remove(f.name)}
                        />
                      )}
                    </div>
                    <Form.Item
                      name={[f.name, 'productId']}
                      rules={[
                        { required: true, message: 'Choose a product.' },
                        {
                          validator: async (_, productId) => {
                            const deliveryLines = form.getFieldValue('lines') as Line[] | undefined
                            const duplicate = (deliveryLines ?? []).filter(
                              (line) => line?.productId === productId,
                            )
                            if (productId && duplicate.length > 1) {
                              throw new Error('Add each product only once per delivery.')
                            }
                          },
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="Select product"
                        onChange={(id) =>
                          form.setFieldValue(['lines', f.name], { productId: id, updateSellingPrice: false })
                        }
                        options={activeProducts.map((p) => ({ value: p.id, label: p.name }))}
                      />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {({ getFieldValue }) => {
                        const line = getFieldValue(['lines', f.name]) as Line | undefined
                        const product = activeProducts.find((item) => item.id === line?.productId)
                        const priceUpdateEnabled = Boolean(line?.updateSellingPrice)
                        return (
                          <div className="grid grid-cols-2 gap-x-2">
                            <Form.Item
                              name={[f.name, 'quantity']}
                              label="Qty"
                              rules={[
                                { required: true, message: 'Enter the quantity received.' },
                                {
                                  validator: async (_, value) => {
                                    if (!Number.isInteger(Number(value)) || Number(value) < 1) {
                                      throw new Error('Quantity must be at least 1 whole unit.')
                                    }
                                  },
                                },
                              ]}
                            >
                              <InputNumber min={1} className="w-full" />
                            </Form.Item>
                            <Form.Item
                              name={[f.name, 'unitCost']}
                              label="Cost / unit"
                              rules={[
                                { required: true, message: 'Enter the supplier cost per unit.' },
                                {
                                  validator: async (_, value) => {
                                    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
                                      throw new Error('Cost must be zero or more.')
                                    }
                                  },
                                },
                              ]}
                            >
                              <CurrencyInput min={0} className="w-full" />
                            </Form.Item>
                            <div className="pb-2 text-xs text-slate-500">
                              Current price:{' '}
                              <strong className="text-slate-700">
                                {product ? formatNaira(product.price) : '—'}
                              </strong>
                            </div>
                            <Form.Item
                              name={[f.name, 'updateSellingPrice']}
                              valuePropName="checked"
                              className="!mb-2 justify-self-end"
                            >
                              <Switch size="small" checkedChildren="Update" unCheckedChildren="Keep price" />
                            </Form.Item>
                            <Form.Item
                              name={[f.name, 'sellingPrice']}
                              label="New selling price"
                              className="col-span-2 !mb-0"
                              rules={[
                                ({ getFieldValue }) => ({
                                  validator: async (_, value) => {
                                    if (!getFieldValue(['lines', f.name, 'updateSellingPrice'])) return
                                    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
                                      throw new Error('Enter the new selling price before updating it.')
                                    }
                                  },
                                }),
                              ]}
                            >
                              <CurrencyInput min={0} disabled={!priceUpdateEnabled} className="w-full" />
                            </Form.Item>
                          </div>
                        )
                      }}
                    </Form.Item>
                  </div>
                ))}
                <Button
                  block
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ updateSellingPrice: false })}
                >
                  Add another product
                </Button>
              </div>
            )}
          </Form.List>
        )}
        {step === 2 && (
          <div className="space-y-2">
            <div className="rounded border border-slate-200 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Delivery summary</p>
              {calculatedLines.map((line, index) => {
                const product = activeProducts.find((item) => item.id === line.productId)
                return (
                  <div key={`${line.productId}-${index}`} className="flex justify-between py-1 text-sm">
                    <span>
                      {product?.name ?? `Product ${index + 1}`} × {line.quantity ?? 0}
                    </span>
                    <strong>{formatNaira((line.quantity ?? 0) * (line.unitCost ?? 0))}</strong>
                  </div>
                )
              })}
              <Divider className="!my-2" />
              <div className="flex justify-between">
                <span>Delivery total</span>
                <strong>{formatNaira(total)}</strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Item
                name="amountPaid"
                label="Amount paid now"
                rules={[
                  { required: true, message: 'Enter ₦0 if no payment was made today.' },
                  {
                    validator: async (_, value) => {
                      const amount = Number(value)
                      if (!Number.isFinite(amount) || amount < 0)
                        throw new Error('Amount paid cannot be negative.')
                      if (amount > total) throw new Error('Amount paid cannot exceed the delivery total.')
                    },
                  },
                ]}
              >
                <CurrencyInput min={0} className="w-full" />
              </Form.Item>
              <Form.Item
                name="dueDate"
                label="Balance due date (optional)"
                rules={[
                  {
                    validator: async (_, value: Dayjs | undefined) => {
                      if (Number(amountPaid) < total && !value) {
                        throw new Error('Choose when the supplier balance is due, or pay the full amount.')
                      }
                      if (value && value.isBefore(dayjs(), 'day')) {
                        throw new Error('Balance due date cannot be in the past.')
                      }
                    },
                  },
                ]}
              >
                <DatePicker className="w-full" disabledDate={(date) => date.isBefore(dayjs(), 'day')} />
              </Form.Item>
              <Form.Item
                name="referenceNo"
                label="Invoice / reference (optional)"
                rules={[{ max: 80, message: 'Reference must be 80 characters or less.' }]}
              >
                <Input maxLength={80} placeholder="Supplier invoice number" />
              </Form.Item>
            </div>
            <Form.Item
              name="notes"
              label="Notes (optional)"
              className="!mb-0"
              rules={[{ max: 500, message: 'Notes must be 500 characters or less.' }]}
            >
              <Input.TextArea rows={2} maxLength={500} showCount />
            </Form.Item>
            <p className="m-0 text-xs text-slate-500">
              Outstanding supplier balance: {formatNaira(Math.max(0, total - Number(amountPaid)))}
            </p>
          </div>
        )}
      </Form>
    </Modal>
  )
}
