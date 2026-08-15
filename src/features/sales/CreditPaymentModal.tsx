import { DatePicker, Form, InputNumber, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect } from 'react'

type Values = { amount: number; paidAt: string }
type FormValues = { amount: number; paidAt: Dayjs }
export function CreditPaymentModal({ open, maxAmount, onClose, onSave }: { open: boolean; maxAmount: number; onClose: () => void; onSave: (values: Values) => Promise<void> }) {
  const [form] = Form.useForm<FormValues>()
  useEffect(() => { if (open) form.setFieldsValue({ paidAt: dayjs() }); else form.resetFields() }, [form, open])
  return <Modal open={open} forceRender title="Record credit payment" okText="Record payment" onCancel={onClose} onOk={() => void form.submit()}><Form form={form} layout="vertical" onFinish={(values) => onSave({ ...values, paidAt: values.paidAt.format('YYYY-MM-DD') })}><Form.Item name="amount" label="Amount paid" rules={[{ required: true, message: 'Enter the payment amount.' }]} extra={`Remaining balance: ₦${maxAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}><InputNumber min={0.01} max={maxAmount} precision={2} prefix="₦" size="large" className="w-full" /></Form.Item><Form.Item name="paidAt" label="Payment date" rules={[{ required: true }]}><DatePicker className="w-full" format="DD MMM YYYY" /></Form.Item></Form></Modal>
}
