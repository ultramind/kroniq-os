import { CopyOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Image, Input, Switch, Upload, message } from 'antd'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

const MAX_HERO_IMAGES = 2
type Values = { slug: string; enabled: boolean; headline?: string; description?: string; phone?: string; whatsapp?: string; address?: string; primaryColor?: string; heroImageUrls?: string[]; logoUrl?: string; vision?: string; mission?: string; trustStats?: Array<{ value?: string; label?: string }> }

export function StorefrontSettings() {
  const [form] = Form.useForm<Values>()
  const [api, holder] = message.useMessage()
  const [uploading, setUploading] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storeId, setStoreId] = useState<string>()
  const [storeName, setStoreName] = useState('')
  const [canUseLogo, setCanUseLogo] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null }
      if (!profile) return
      setStoreId(profile.store_id)
      const [storeResult, storefrontResult] = await Promise.all([
        supabase.from('stores').select('organization_id').eq('id', profile.store_id).maybeSingle(),
        supabase.from('storefronts').select('slug,enabled,headline,description,phone,whatsapp,address,primary_color,hero_image_urls,logo_url,vision,mission,trust_stats').eq('store_id', profile.store_id).maybeSingle(),
      ])
      if (storeResult.data) {
        const [organizationResult, subscriptionResult] = await Promise.all([
          supabase.from('organizations').select('name').eq('id', storeResult.data.organization_id).maybeSingle(),
          supabase.from('organization_subscriptions').select('plan_code,status').eq('organization_id', storeResult.data.organization_id).maybeSingle(),
        ])
        setStoreName(organizationResult.data?.name ?? '')
        const subscription = subscriptionResult.data
        setCanUseLogo(Boolean(subscription && ['growth', 'business', 'enterprise'].includes(subscription.plan_code) && ['trial', 'active'].includes(subscription.status)))
      }
      if (storefrontResult.data) form.setFieldsValue({ ...storefrontResult.data, primaryColor: storefrontResult.data.primary_color, heroImageUrls: storefrontResult.data.hero_image_urls ?? [], logoUrl: storefrontResult.data.logo_url ?? undefined, trustStats: Array.isArray(storefrontResult.data.trust_stats) ? storefrontResult.data.trust_stats : [] })
    })()
  }, [form])

  function heroImages(): string[] {
    return ((form.getFieldValue('heroImageUrls') as string[] | undefined) ?? []).slice(0, MAX_HERO_IMAGES)
  }

  async function uploadHeroImage(file: File) {
    if (!supabase) throw new Error('Image storage is not configured.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Each image must be 5 MB or smaller.')
    if (heroImages().length >= MAX_HERO_IMAGES) throw new Error('You can upload a maximum of two hero images.')
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile, error: profileError } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null, error: null }
      if (profileError || !profile) throw new Error(profileError?.message ?? 'Store profile not found.')
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${profile.store_id}/hero/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('storefront-images').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: url } = supabase.storage.from('storefront-images').getPublicUrl(path)
      form.setFieldValue('heroImageUrls', [...heroImages(), url.publicUrl])
      api.success('Hero image uploaded. Save storefront changes to publish it.')
    } finally {
      setUploading(false)
    }
  }

  async function uploadLogo(file: File) {
    if (!supabase) throw new Error('Image storage is not configured.')
    if (!canUseLogo) throw new Error('A Growth plan or higher is required for a storefront logo.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.')
    if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.')
    if (!storeId) throw new Error('Store profile not found.')
    setUploadingLogo(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${storeId}/logo/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage.from('storefront-images').upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: url } = supabase.storage.from('storefront-images').getPublicUrl(path)
      form.setFieldValue('logoUrl', url.publicUrl)
      api.success('Logo uploaded. Save storefront changes to publish it.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function save(values: Values) {
    if (!supabase) return
    setSaving(true)
    try {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle() : { data: null }
    if (!profile) { api.error('Store profile not found.'); return }
    const { error } = await supabase.from('storefronts').upsert({
      store_id: profile.store_id,
      slug: values.slug.toLowerCase().trim(),
      enabled: values.enabled,
      headline: values.headline,
      description: values.description,
      phone: values.phone,
      whatsapp: values.whatsapp,
      address: values.address,
      primary_color: values.primaryColor || '#0B1121',
      hero_image_urls: (values.heroImageUrls ?? []).slice(0, MAX_HERO_IMAGES),
      logo_url: values.logoUrl || null,
      vision: values.vision || null,
      mission: values.mission || null,
      trust_stats: (values.trustStats ?? []).filter((stat) => stat.value?.trim() && stat.label?.trim()).slice(0, 4),
      updated_at: new Date().toISOString(),
    })
    if (error) api.error(error.message)
    else api.success(`Storefront saved. Public URL: /shop/${values.slug}`)
    } finally {
      setSaving(false)
    }
  }

  return <Card title="Online storefront" className="w-full xl:w-1/2">
    {holder}
    <p className="text-sm text-slate-500">Create a branded public catalogue. Only products marked as published online will appear.</p>
    <Form form={form} layout="vertical" initialValues={{ enabled: false, primaryColor: '#0B1121', heroImageUrls: [] }} onFinish={(values) => void save(values)} className="mt-5">
      <Form.Item name="slug" label="Public store URL" extra="Lowercase letters, numbers, and hyphens only." rules={[{ required: true, pattern: /^[a-z0-9-]{3,80}$/ }]}><Input addonBefore="/shop/" /></Form.Item>
      <Form.Item shouldUpdate noStyle>{() => { const slug = String(form.getFieldValue('slug') ?? '').trim(); const publicUrl = slug ? new URL(`/shop/${slug}`, window.location.origin).toString() : ''; return <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center"><Input value={publicUrl} readOnly placeholder="Your full public store link will appear here" /><Button className="!h-8 shrink-0" icon={<CopyOutlined />} disabled={!publicUrl} onClick={() => void navigator.clipboard.writeText(publicUrl).then(() => api.success('Public store URL copied.')).catch(() => api.error('Could not copy the URL. Please copy it manually.'))}>Copy URL</Button></div> }}</Form.Item>
      <Form.Item name="headline" label="Headline"><Input placeholder="Fresh groceries, delivered with care." /></Form.Item>
      <Form.Item name="description" label="Store description"><Input.TextArea rows={3} /></Form.Item>
      <div className="grid gap-4 sm:grid-cols-2"><Form.Item name="vision" label="Vision statement"><Input.TextArea rows={3} placeholder="Where we are going." /></Form.Item><Form.Item name="mission" label="Mission statement"><Input.TextArea rows={3} placeholder="How we serve customers." /></Form.Item></div>
      <Form.List name="trustStats">{(fields, { add, remove }) => <div className="mb-6"><div className="mb-2 flex items-center justify-between"><label className="font-medium">Trust statistics</label><Button size="small" disabled={fields.length >= 4} onClick={() => add({})}>Add statistic</Button></div>{fields.map((field) => <div key={field.key} className="mb-2 grid grid-cols-[1fr_1.5fr_auto] gap-2"><Form.Item {...field} name={[field.name, 'value']} noStyle><Input placeholder="10+" /></Form.Item><Form.Item {...field} name={[field.name, 'label']} noStyle><Input placeholder="Years serving customers" /></Form.Item><Button danger onClick={() => remove(field.name)}>Remove</Button></div>)}<p className="mb-0 mt-2 text-xs text-slate-500">Show up to four short statistics on your homepage.</p></div>}</Form.List>
      <Form.Item label="Storefront name"><Input value={storeName || 'Loading company name…'} readOnly disabled /><p className="mb-0 mt-1 text-xs text-slate-500">This uses the company name set by your administrator in Store settings.</p></Form.Item>
      {!canUseLogo && <Alert className="mb-6" type="info" showIcon message="Online storefront is available on Growth" description="Starter tenants can prepare content, but need Growth or higher to publish the public shop, use a custom logo, and accept customer visits." />}{canUseLogo && <div className="mb-6"><label className="mb-2 block font-medium">Storefront logo</label><div className="flex items-center gap-3"><Form.Item name="logoUrl" noStyle><Input type="hidden" /></Form.Item>{form.getFieldValue('logoUrl') && <Image src={form.getFieldValue('logoUrl')} alt="Store logo" width={64} height={64} className="border border-slate-200 object-contain" preview />}{form.getFieldValue('logoUrl') && <Button danger size="small" icon={<DeleteOutlined />} onClick={() => form.setFieldValue('logoUrl', undefined)}>Remove</Button>}<Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} customRequest={({ file, onSuccess, onError }) => { void uploadLogo(file as File).then(() => onSuccess?.({})).catch((error: Error) => { api.error(error.message || 'Could not upload logo.'); onError?.(error) }) }}><Button icon={<UploadOutlined />} loading={uploadingLogo}>Upload logo</Button></Upload></div><p className="mt-2 text-xs text-slate-500">Growth plan or higher · JPG, PNG, or WebP · 2 MB maximum.</p></div>}
      <Form.Item name="primaryColor" label="Primary brand colour" extra="Used for your public storefront header and call-to-action buttons." rules={[{ pattern: /^#[0-9A-Fa-f]{6}$/, message: 'Choose a valid six-digit colour.' }]}><Input type="color" className="!h-10 !w-20 !p-1" /></Form.Item>
      <Form.Item name="heroImageUrls" hidden><Input /></Form.Item>
      <Form.Item shouldUpdate noStyle>{() => {
        const images = heroImages()
        return <div className="mb-6"><div className="mb-2 flex items-center justify-between"><label className="font-medium">Hero images</label><span className="text-xs text-slate-500">{images.length} / {MAX_HERO_IMAGES}</span></div><div className="flex flex-wrap gap-3">{images.map((url, index) => <div key={url} className="relative h-24 w-36 overflow-hidden border border-slate-200"><Image src={url} alt={`Hero image ${index + 1}`} className="h-full w-full object-cover" preview /><Button danger type="text" size="small" className="!absolute right-0 top-0 !bg-white" aria-label={`Remove hero image ${index + 1}`} icon={<DeleteOutlined />} onClick={() => form.setFieldValue('heroImageUrls', images.filter((_, itemIndex) => itemIndex !== index))} /></div>)}{images.length < MAX_HERO_IMAGES && <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} customRequest={({ file, onSuccess, onError }) => { void uploadHeroImage(file as File).then(() => onSuccess?.({})).catch((error: Error) => { api.error(error.message || 'Could not upload image.'); onError?.(error) }) }}><Button icon={<UploadOutlined />} loading={uploading}>Upload hero image</Button></Upload>}</div><p className="mt-2 text-xs text-slate-500">Maximum two images. JPG, PNG, or WebP, up to 5 MB each.</p></div>
      }}</Form.Item>
      <div className="grid gap-4 sm:grid-cols-2"><Form.Item name="phone" label="Phone"><Input /></Form.Item><Form.Item name="whatsapp" label="WhatsApp number"><Input placeholder="2348012345678" /></Form.Item></div>
      <Form.Item name="address" label="Address"><Input /></Form.Item>
      <Form.Item name="enabled" label="Publish storefront" valuePropName="checked"><Switch disabled={!canUseLogo} checkedChildren="Published" unCheckedChildren="Draft" /></Form.Item>
      <Button type="primary" htmlType="submit" loading={saving}>Save storefront</Button>
    </Form>
  </Card>
}
