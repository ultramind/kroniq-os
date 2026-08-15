import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, Select, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SeedStarterCatalogue } from '../features/admin/SeedStarterCatalogue'
import { RemoveStarterCatalogue } from '../features/admin/RemoveStarterCatalogue'
import { AuditTrail } from '../features/audit/AuditTrail'
import { BillingPanel } from '../features/billing/BillingPanel'
import { SupportTicketForm } from '../features/support/SupportTicketForm'
import { StorefrontSettings } from '../features/storefront/StorefrontSettings'
import { StorefrontContentManager } from '../features/storefront/StorefrontContentManager'
import { defaultStoreSettings, getStoreSettings, saveStoreSettings, type StoreSettings } from '../lib/storeSettings'
import { supabase } from '../supabase'
import type { Role } from '../types'

type Values = StoreSettings

export function SettingsPage({ role }: { role: Role }) {
  const [api, holder] = message.useMessage()
  const [savingStoreSettings, setSavingStoreSettings] = useState(false)
  const [canUseStorefront, setCanUseStorefront] = useState(false)
  const [form] = Form.useForm<Values>()
  const { hash } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    form.setFieldsValue(getStoreSettings())
    if (!supabase) return
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null }
      if (!profile) return
      const { data: store } = await supabase.from('stores').select('organization_id').eq('id', profile.store_id).maybeSingle()
      if (!store) return
      const { data: organization } = await supabase.from('organizations').select('name').eq('id', store.organization_id).maybeSingle()
      if (organization?.name) form.setFieldValue('storeName', organization.name)
      const { data: subscription } = await supabase.from('organization_subscriptions').select('plan_code,status').eq('organization_id', store.organization_id).maybeSingle()
      setCanUseStorefront(Boolean(subscription && ['growth', 'business', 'enterprise'].includes(subscription.plan_code) && ['trial', 'active'].includes(subscription.status)))
    })()
  }, [form])
  if (role !== 'admin') return <Card>Only administrators can change store settings.</Card>
  if (hash === '#audit') return <><Button className="mb-5" icon={<ArrowLeftOutlined />} onClick={() => navigate('/settings')}>Back to settings</Button><AuditTrail /></>
  const saveSettings = async (values: Values) => {
    setSavingStoreSettings(true)
    try {
    saveStoreSettings(values)
    if (!supabase) { api.success('Settings saved on this device.'); return }
    const { error } = await supabase.rpc('update_current_organization_name', { p_name: values.storeName.trim() })
    if (error) { api.error(error.message); return }
    api.success('Company name updated online. Device settings saved.')
    } finally {
      setSavingStoreSettings(false)
    }
  }
  const storeSettings = <Card title="Store settings" className="max-w-2xl"><Form form={form} layout="vertical" initialValues={defaultStoreSettings} onFinish={(values) => void saveSettings(values)}><Form.Item name="storeName" label="Company name" extra="This name is used on receipts and your public storefront. Branch names remain separate." rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item><Form.Item name="phone" label="Phone"><Input /></Form.Item><Form.Item name="receiptFooter" label="Receipt footer"><Input.TextArea rows={2} /></Form.Item><div className="grid grid-cols-2 gap-4"><Form.Item name="vat" label="VAT (%)"><InputNumber min={0} max={100} className="w-full" /></Form.Item><Form.Item name="lowStock" label="Low-stock threshold"><InputNumber min={0} className="w-full" /></Form.Item></div><Form.Item name="payments" label="Payment methods"><Select mode="multiple" options={['cash', 'card', 'transfer', 'credit'].map((value) => ({ value, label: value }))} /></Form.Item><Button type="primary" htmlType="submit" loading={savingStoreSettings}>Save settings</Button></Form></Card>
  const onlineStorefront = <Tabs className="w-full" items={[{ key: 'identity', label: 'Brand & contact', children: <StorefrontSettings /> }, { key: 'content', label: 'Homepage content', children: <StorefrontContentManager /> }]} />
  return <>{holder}<div className="mx-auto w-full max-w-7xl"><div className="mb-6"><h2 className="mb-1 text-2xl font-semibold">Settings</h2><p className="mb-0 text-sm text-slate-500">Manage your store, billing, support, and setup tools.</p></div><Tabs defaultActiveKey="store" items={[{ key: 'store', label: 'Store', children: storeSettings }, ...(canUseStorefront ? [{ key: 'storefront', label: 'Online storefront', children: onlineStorefront }] : []), { key: 'billing', label: 'Subscription & billing', children: <BillingPanel /> }, { key: 'support', label: 'Support', children: <SupportTicketForm /> }, { key: 'tools', label: 'Setup tools', children: <Card title="Starter catalogue" className="max-w-2xl"><p className="text-sm text-slate-500">Sample products are optional. Add them only to explore the POS, then remove them safely when you are ready to use your own catalogue.</p><div className="flex flex-wrap gap-3"><SeedStarterCatalogue /><RemoveStarterCatalogue /></div></Card> }]} /></div></>
}
