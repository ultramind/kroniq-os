import { Form, InputNumber, Modal, Typography } from 'antd'
import { useEffect } from 'react'
import type { Product } from '../../types'

const { Text } = Typography
type Props = { product?: Product; open: boolean; saving: boolean; onClose: () => void; onSave: (physicalCount: number) => Promise<void> }
export function StockCountModal({ product, open, saving, onClose, onSave }: Props) {
  const [form] = Form.useForm<{ physicalCount: number }>()
  useEffect(() => { if (open && product) form.setFieldsValue({ physicalCount: product.stock }); else form.resetFields() }, [form, open, product])
  if (!product) return null
  return <Modal title={`Stock count: ${product.name}`} open={open} onCancel={onClose} onOk={() => void form.submit()} okText="Reconcile stock" confirmLoading={saving} destroyOnClose><Text type="secondary">System stock: {product.stock}. Enter the quantity physically counted on the shelf.</Text><Form form={form} layout="vertical" onFinish={({ physicalCount }) => onSave(physicalCount)} className="mt-5"><Form.Item name="physicalCount" label="Physical count" rules={[{ required: true }]}><InputNumber min={0} precision={0} size="large" className="w-full" /></Form.Item></Form></Modal>
}
