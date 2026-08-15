import { PlusOutlined, ToolOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Form, Input, Modal, Table, Tabs, Typography, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { ServiceSetup } from '../features/services/ServiceSetup'
import { ServiceJobs } from '../features/services/ServiceJobs'

type Customer = { id: string; full_name: string; phone?: string; email?: string; address?: string; notes?: string }
type CustomerValues = Omit<Customer, 'id'>

export function ServicesPage() {
  const [api, holder] = message.useMessage(); const [customers, setCustomers] = useState<Customer[]>([]); const [storeId, setStoreId] = useState<string>(); const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false); const [form] = Form.useForm<CustomerValues>()
  const load = useCallback(async () => { if (!supabase) return; const { data: { user } } = await supabase.auth.getUser(); const { data: profile } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null }; if (!profile) return; setStoreId(profile.store_id); const { data, error } = await supabase.from('customers').select('id,full_name,phone,email,address,notes').eq('store_id', profile.store_id).order('full_name'); if (error) api.error(error.message); else setCustomers((data ?? []) as Customer[]) }, [api])
  useEffect(() => { void load() }, [load])
  const save = async (values: CustomerValues) => { if (!supabase || !storeId) return; setSaving(true); try { const { error } = await supabase.from('customers').insert({ ...values, store_id: storeId }); if (error) api.error(error.message); else { api.success('Customer added.'); setOpen(false); form.resetFields(); await load() } } finally { setSaving(false) } }
  const jobs = <ServiceJobs />
  const customerDirectory = <Card title="Customers" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add customer</Button>}><Table rowKey="id" dataSource={customers} pagination={{ pageSize: 12 }} columns={[{ title: 'Customer', dataIndex: 'full_name', key: 'name' }, { title: 'Phone', dataIndex: 'phone', key: 'phone', responsive: ['sm'] }, { title: 'Email', dataIndex: 'email', key: 'email', responsive: ['md'] }, { title: 'Address', dataIndex: 'address', key: 'address', responsive: ['lg'] }]} locale={{ emptyText: 'No customers yet.' }} /><Modal title="Add customer" open={open} onCancel={() => setOpen(false)} onOk={() => void form.submit()} confirmLoading={saving} okText="Save customer"><Form form={form} layout="vertical" onFinish={(values) => void save(values)}><Form.Item name="full_name" label="Full name" rules={[{ required: true }]}><Input autoFocus /></Form.Item><div className="grid grid-cols-2 gap-3"><Form.Item name="phone" label="Phone"><Input /></Form.Item><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></div><Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item><Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item></Form></Modal></Card>
  return <div className="mx-auto w-full max-w-7xl">{holder}<div className="mb-6"><Typography.Title level={2} className="!mb-1">Projects</Typography.Title><Typography.Text type="secondary">Manage client projects, stages, deposits, balances, and delivery.</Typography.Text></div><Tabs defaultActiveKey="jobs" items={[{ key: 'jobs', label: 'Projects', children: jobs }, { key: 'customers', label: `Clients (${customers.length})`, children: customerDirectory }, { key: 'setup', label: 'Services & workflow', children: <ServiceSetup /> }]} /></div>
}
