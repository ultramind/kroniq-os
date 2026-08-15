import { PlusOutlined, SwapOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, message, Modal, Select, Statistic, Table, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'
import type { InventoryLocation, Product } from '../types'

type TransferValues = { productId: string; fromLocationId: string; toLocationId: string; quantity: number; note?: string }
export function WarehousesPage({ products }: { products: Product[] }) {
  const [locations, setLocations] = useState<InventoryLocation[]>([])
  const [balances, setBalances] = useState<Array<{ locationId: string; productId: string; quantity: number }>>([])
  const [locationOpen, setLocationOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [api, holder] = message.useMessage()
  const [locationForm] = Form.useForm<{ name: string }>()
  const [transferForm] = Form.useForm<TransferValues>()
  const load = async () => {
    if (!supabase) return
    const [{ data: locationRows, error }, { data: balanceRows }] = await Promise.all([supabase.from('inventory_locations').select('id, name, location_type, active').order('location_type'), supabase.from('inventory_location_balances').select('location_id, product_id, quantity')])
    if (error) { api.error(error.message); return }
    setLocations((locationRows ?? []).map((row) => ({ id: row.id, name: row.name, type: row.location_type, active: row.active })))
    setBalances((balanceRows ?? []).map((row) => ({ locationId: row.location_id, productId: row.product_id, quantity: row.quantity })))
  }
  useEffect(() => { void load() }, [])
  const names = new Map(products.map((product) => [product.id, product.name]))
  const warehouseCount = locations.filter((location) => location.type === 'warehouse').length
  const warehouseUnits = balances.filter((balance) => locations.find((location) => location.id === balance.locationId)?.type === 'warehouse').reduce((sum, balance) => sum + balance.quantity, 0)
  const rows = useMemo(() => balances.filter((balance) => balance.quantity > 0).map((balance) => ({ ...balance, location: locations.find((item) => item.id === balance.locationId)?.name ?? 'Unknown' })), [balances, locations])
  async function createWarehouse(values: { name: string }) { if (!supabase) return; setSaving(true); const { error } = await supabase.rpc('create_inventory_location', { p_name: values.name, p_type: 'warehouse' }); setSaving(false); if (error) { api.error(error.message); return }; setLocationOpen(false); locationForm.resetFields(); await load(); api.success('Warehouse created.') }
  async function transfer(values: TransferValues) { if (!supabase) return; setSaving(true); const { error } = await supabase.rpc('transfer_inventory_stock', { p_transfer: { id: crypto.randomUUID(), product_id: values.productId, from_location_id: values.fromLocationId, to_location_id: values.toLocationId, quantity: values.quantity, note: values.note } }); setSaving(false); if (error) { api.error(error.message); return }; setTransferOpen(false); transferForm.resetFields(); await load(); api.success('Stock transfer recorded.') }
  return <div className="space-y-6">{holder}<div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="mb-1 text-xl font-semibold text-slate-900">Warehouses</h2><p className="mb-0 text-sm text-slate-500">Optional bulk-stock locations. Checkout continues to sell only from the shop floor.</p></div><div className="flex gap-2"><Button icon={<PlusOutlined />} onClick={() => setLocationOpen(true)}>Add warehouse</Button><Button type="primary" icon={<SwapOutlined />} onClick={() => setTransferOpen(true)}>Transfer stock</Button></div></div><div className="grid gap-4 sm:grid-cols-3"><Card><Statistic title="Warehouses" value={warehouseCount} /></Card><Card><Statistic title="Warehouse units" value={warehouseUnits} /></Card><Card><Statistic title="Shop-floor products" value={products.filter((product) => product.stock > 0).length} /></Card></div><Card title="Inventory by location"><Table rowKey={(row) => `${row.locationId}-${row.productId}`} dataSource={rows} pagination={{ pageSize: 15 }} columns={[{ title: 'Location', dataIndex: 'location', render: (value: string, row) => <Tag color={locations.find((item) => item.id === row.locationId)?.type === 'warehouse' ? 'blue' : 'green'}>{value}</Tag> }, { title: 'Product', dataIndex: 'productId', render: (id: string) => names.get(id) ?? 'Unknown product' }, { title: 'Quantity', dataIndex: 'quantity' }]} locale={{ emptyText: 'No warehouse balances yet. Add a warehouse, then transfer stock into it.' }} /></Card><Modal open={locationOpen} title="Add warehouse" okText="Create warehouse" confirmLoading={saving} onCancel={() => setLocationOpen(false)} onOk={() => void locationForm.submit()}><Form form={locationForm} layout="vertical" onFinish={createWarehouse}><Form.Item name="name" label="Warehouse name" rules={[{ required: true }]}><Input placeholder="e.g. Main warehouse" size="large" /></Form.Item></Form></Modal><Modal open={transferOpen} title="Transfer stock" okText="Record transfer" confirmLoading={saving} onCancel={() => setTransferOpen(false)} onOk={() => void transferForm.submit()}><Form form={transferForm} layout="vertical" onFinish={transfer}><Form.Item name="productId" label="Product" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={products.map((product) => ({ value: product.id, label: `${product.name} (${product.stock} shop floor)` }))} /></Form.Item><Form.Item name="fromLocationId" label="From" rules={[{ required: true }]}><Select options={locations.map((location) => ({ value: location.id, label: location.name }))} /></Form.Item><Form.Item name="toLocationId" label="To" rules={[{ required: true }]}><Select options={locations.map((location) => ({ value: location.id, label: location.name }))} /></Form.Item><Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}><InputNumber min={1} precision={0} className="w-full" /></Form.Item><Form.Item name="note" label="Note (optional)"><Input /></Form.Item></Form></Modal></div>
}
