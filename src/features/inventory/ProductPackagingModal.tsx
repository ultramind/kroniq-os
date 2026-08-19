import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'
import { CurrencyInput } from '../../components/CurrencyInput'
import type { Product, ProductPackage } from '../../types'

type Values = { name: string; unitsPerPack: number; sku?: string; price: number }
const units = ['piece', 'bottle', 'can', 'sachet', 'bag', 'roll', 'kg', 'litre']

export function ProductPackagingModal({
  product,
  open,
  onClose,
}: {
  product?: Product
  open: boolean
  onClose: () => void
}) {
  const [api, holder] = message.useMessage()
  const [form] = Form.useForm<Values>()
  const [packs, setPacks] = useState<ProductPackage[]>([])
  const [saving, setSaving] = useState(false)
  const [baseUnit, setBaseUnit] = useState(product?.baseUnit ?? 'piece')

  const load = useCallback(async () => {
    if (!product || !supabase) return
    const { data, error } = await supabase
      .from('product_packaging')
      .select('id,name,units_per_pack,sku,price_kobo,active')
      .eq('product_id', product.id)
      .eq('active', true)
      .order('units_per_pack')
    if (error) {
      api.error(error.message)
      return
    }
    const items = (data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      unitsPerPack: item.units_per_pack,
      sku: item.sku ?? undefined,
      price: item.price_kobo / 100,
      active: item.active,
    }))
    setPacks(items)
    setBaseUnit(product.baseUnit ?? 'piece')
  }, [api, product])

  useEffect(() => {
    if (open) void load()
    else {
      form.resetFields()
      setPacks([])
    }
  }, [form, load, open])

  async function saveBaseUnit(value: string) {
    if (!product || !supabase) return
    setBaseUnit(value)
    const { error } = await supabase.from('products').update({ base_unit: value }).eq('id', product.id)
    if (error) {
      api.error(error.message)
      return
    }
    await db.products.update(product.id, { baseUnit: value })
  }

  async function addPack(values: Values) {
    if (!product || !supabase) return
    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile?.store_id) {
        api.error('Store profile not found.')
        return
      }
      const { data, error } = await supabase
        .from('product_packaging')
        .insert({
          store_id: profile.store_id,
          product_id: product.id,
          name: values.name.trim(),
          units_per_pack: values.unitsPerPack,
          sku: values.sku?.trim() || null,
          price_kobo: Math.round(values.price * 100),
        })
        .select('id,name,units_per_pack,sku,price_kobo,active')
        .single()
      if (error || !data) {
        api.error(error?.message ?? 'Could not add package.')
        return
      }
      const pack = {
        id: data.id,
        name: data.name,
        unitsPerPack: data.units_per_pack,
        sku: data.sku ?? undefined,
        price: data.price_kobo / 100,
        active: data.active,
      }
      const next = [...packs, pack].sort((a, b) => a.unitsPerPack - b.unitsPerPack)
      setPacks(next)
      await db.products.update(product.id, { packages: next })
      form.resetFields()
      api.success('Package added.')
    } finally {
      setSaving(false)
    }
  }

  async function removePack(pack: ProductPackage) {
    if (!product || !supabase) return
    const { error } = await supabase.from('product_packaging').update({ active: false }).eq('id', pack.id)
    if (error) {
      api.error(error.message)
      return
    }
    const next = packs.filter((item) => item.id !== pack.id)
    setPacks(next)
    await db.products.update(product.id, { packages: next })
  }

  return (
    <Modal
      open={open}
      title={`Units & packs · ${product?.name ?? ''}`}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Done</Button>}
      width={760}
      className="wide-modal"
      destroyOnClose
    >
      {holder}
      <div className="mb-5 grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
        <div>
          <label className="mb-1 block text-sm font-medium">Base stock unit</label>
          <Select
            value={baseUnit}
            className="w-full"
            onChange={(value) => void saveBaseUnit(value)}
            options={units.map((unit) => ({ value: unit, label: unit }))}
          />
        </div>
        <p className="mb-0 text-[10px] leading-[1.3] text-slate-500">
          Stock remains in {baseUnit}s. A package converts to this base unit automatically.
        </p>
      </div>
      <Table
        size="small"
        rowKey="id"
        dataSource={packs}
        pagination={false}
        locale={{
          emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No packs or cartons configured." />
          ),
        }}
        columns={[
          { title: 'Package', dataIndex: 'name' },
          { title: `Contains (${baseUnit}s)`, dataIndex: 'unitsPerPack' },
          { title: 'Barcode', dataIndex: 'sku', render: (value) => value || '—' },
          { title: 'Selling price', dataIndex: 'price', render: (value) => formatNaira(value) },
          {
            title: '',
            render: (_, pack) => (
              <Button danger type="text" icon={<DeleteOutlined />} onClick={() => void removePack(pack)} />
            ),
          },
        ]}
      />
      <Form
        form={form}
        layout="vertical"
        className="mt-6 border-t border-slate-200 pt-4"
        onFinish={(values) => void addPack(values)}
        onValuesChange={(changed) => {
          if (typeof changed.unitsPerPack === 'number' && product)
            form.setFieldValue('price', product.price * changed.unitsPerPack)
        }}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Form.Item name="name" label="Pack name" rules={[{ required: true }]}>
            <Input placeholder="Carton of 24" />
          </Form.Item>
          <Form.Item name="unitsPerPack" label={`Number of ${baseUnit}s`} rules={[{ required: true }]}>
            <InputNumber min={2} precision={0} className="w-full" />
          </Form.Item>
          <Form.Item name="sku" label="Pack barcode">
            <Input placeholder="Optional" />
          </Form.Item>
          <Form.Item
            name="price"
            label="Pack selling price"
            extra="Starts from the unit price × pack quantity; edit for a bulk price."
            rules={[{ required: true }]}
          >
            <CurrencyInput min={0} precision={2} className="w-full" />
          </Form.Item>
        </div>
        <Space>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>
            Add package
          </Button>
          <span className="text-[10px] text-slate-500">
            Use the manufacturer carton barcode where available.
          </span>
        </Space>
      </Form>
    </Modal>
  )
}
