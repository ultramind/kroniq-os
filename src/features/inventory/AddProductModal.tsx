import { Form, Input, InputNumber, Modal, Select } from 'antd'
import type { InputRef } from 'antd'
import { useEffect, useRef } from 'react'

export type ProductFormValues = { name: string; sku: string; category: string[]; price: number; costPrice: number; stock: number; lowStockThreshold: number }
type Props = { open: boolean; saving: boolean; initialSku?: string; categories: string[]; onClose: () => void; onSave: (values: ProductFormValues) => Promise<void> }
export function AddProductModal({ open, saving, initialSku, categories, onClose, onSave }: Props) {
  const [form] = Form.useForm<ProductFormValues>()
  const barcodeInputRef = useRef<InputRef>(null)
  const nameInputRef = useRef<InputRef>(null)
  useEffect(() => {
    if (!open) { form.resetFields(); return }
    form.resetFields()
    form.setFieldsValue({ sku: initialSku, category: ['Uncategorised'], stock: 0, lowStockThreshold: 10 })
    const focusTimer = window.setTimeout(() => barcodeInputRef.current?.focus(), 100)
    return () => window.clearTimeout(focusTimer)
  }, [form, initialSku, open])
  return <Modal title="Add product" open={open} onCancel={onClose} onOk={() => void form.submit()} okText="Save product" confirmLoading={saving} destroyOnClose>
    <Form form={form} layout="vertical" onFinish={onSave} initialValues={{ stock: 0 }}>
      <Form.Item name="sku" label="Barcode / SKU" extra="Scan now, or type the product code. Press Enter to continue." rules={[{ required: true, message: 'Enter or scan a unique barcode' }]}><Input ref={barcodeInputRef} placeholder="Scan barcode or type SKU" onPressEnter={() => nameInputRef.current?.focus()} /></Form.Item>
      <Form.Item name="name" label="Product name" rules={[{ required: true, message: 'Enter the product name' }]}><Input ref={nameInputRef} placeholder="e.g. Golden Penny Spaghetti 500g" /></Form.Item>
      <Form.Item name="category" label="Category" extra="Choose an existing category or type a new one." rules={[{ required: true, message: 'Choose or add a category' }]}><Select showSearch mode="tags" maxCount={1} options={categories.map((category) => ({ value: category, label: category }))} /></Form.Item>
      <div className="grid grid-cols-2 gap-4"><Form.Item name="costPrice" label="Cost price (₦)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item><Form.Item name="price" label="Selling price (₦)" rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item><Form.Item name="stock" label="Opening stock" rules={[{ required: true }]}><InputNumber min={0} precision={0} className="w-full" /></Form.Item><Form.Item name="lowStockThreshold" label="Low-stock alert at" extra={<span className="text-[11px] text-red-500">Flag this product when stock reaches this quantity.</span>} rules={[{ required: true }]}><InputNumber min={0} precision={0} className="w-full" /></Form.Item></div>
    </Form>
  </Modal>
}
