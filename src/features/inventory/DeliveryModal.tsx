import { DatePicker, Form, Input, InputNumber, Modal, Select, Switch, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import type { InventoryLocation, Product } from '../../types'
import { supabase } from '../../supabase'

type Values = {
  productId: string
  supplierId?: string
  supplierName: string
  supplierPhone?: string
  quantity: number
  unitCost: number
  sellingPrice?: number
  receivedAt: string
  locationId: string
}
type FormValues = Omit<Values, 'receivedAt' | 'sellingPrice'> & { receivedAt: Dayjs; sellingPrice?: number; updateSellingPrice?: boolean; packageId?: string }
type Supplier = { id: string; name: string; phone?: string | null }

type Props = {
  open: boolean
  products: Product[]
  saving: boolean
  onClose: () => void
  onSave: (values: Values) => Promise<void>
}

export function DeliveryModal({ open, products, saving, onClose, onSave }: Props) {
  const [form] = Form.useForm<FormValues>()
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const selectedProductId = Form.useWatch('productId', form)
  const selectedPackageId = Form.useWatch('packageId', form)
  const updateSellingPrice = Form.useWatch('updateSellingPrice', form)
  const selectedProduct = products.find((product) => product.id === selectedProductId)
  const selectedPackage = selectedProduct?.packages?.find((pack) => pack.id === selectedPackageId)
  const unitsReceived = selectedPackage?.unitsPerPack ?? 1
  const receivedUnitLabel = selectedPackage?.name ?? selectedProduct?.baseUnit ?? 'unit'

  useEffect(() => {
    if (!open) {
      form.resetFields()
      return
    }
    form.setFieldValue('receivedAt', dayjs())
    if (!supabase) return

    void supabase.from('inventory_locations').select('id, name, location_type, active').eq('active', true).then(({ data }) => {
      const rows = (data ?? []).map((row) => ({ id: row.id, name: row.name, type: row.location_type, active: row.active } as InventoryLocation))
      setLocations(rows)
      const shopFloor = rows.find((location) => location.type === 'shop_floor')
      if (shopFloor) form.setFieldValue('locationId', shopFloor.id)
    })
    void supabase.from('suppliers').select('id,name,phone').order('name').then(({ data }) => setSuppliers((data ?? []) as Supplier[]))
  }, [form, open])

  return <Modal open={open} forceRender title="Receive supplier delivery" okText="Record delivery" confirmLoading={saving} onCancel={onClose} onOk={() => void form.submit()}>
    <Form
      form={form}
      layout="vertical"
      onFinish={({ packageId: _packageId, updateSellingPrice, ...values }) => onSave({
        ...values,
        quantity: values.quantity * unitsReceived,
        unitCost: values.unitCost / unitsReceived,
        supplierId: values.supplierId || undefined,
        supplierPhone: values.supplierPhone?.trim() || undefined,
        sellingPrice: updateSellingPrice ? values.sellingPrice : undefined,
        receivedAt: values.receivedAt.format('YYYY-MM-DD'),
      })}
    >
      <Form.Item name="productId" label="Product" rules={[{ required: true }]}>
        <Select
          showSearch
          optionFilterProp="label"
          onChange={(productId) => {
            const product = products.find((item) => item.id === productId)
            form.setFieldsValue({ sellingPrice: product?.price, updateSellingPrice: false, packageId: undefined })
          }}
          options={products.map((product) => ({ value: product.id, label: `${product.name} (${product.stock} on shop floor)` }))}
        />
      </Form.Item>
      {selectedProduct && <Form.Item name="packageId" label="Delivery unit" extra={`Stock will be converted and stored as ${selectedProduct.baseUnit ?? 'piece'}s.`}>
        <Select allowClear placeholder={`Individual ${selectedProduct.baseUnit ?? 'unit'}`} options={(selectedProduct.packages ?? []).map((pack) => ({ value: pack.id, label: `${pack.name} · ${pack.unitsPerPack} ${selectedProduct.baseUnit ?? 'units'}` }))} />
      </Form.Item>}
      <Form.Item name="locationId" label="Receive into" rules={[{ required: true, message: 'Choose where this stock is being received.' }]}>
        <Select options={locations.map((location) => ({ value: location.id, label: `${location.name}${location.type === 'shop_floor' ? ' (checkout stock)' : ''}` }))} />
      </Form.Item>

      <Form.Item label={<span>Existing supplier <span className="font-normal text-slate-400">(optional)</span></span>} name="supplierId">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Select a saved supplier"
          onChange={(supplierId) => {
            const supplier = suppliers.find((item) => item.id === supplierId)
            if (supplier) form.setFieldsValue({ supplierName: supplier.name, supplierPhone: supplier.phone ?? '' })
          }}
          options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.phone ? `${supplier.name} · ${supplier.phone}` : supplier.name }))}
        />
      </Form.Item>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="supplierName" label="Supplier name" rules={[{ required: true }]}><Input placeholder="New supplier name" /></Form.Item>
        <Form.Item name="supplierPhone" label={<span>Supplier phone <span className="font-normal text-slate-400">(optional)</span></span>}><Input inputMode="tel" placeholder="e.g. 08012345678" /></Form.Item>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="quantity" label={`Quantity received (${receivedUnitLabel})`} rules={[{ required: true }]}><InputNumber min={1} precision={0} className="w-full" /></Form.Item>
        <Form.Item name="unitCost" label={`Cost per ${receivedUnitLabel} (₦)`} rules={[{ required: true }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
      </div>

      <div className="mb-5 border-y border-slate-200 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Typography.Text type="secondary" className="mb-1 block text-sm">Current selling price</Typography.Text>
            <InputNumber disabled value={selectedProduct?.price} prefix="₦" precision={2} className="w-full" />
          </div>
          <div className="flex flex-col justify-end">
            <Form.Item name="updateSellingPrice" valuePropName="checked" className="!mb-1"><Switch disabled={!selectedProduct} checkedChildren="Update price" unCheckedChildren="Keep price" /></Form.Item>
            <Typography.Text type="secondary" className="text-[10px] leading-[1.3]">Choose whether this delivery should change the selling price.</Typography.Text>
          </div>
        </div>
        {updateSellingPrice && <Form.Item name="sellingPrice" label="New selling price (₦)" className="!mb-0" rules={[{ required: true, message: 'Enter the new selling price.' }]} extra="This change is recorded with the delivery."><InputNumber min={0} precision={2} className="w-full" /></Form.Item>}
      </div>
      <Form.Item name="receivedAt" label="Received date" rules={[{ required: true, message: 'Select when this stock was received.' }]} extra="Use the supplier’s delivery date for accurate stock records.">
        <DatePicker className="w-full" format="DD MMM YYYY" />
      </Form.Item>
    </Form>
  </Modal>
}
