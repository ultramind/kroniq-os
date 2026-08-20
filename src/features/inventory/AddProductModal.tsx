import { BarcodeOutlined, CameraOutlined, PrinterOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import type { InputRef } from 'antd'
import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { CameraBarcodeScannerModal } from '../pos/CameraBarcodeScannerModal'
import { CurrencyInput } from '../../components/CurrencyInput'
import { generateInternalBarcode } from '../../lib/barcode'

export type ProductFormValues = {
  name: string
  sku: string
  category: string[]
  price: number
  costPrice: number
  minimumSellingPrice?: number
  stock: number
  lowStockThreshold: number
}
type Props = {
  open: boolean
  saving: boolean
  initialSku?: string
  categories: string[]
  onClose: () => void
  onSave: (values: ProductFormValues) => Promise<void>
}

export function AddProductModal({ open, saving, initialSku, categories, onClose, onSave }: Props) {
  const [form] = Form.useForm<ProductFormValues>()
  const barcodeInputRef = useRef<InputRef>(null)
  const nameInputRef = useRef<InputRef>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  useEffect(() => {
    if (!open) {
      form.resetFields()
      return
    }
    form.resetFields()
    form.setFieldsValue({ sku: initialSku, category: ['Uncategorised'], stock: 0, lowStockThreshold: 10 })
    const focusTimer = window.setTimeout(() => barcodeInputRef.current?.focus(), 100)
    return () => window.clearTimeout(focusTimer)
  }, [form, initialSku, open])

  function generateBarcode() {
    form.setFieldValue('sku', generateInternalBarcode())
  }

  function printBarcode() {
    const barcode = String(form.getFieldValue('sku') ?? '').trim()
    if (!barcode) return
    const label = String(form.getFieldValue('name') ?? 'Product').trim()
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, barcode, { format: 'CODE128', displayValue: true, margin: 8, height: 58, fontSize: 14 })
    const popup = window.open('', '_blank', 'width=420,height=280')
    if (!popup) return
    popup.document.write(
      `<!doctype html><html><head><title>Barcode label</title><style>body{font-family:Arial,sans-serif;padding:28px}.label{width:300px;border:1px solid #ddd;padding:16px;text-align:center}.name{font-weight:700;margin-bottom:10px}</style></head><body><div class="label"><div class="name">${label.replace(/[<>&]/g, '')}</div>${svg.outerHTML}</div><script>window.onload=()=>window.print()</script></body></html>`,
    )
    popup.document.close()
  }

  return (
    <>
      <Modal
        title="Add product"
        width="min(760px, calc(100vw - 24px))"
        className="add-product-modal"
        open={open}
        onCancel={onClose}
        onOk={() => void form.submit()}
        okText="Save product"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form
          className="add-product-form"
          form={form}
          layout="vertical"
          onFinish={onSave}
          initialValues={{ stock: 0 }}
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <Button icon={<CameraOutlined />} onClick={() => setCameraOpen(true)}>
              Scan barcode with camera
            </Button>
          </div>
          <Form.Item
            name="sku"
            label="Barcode / SKU"
            extra="Scan now, type a code, or generate an internal barcode."
            rules={[{ required: true, message: 'Enter or scan a unique barcode' }]}
          >
            <Input
              ref={barcodeInputRef}
              placeholder="Scan barcode or type SKU"
              onPressEnter={() => nameInputRef.current?.focus()}
              addonAfter={
                <Button type="text" size="small" icon={<BarcodeOutlined />} onClick={generateBarcode}>
                  Generate
                </Button>
              }
            />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() =>
              form.getFieldValue('sku') && (
                <div className="-mt-4 mb-4">
                  <Space size={4}>
                    <Button type="link" size="small" icon={<PrinterOutlined />} onClick={printBarcode}>
                      Print barcode label
                    </Button>
                  </Space>
                </div>
              )
            }
          </Form.Item>
          <Form.Item
            name="name"
            label="Product name"
            rules={[{ required: true, message: 'Enter the product name' }]}
          >
            <Input ref={nameInputRef} placeholder="e.g. Golden Penny Spaghetti 500g" />
          </Form.Item>
          <Form.Item
            name="category"
            label="Category"
            extra="Choose an existing category or type a new one."
            rules={[{ required: true, message: 'Choose or add a category' }]}
          >
            <Select
              showSearch
              mode="tags"
              maxCount={1}
              options={categories.map((category) => ({ value: category, label: category }))}
            />
          </Form.Item>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Form.Item name="costPrice" label="Cost price (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0} precision={2} className="w-full" />
            </Form.Item>
            <Form.Item name="price" label="Default selling price (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0} precision={2} className="w-full" />
            </Form.Item>
            <Form.Item
              name="minimumSellingPrice"
              label="Cashier price floor (₦)"
              extra="Optional. Enables cashiers to agree a lower price, but never below this amount."
            >
              <CurrencyInput min={0} precision={2} className="w-full" />
            </Form.Item>
            <Form.Item name="stock" label="Opening stock" rules={[{ required: true }]}>
              <InputNumber min={0} precision={0} className="w-full" />
            </Form.Item>
            <Form.Item
              name="lowStockThreshold"
              label="Low-stock alert at"
              extra={
                <span className="text-[11px] text-red-500">
                  Flag this product when stock reaches this quantity.
                </span>
              }
              rules={[{ required: true }]}
            >
              <InputNumber min={0} precision={0} className="w-full" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
      <CameraBarcodeScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={(barcode) => {
          form.setFieldValue('sku', barcode)
          window.setTimeout(() => nameInputRef.current?.focus(), 100)
        }}
      />
    </>
  )
}
