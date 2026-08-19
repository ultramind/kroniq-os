import { DatePicker, Form, Modal } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect } from 'react'
import { CurrencyInput } from '../../components/CurrencyInput'

type Values = { amount: number; paidAt: string }
type FormValues = { amount: number; paidAt: Dayjs }
export function CreditPaymentModal({
  open,
  maxAmount,
  saving = false,
  onClose,
  onSave,
}: {
  open: boolean
  maxAmount: number
  saving?: boolean
  onClose: () => void
  onSave: (values: Values) => Promise<void>
}) {
  const [form] = Form.useForm<FormValues>()
  useEffect(() => {
    if (open) form.setFieldsValue({ paidAt: dayjs() })
    else form.resetFields()
  }, [form, open])
  return (
    <Modal
      open={open}
      forceRender
      title="Record credit payment"
      okText="Record payment"
      confirmLoading={saving}
      cancelButtonProps={{ disabled: saving }}
      onCancel={onClose}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => onSave({ ...values, paidAt: values.paidAt.format('YYYY-MM-DD') })}
      >
        <Form.Item
          name="amount"
          label="Amount paid"
          rules={[
            { required: true, message: 'Enter the payment amount.' },
            {
              validator: (_, value) =>
                !value || Number(value) <= 0
                  ? Promise.reject(new Error('Enter a payment greater than zero.'))
                  : Number(value) > maxAmount
                    ? Promise.reject(new Error('Payment cannot be more than the remaining balance.'))
                    : Promise.resolve(),
            },
          ]}
          extra={`Remaining balance: ₦${maxAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`}
        >
          <CurrencyInput min={0.01} max={maxAmount} precision={2} size="large" className="w-full" />
        </Form.Item>
        <Form.Item name="paidAt" label="Payment date" rules={[{ required: true }]}>
          <DatePicker className="w-full" format="DD MMM YYYY" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
