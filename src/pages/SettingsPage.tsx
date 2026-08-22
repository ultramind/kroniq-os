import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, Form, Input, InputNumber, Modal, Select, Switch, Tabs, message } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SeedStarterCatalogue } from '../features/admin/SeedStarterCatalogue'
import { RemoveStarterCatalogue } from '../features/admin/RemoveStarterCatalogue'
import { AuditTrail } from '../features/audit/AuditTrail'
import { BillingPanel } from '../features/billing/BillingPanel'
import { SupportTicketForm } from '../features/support/SupportTicketForm'
import { StorefrontSettings } from '../features/storefront/StorefrontSettings'
import { StorefrontContentManager } from '../features/storefront/StorefrontContentManager'
import { PrinterSettingsPanel } from '../features/printing/PrinterSettingsPanel'
import {
  defaultStoreSettings,
  getStoreSettings,
  saveStoreSettings,
  type StoreSettings,
} from '../lib/storeSettings'
import { supabase } from '../supabase'
import type { Role } from '../types'
import { clearLocalPosDataForNewTenant, db } from '../db'
import { clearOfflineWorkspace } from '../lib/offlineWorkspace'

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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile) return
      const { data: store } = await supabase
        .from('stores')
        .select('organization_id,flexible_pricing_enabled')
        .eq('id', profile.store_id)
        .maybeSingle()
      if (!store) return
      if (store.flexible_pricing_enabled !== undefined)
        form.setFieldValue('flexiblePricingEnabled', store.flexible_pricing_enabled)
      const { data: organization } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', store.organization_id)
        .maybeSingle()
      if (organization?.name) form.setFieldValue('storeName', organization.name)
      const { data: storefrontEntitled } = await supabase.rpc('current_store_has_entitlement', {
        p_entitlement: 'online_storefront',
      })
      setCanUseStorefront(Boolean(storefrontEntitled))
    })()
  }, [form])
  if (role !== 'admin') return <Card>Only administrators can change store settings.</Card>
  if (hash === '#audit')
    return (
      <>
        <Button className="mb-5" icon={<ArrowLeftOutlined />} onClick={() => navigate('/settings')}>
          Back to settings
        </Button>
        <AuditTrail />
      </>
    )
  const saveSettings = async (values: Values) => {
    setSavingStoreSettings(true)
    try {
      saveStoreSettings(values)
      if (!supabase) {
        api.success('Settings saved on this device.')
        return
      }
      const [organizationResult, checkoutResult] = await Promise.all([
        supabase.rpc('update_current_organization_name', { p_name: values.storeName.trim() }),
        supabase.rpc('update_current_store_checkout_settings', {
          p_flexible_pricing_enabled: values.flexiblePricingEnabled,
        }),
      ])
      const error = organizationResult.error ?? checkoutResult.error
      if (error) {
        api.error(error.message)
        return
      }
      window.dispatchEvent(new CustomEvent('kroniq-settings-updated', { detail: values }))
      api.success('Company and checkout settings updated online.')
    } finally {
      setSavingStoreSettings(false)
    }
  }
  const storeSettings = (
    <Card title="Store settings" className="max-w-2xl">
      <Form
        form={form}
        layout="vertical"
        initialValues={defaultStoreSettings}
        onFinish={(values) => void saveSettings(values)}
      >
        <Form.Item
          name="storeName"
          label="Company name"
          extra="This name is used on receipts and your public storefront. Branch names remain separate."
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="address" label="Address">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="phone" label="Phone">
          <Input />
        </Form.Item>
        <Form.Item name="receiptFooter" label="Receipt footer">
          <Input.TextArea rows={2} />
        </Form.Item>
        <div className="grid grid-cols-2 gap-4">
          <Form.Item name="vat" label="VAT (%)">
            <InputNumber min={0} max={100} className="w-full" />
          </Form.Item>
          <Form.Item name="lowStock" label="Low-stock threshold">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
        </div>
        <Card size="small" title="Checkout controls" className="checkout-controls mb-6">
          <Form.Item
            name="flexiblePricingEnabled"
            label="Enable flexible pricing"
            valuePropName="checked"
            extra="Master switch: when off, every product uses its normal selling price. When on, only products with a cashier price floor can use an agreed price."
          >
            <Switch checkedChildren="Enabled" unCheckedChildren="Disabled" />
          </Form.Item>
        </Card>
        <Form.Item name="payments" label="Payment methods">
          <Select
            mode="multiple"
            options={['cash', 'card', 'transfer', 'credit'].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={savingStoreSettings}>
          Save settings
        </Button>
      </Form>
    </Card>
  )
  const onlineStorefront = (
    <Tabs
      className="w-full"
      items={[
        { key: 'identity', label: 'Brand & contact', children: <StorefrontSettings /> },
        { key: 'content', label: 'Homepage content', children: <StorefrontContentManager /> },
      ]}
    />
  )
  const printingSettings = (
    <div className="space-y-5">
      <Card title="Receipt printing" className="max-w-2xl">
        <p className="mb-2 text-sm text-slate-600">
          Kroniqos prints from the browser by default. On Android POS terminals, tap Print receipt and choose
          the terminal or Bluetooth printer from Android’s print screen.
        </p>
        <p className="mb-0 text-xs text-slate-500">
          When a printer is unavailable, cashiers can use Share receipt to send a text receipt through
          WhatsApp, SMS, or another installed app.
        </p>
      </Card>
      <Collapse
        className="max-w-2xl"
        items={[
          {
            key: 'desktop-direct-printing',
            label: 'Advanced: direct printing on a desktop computer',
            children: <PrinterSettingsPanel />,
          },
        ]}
      />
    </div>
  )
  const clearDeviceWorkspace = async () => {
    const pendingRecords = await db.outbox.count()
    if (pendingRecords) {
      api.warning(
        `${pendingRecords} record${pendingRecords === 1 ? '' : 's'} still need sync. Do not clear this device: retry sync or resolve the stock review first.`,
      )
      return
    }
    Modal.confirm({
      title: 'Clear local device records?',
      content:
        'This removes cached products, sales, reports, and pending records from this device only. It does not delete data in the current company database.',
      okText: 'Clear local records',
      okButtonProps: { danger: true },
      onOk: async () => {
        await clearLocalPosDataForNewTenant()
        clearOfflineWorkspace()
        window.location.reload()
      },
    })
  }
  return (
    <>
      {holder}
      <div className="mx-auto w-full max-w-7xl">
        <div className="mb-6">
          <h2 className="mb-1 text-2xl font-semibold">Settings</h2>
          <p className="mb-0 text-sm text-slate-500">Manage your store, billing, support, and setup tools.</p>
        </div>
        <Tabs
          defaultActiveKey="store"
          items={[
            { key: 'store', label: 'Store', children: storeSettings },
            { key: 'printing', label: 'Printing', children: printingSettings },
            ...(canUseStorefront
              ? [{ key: 'storefront', label: 'Online storefront', children: onlineStorefront }]
              : []),
            { key: 'billing', label: 'Subscription & billing', children: <BillingPanel /> },
            { key: 'support', label: 'Support', children: <SupportTicketForm /> },
            {
              key: 'tools',
              label: 'Setup tools',
              children: (
                <Card title="Starter catalogue" className="max-w-2xl">
                  <p className="text-sm text-slate-500">
                    Sample products are optional. Add them only to explore the POS, then remove them safely
                    when you are ready to use your own catalogue.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <SeedStarterCatalogue />
                    <RemoveStarterCatalogue />
                  </div>
                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <p className="mb-3 text-sm text-slate-500">
                      Use this after changing or deleting a company to remove old offline records from this
                      device.
                    </p>
                    <Button danger onClick={() => void clearDeviceWorkspace()}>
                      Clear local device records
                    </Button>
                  </div>
                </Card>
              ),
            },
          ]}
        />
      </div>
    </>
  )
}
