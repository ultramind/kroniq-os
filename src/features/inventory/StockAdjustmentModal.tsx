import { Form, InputNumber, Modal, Radio, Typography } from 'antd'
import { useEffect } from 'react'
import type { Product, StockMovementReason } from '../../types'

const { Text } = Typography
type Values = { quantityDelta: number; reason: StockMovementReason }
type Props = {
  product?: Product
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (values: Values) => Promise<void>
}
export function StockAdjustmentModal({ product, open, saving, onClose, onSave }: Props) {
  const [form] = Form.useForm<Values>()
  useEffect(() => {
    if (open) form.setFieldsValue({ reason: 'delivery', quantityDelta: 1 })
    else form.resetFields()
  }, [form, open])
  if (!product) return null
  return (
    <Modal
      title={`Adjust stock: ${product.name}`}
      open={open}
      onCancel={onClose}
      onOk={() => void form.submit()}
      okText="Record movement"
      confirmLoading={saving}
      destroyOnClose
    >
      <Text type="secondary">Current available stock: {product.stock}</Text>
      <Form form={form} layout="vertical" onFinish={onSave} className="mt-5">
        <Form.Item
          name="quantityDelta"
          label="Quantity change"
          rules={[{ required: true, message: 'Enter the stock change' }]}
          extra="Use a positive number for stock in and a negative number for stock out."
        >
          <InputNumber precision={0} className="w-full" />
        </Form.Item>
        <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
          <Radio.Group
            options={[
              { value: 'delivery', label: 'Delivery' },
              { value: 'correction', label: 'Correction' },
              { value: 'damaged', label: 'Damaged / waste' },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
