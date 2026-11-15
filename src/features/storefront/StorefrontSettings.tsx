import { CopyOutlined, DeleteOutlined, GlobalOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Image, Input, Radio, Statistic, Switch, Tag, Upload, message } from 'antd'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

const MAX_HERO_IMAGES = 2
type Values = {
  slug: string
  enabled: boolean
  templateKey?: 'classic_retail' | 'modern_catalogue' | 'premium_brand'
  headline?: string
  description?: string
  phone?: string
  whatsapp?: string
  address?: string
  primaryColor?: string
  heroImageUrls?: string[]
  heroImageCaptions?: string[]
  heroBackgroundUrl?: string
  logoUrl?: string
  vision?: string
  mission?: string
  trustStats?: Array<{ value?: string; label?: string }>
  businessHours?: Array<{ day?: string; hours?: string }>
  mapUrl?: string
  instagramUrl?: string
  facebookUrl?: string
  tiktokUrl?: string
  seoTitle?: string
  seoDescription?: string
  socialImageUrl?: string
}

type CustomDomain = {
  id: string
  domain: string
  status: 'requested' | 'dns_required' | 'verifying' | 'active' | 'failed'
  dns_record_type?: string | null
  dns_record_name?: string | null
  dns_record_value?: string | null
  failure_message?: string | null
  requested_at: string
  verified_at?: string | null
}

const domainStatus: Record<CustomDomain['status'], { color: string; label: string }> = {
  requested: { color: 'gold', label: 'Awaiting platform review' },
  dns_required: { color: 'gold', label: 'DNS action required' },
  verifying: { color: 'blue', label: 'Verifying DNS' },
  active: { color: 'green', label: 'Connected' },
  failed: { color: 'red', label: 'Needs attention' },
}

export function StorefrontSettings() {
  const [form] = Form.useForm<Values>()
  const [api, holder] = message.useMessage()
  const [uploading, setUploading] = useState(false)
  const [uploadingHeroBackground, setUploadingHeroBackground] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [storeId, setStoreId] = useState<string>()
  const [storeName, setStoreName] = useState('')
  const [canUseLogo, setCanUseLogo] = useState(false)
  const [canUseCustomDomains, setCanUseCustomDomains] = useState(false)
  const [customDomain, setCustomDomain] = useState<CustomDomain>()
  const [requestedDomain, setRequestedDomain] = useState('')
  const [requestingDomain, setRequestingDomain] = useState(false)
  const [insights, setInsights] = useState({ views: 0, productViews: 0, whatsappClicks: 0, leads: 0 })

  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile) return
      setStoreId(profile.store_id)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [storeResult, storefrontResult] = await Promise.all([
        supabase.from('stores').select('organization_id').eq('id', profile.store_id).maybeSingle(),
        supabase
          .from('storefronts')
          .select(
            'slug,enabled,template_key,headline,description,phone,whatsapp,address,primary_color,hero_image_urls,hero_image_captions,hero_background_url,logo_url,vision,mission,trust_stats,business_hours,map_url,social_links,seo_title,seo_description,social_image_url',
          )
          .eq('store_id', profile.store_id)
          .maybeSingle(),
      ])
      const [eventsResult, leadsResult] = await Promise.all([
        supabase
          .from('storefront_events')
          .select('event_type')
          .eq('store_id', profile.store_id)
          .gte('created_at', since),
        supabase
          .from('storefront_leads')
          .select('id')
          .eq('store_id', profile.store_id)
          .gte('created_at', since),
      ])
      if (!eventsResult.error && !leadsResult.error) {
        const events = eventsResult.data ?? []
        setInsights({
          views: events.filter((event) => event.event_type === 'page_view').length,
          productViews: events.filter((event) => event.event_type === 'product_view').length,
          whatsappClicks: events.filter((event) => event.event_type === 'whatsapp_click').length,
          leads: leadsResult.data?.length ?? 0,
        })
      }
      if (storeResult.data) {
        const [organizationResult, brandingEntitlementResult, customDomainEntitlementResult, domainResult] =
          await Promise.all([
            supabase
              .from('organizations')
              .select('name')
              .eq('id', storeResult.data.organization_id)
              .maybeSingle(),
            supabase.rpc('current_store_has_entitlement', { p_entitlement: 'storefront_branding' }),
            supabase.rpc('current_store_has_entitlement', { p_entitlement: 'custom_domains' }),
            supabase.rpc('current_storefront_custom_domain'),
          ])
        setStoreName(organizationResult.data?.name ?? '')
        setCanUseLogo(Boolean(brandingEntitlementResult.data))
        setCanUseCustomDomains(Boolean(customDomainEntitlementResult.data))
        if (!domainResult.error)
          setCustomDomain((domainResult.data?.[0] ?? undefined) as CustomDomain | undefined)
      }
      if (storefrontResult.data)
        form.setFieldsValue({
          ...storefrontResult.data,
          templateKey: storefrontResult.data.template_key,
          primaryColor: storefrontResult.data.primary_color,
          heroImageUrls: storefrontResult.data.hero_image_urls ?? [],
          heroImageCaptions: storefrontResult.data.hero_image_captions ?? [],
          heroBackgroundUrl: storefrontResult.data.hero_background_url ?? undefined,
          logoUrl: storefrontResult.data.logo_url ?? undefined,
          trustStats: Array.isArray(storefrontResult.data.trust_stats)
            ? storefrontResult.data.trust_stats
            : [],
          businessHours: Array.isArray(storefrontResult.data.business_hours)
            ? storefrontResult.data.business_hours
            : [],
          mapUrl: storefrontResult.data.map_url ?? undefined,
          instagramUrl: storefrontResult.data.social_links?.instagram ?? undefined,
          facebookUrl: storefrontResult.data.social_links?.facebook ?? undefined,
          tiktokUrl: storefrontResult.data.social_links?.tiktok ?? undefined,
          seoTitle: storefrontResult.data.seo_title ?? undefined,
          seoDescription: storefrontResult.data.seo_description ?? undefined,
          socialImageUrl: storefrontResult.data.social_image_url ?? undefined,
        })
    })()
  }, [form])

  function heroImages(): string[] {
    return ((form.getFieldValue('heroImageUrls') as string[] | undefined) ?? []).slice(0, MAX_HERO_IMAGES)
  }

  function heroCaptions(): string[] {
    return ((form.getFieldValue('heroImageCaptions') as string[] | undefined) ?? []).slice(0, MAX_HERO_IMAGES)
  }

  async function uploadHeroImage(file: File) {
    if (!supabase) throw new Error('Image storage is not configured.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use a JPG, PNG, or WebP image.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Each image must be 5 MB or smaller.')
    if (heroImages().length >= MAX_HERO_IMAGES)
      throw new Error('You can upload a maximum of two hero images.')
    setUploading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile, error: profileError } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null, error: null }
      if (profileError || !profile) throw new Error(profileError?.message ?? 'Store profile not found.')
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${profile.store_id}/hero/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage
        .from('storefront-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: url } = supabase.storage.from('storefront-images').getPublicUrl(path)
      form.setFieldValue('heroImageUrls', [...heroImages(), url.publicUrl])
      form.setFieldValue('heroImageCaptions', [...heroCaptions(), ''])
      api.success('Hero image uploaded. Save storefront changes to publish it.')
    } finally {
      setUploading(false)
    }
  }

  async function uploadLogo(file: File) {
    if (!supabase) throw new Error('Image storage is not configured.')
    if (!canUseLogo) throw new Error('A Growth plan or higher is required for a storefront logo.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use a JPG, PNG, or WebP image.')
    if (file.size > 2 * 1024 * 1024) throw new Error('Logo must be 2 MB or smaller.')
    if (!storeId) throw new Error('Store profile not found.')
    setUploadingLogo(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${storeId}/logo/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage
        .from('storefront-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: url } = supabase.storage.from('storefront-images').getPublicUrl(path)
      form.setFieldValue('logoUrl', url.publicUrl)
      api.success('Logo uploaded. Save storefront changes to publish it.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function uploadHeroBackground(file: File) {
    if (!supabase) throw new Error('Image storage is not configured.')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Use a JPG, PNG, or WebP image.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Hero background must be 5 MB or smaller.')
    if (!storeId) throw new Error('Store profile not found.')
    setUploadingHeroBackground(true)
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${storeId}/background/${crypto.randomUUID()}.${extension}`
      const { error } = await supabase.storage
        .from('storefront-images')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      const { data: url } = supabase.storage.from('storefront-images').getPublicUrl(path)
      form.setFieldValue('heroBackgroundUrl', url.publicUrl)
      api.success('Hero background uploaded. Save storefront changes to publish it.')
    } finally {
      setUploadingHeroBackground(false)
    }
  }

  async function save(values: Values) {
    if (!supabase) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('save_current_storefront', {
        p_storefront: {
          slug: values.slug.toLowerCase().trim(),
          enabled: values.enabled,
          template_key: values.templateKey ?? 'classic_retail',
          headline: values.headline,
          description: values.description,
          phone: values.phone,
          whatsapp: values.whatsapp,
          address: values.address,
          primary_color: values.primaryColor || '#0B1121',
          hero_image_urls: (values.heroImageUrls ?? []).slice(0, MAX_HERO_IMAGES),
          hero_image_captions: (values.heroImageCaptions ?? []).slice(0, MAX_HERO_IMAGES),
          hero_background_url: values.heroBackgroundUrl || null,
          logo_url: values.logoUrl || null,
          vision: values.vision || null,
          mission: values.mission || null,
          trust_stats: (values.trustStats ?? [])
            .filter((stat) => stat.value?.trim() && stat.label?.trim())
            .slice(0, 4),
          business_hours: (values.businessHours ?? [])
            .filter((item) => item.day?.trim() && item.hours?.trim())
            .slice(0, 7),
          map_url: values.mapUrl || null,
          social_links: {
            ...(values.instagramUrl?.trim() ? { instagram: values.instagramUrl.trim() } : {}),
            ...(values.facebookUrl?.trim() ? { facebook: values.facebookUrl.trim() } : {}),
            ...(values.tiktokUrl?.trim() ? { tiktok: values.tiktokUrl.trim() } : {}),
          },
          seo_title: values.seoTitle || null,
          seo_description: values.seoDescription || null,
          social_image_url: values.socialImageUrl || null,
        },
      })
      if (error) api.error(error.message)
      else api.success(`Storefront saved. Public URL: /shop/${values.slug}`)
    } finally {
      setSaving(false)
    }
  }

  async function requestCustomDomain() {
    if (!supabase) return
    setRequestingDomain(true)
    try {
      const { data, error } = await supabase.rpc('request_current_storefront_domain', {
        p_domain: requestedDomain,
      })
      if (error) throw error
      setCustomDomain((data?.[0] ?? undefined) as CustomDomain | undefined)
      setRequestedDomain('')
      api.success('Custom domain request sent to the Kroniqos platform team.')
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not request the custom domain.')
    } finally {
      setRequestingDomain(false)
    }
  }

  return (
    <Card title="Online storefront" className="w-full">
      {holder}
      <p className="text-sm text-slate-500">
        Create a branded public catalogue. Only products marked as published online will appear.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white p-4">
          <Statistic title="Views · 30 days" value={insights.views} />
        </div>
        <div className="bg-white p-4">
          <Statistic title="Product views" value={insights.productViews} />
        </div>
        <div className="bg-white p-4">
          <Statistic title="WhatsApp clicks" value={insights.whatsappClicks} />
        </div>
        <div className="bg-white p-4">
          <Statistic title="Enquiries" value={insights.leads} />
        </div>
      </div>
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          enabled: false,
          templateKey: 'classic_retail',
          primaryColor: '#0B1121',
          heroImageUrls: [],
          heroImageCaptions: [],
        }}
        onFinish={(values) => void save(values)}
        className="mt-5 grid gap-x-5 lg:grid-cols-2"
      >
        <Form.Item
          name="templateKey"
          className="lg:col-span-2"
          label="Storefront template"
          extra="You can change the design anytime; products, links, and content stay the same."
        >
          <Radio.Group
            className="storefront-template-picker grid gap-2 sm:grid-cols-3"
            options={[
              {
                value: 'classic_retail',
                label: (
                  <span>
                    <strong>Classic Retail</strong>
                    <small>Familiar and balanced</small>
                  </span>
                ),
              },
              {
                value: 'modern_catalogue',
                label: (
                  <span>
                    <strong>Modern Catalogue</strong>
                    <small>Product-first browsing</small>
                  </span>
                ),
              },
              {
                value: 'premium_brand',
                label: (
                  <span>
                    <strong>Premium Brand</strong>
                    <small>Visual and story-led</small>
                  </span>
                ),
              },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="slug"
          label="Public store URL"
          extra="Lowercase letters, numbers, and hyphens only."
          rules={[{ required: true, pattern: /^[a-z0-9-]{3,80}$/ }]}
        >
          <Input addonBefore="/shop/" />
        </Form.Item>
        <Form.Item shouldUpdate noStyle>
          {() => {
            const slug = String(form.getFieldValue('slug') ?? '').trim()
            const publicUrl = slug ? new URL(`/shop/${slug}`, window.location.origin).toString() : ''
            return (
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={publicUrl}
                  readOnly
                  placeholder="Your full public store link will appear here"
                />
                <Button
                  className="!h-8 shrink-0"
                  icon={<CopyOutlined />}
                  disabled={!publicUrl}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(publicUrl)
                      .then(() => api.success('Public store URL copied.'))
                      .catch(() => api.error('Could not copy the URL. Please copy it manually.'))
                  }
                >
                  Copy URL
                </Button>
              </div>
            )
          }}
        </Form.Item>
        {canUseCustomDomains && (
          <div className="mb-6 border border-slate-200 p-4 lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium text-[#0B1121]">Custom domain</div>
                <p className="mb-0 mt-1 text-xs text-slate-500">
                  The Kroniqos platform team connects and verifies your domain for you.
                </p>
              </div>
              {customDomain && (
                <Tag color={domainStatus[customDomain.status].color}>
                  {domainStatus[customDomain.status].label}
                </Tag>
              )}
            </div>
            {customDomain ? (
              <div className="space-y-3">
                <Input value={customDomain.domain} prefix={<GlobalOutlined />} readOnly />
                {customDomain.status === 'dns_required' && customDomain.dns_record_value && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Update your domain DNS"
                    description={
                      <div className="mt-1 text-xs">
                        <div>
                          Add a {customDomain.dns_record_type ?? 'DNS'} record named{' '}
                          <strong>{customDomain.dns_record_name || '@'}</strong> with value{' '}
                          <strong>{customDomain.dns_record_value}</strong>.
                        </div>
                      </div>
                    }
                  />
                )}
                {customDomain.status === 'failed' && customDomain.failure_message && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Domain needs attention"
                    description={customDomain.failure_message}
                  />
                )}
                <p className="mb-0 text-xs text-slate-500">
                  Need a different domain? Submit a new request below and the platform team will review it.
                </p>
              </div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={requestedDomain}
                onChange={(event) => setRequestedDomain(event.target.value)}
                placeholder="e.g. kohaels.com"
                inputMode="url"
              />
              <Button
                type="primary"
                loading={requestingDomain}
                disabled={!requestedDomain.trim()}
                onClick={() => void requestCustomDomain()}
              >
                {customDomain ? 'Request change' : 'Request domain'}
              </Button>
            </div>
          </div>
        )}
        <Form.Item name="headline" label="Headline">
          <Input placeholder="Fresh groceries, delivered with care." />
        </Form.Item>
        <Form.Item name="description" label="Store description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <Form.Item name="vision" label="Vision statement">
            <Input.TextArea rows={3} placeholder="Where we are going." />
          </Form.Item>
          <Form.Item name="mission" label="Mission statement">
            <Input.TextArea rows={3} placeholder="How we serve customers." />
          </Form.Item>
        </div>
        <Form.List name="trustStats">
          {(fields, { add, remove }) => (
            <div className="mb-6 lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <label className="font-medium">Trust statistics</label>
                <Button size="small" disabled={fields.length >= 4} onClick={() => add({})}>
                  Add statistic
                </Button>
              </div>
              {fields.map((field) => (
                <div key={field.key} className="mb-2 grid grid-cols-[1fr_1.5fr_auto] gap-2">
                  <Form.Item {...field} name={[field.name, 'value']} noStyle>
                    <Input placeholder="10+" />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'label']} noStyle>
                    <Input placeholder="Years serving customers" />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>
                    Remove
                  </Button>
                </div>
              ))}
              <p className="mb-0 mt-2 text-xs text-slate-500">
                Show up to four short statistics on your homepage.
              </p>
            </div>
          )}
        </Form.List>
        <Form.Item label="Storefront name">
          <Input value={storeName || 'Loading company name…'} readOnly disabled />
          <p className="mb-0 mt-1 text-xs text-slate-500">
            This uses the company name set by your administrator in Store settings.
          </p>
        </Form.Item>
        {!canUseLogo && (
          <Alert
            className="mb-6 lg:col-span-2"
            type="warning"
            showIcon
            message="Online storefront is available on Growth"
            description="Starter tenants can prepare content, but need Growth or higher to publish the public shop, use a custom logo, and accept customer visits."
          />
        )}
        <div className="mb-6 grid gap-5 lg:col-span-2 lg:grid-cols-2">
          {canUseLogo && (
            <div className="border border-slate-200 p-4">
              <label className="mb-2 block font-medium">Storefront logo</label>
              <div className="flex items-center gap-3">
                <Form.Item name="logoUrl" noStyle>
                  <Input type="hidden" />
                </Form.Item>
                {form.getFieldValue('logoUrl') && (
                  <Image
                    src={form.getFieldValue('logoUrl')}
                    alt="Store logo"
                    width={64}
                    height={64}
                    className="border border-slate-200 object-contain"
                    preview
                  />
                )}
                {form.getFieldValue('logoUrl') && (
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => form.setFieldValue('logoUrl', undefined)}
                  >
                    Remove
                  </Button>
                )}
                <Upload
                  accept="image/jpeg,image/png,image/webp"
                  showUploadList={false}
                  customRequest={({ file, onSuccess, onError }) => {
                    void uploadLogo(file as File)
                      .then(() => onSuccess?.({}))
                      .catch((error: Error) => {
                        api.error(error.message || 'Could not upload logo.')
                        onError?.(error)
                      })
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={uploadingLogo}>
                    Upload logo
                  </Button>
                </Upload>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Growth plan or higher · JPG, PNG, or WebP · 2 MB maximum.
              </p>
            </div>
          )}
          <div className="border border-slate-200 p-4">
            <Form.Item
              className="!mb-0"
              name="primaryColor"
              label="Primary brand colour"
              extra="Used for your public storefront header, statistics, and call-to-action buttons."
              rules={[{ pattern: /^#[0-9A-Fa-f]{6}$/, message: 'Choose a valid six-digit colour.' }]}
            >
              <Input type="color" className="!h-10 !w-20 !p-1" />
            </Form.Item>
          </div>
        </div>
        <div className="mb-6 grid gap-5 lg:col-span-2 lg:grid-cols-2">
          <Form.Item shouldUpdate noStyle>
            {() => {
              const heroBackgroundUrl = form.getFieldValue('heroBackgroundUrl') as string | undefined
              return (
                <div className="border border-slate-200 p-4">
                  <label className="mb-2 block font-medium">Hero background</label>
                  <Form.Item name="heroBackgroundUrl" noStyle>
                    <Input type="hidden" />
                  </Form.Item>
                  <div className="flex flex-wrap items-center gap-3">
                    {heroBackgroundUrl && (
                      <Image
                        src={heroBackgroundUrl}
                        alt="Hero background"
                        width={144}
                        height={80}
                        className="border border-slate-200 object-cover"
                        preview
                      />
                    )}
                    {heroBackgroundUrl && (
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={() => form.setFieldValue('heroBackgroundUrl', undefined)}
                      >
                        Remove
                      </Button>
                    )}
                    <Upload
                      accept="image/jpeg,image/png,image/webp"
                      showUploadList={false}
                      customRequest={({ file, onSuccess, onError }) => {
                        void uploadHeroBackground(file as File)
                          .then(() => onSuccess?.({}))
                          .catch((error: Error) => {
                            api.error(error.message || 'Could not upload hero background.')
                            onError?.(error)
                          })
                      }}
                    >
                      <Button icon={<UploadOutlined />} loading={uploadingHeroBackground}>
                        Upload background
                      </Button>
                    </Upload>
                  </div>
                  <p className="mb-0 mt-2 text-xs text-slate-500">
                    Optional. This image fills the full hero section; your primary colour remains the
                    fallback.
                  </p>
                </div>
              )
            }}
          </Form.Item>
          <Form.Item name="heroImageUrls" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="heroImageCaptions" hidden>
            <Input />
          </Form.Item>
          <Form.Item shouldUpdate noStyle>
            {() => {
              const images = heroImages()
              const captions = heroCaptions()
              return (
                <div className="border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="font-medium">Hero images</label>
                    <span className="text-xs text-slate-500">
                      {images.length} / {MAX_HERO_IMAGES}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {images.map((url, index) => (
                      <div key={url} className="w-44 space-y-2">
                        <div className="relative h-24 overflow-hidden border border-slate-200">
                          <Image
                            src={url}
                            alt={`Hero image ${index + 1}`}
                            className="h-full w-full object-cover"
                            preview
                          />
                          <Button
                            danger
                            type="text"
                            size="small"
                            className="!absolute right-0 top-0 !bg-white"
                            aria-label={`Remove hero image ${index + 1}`}
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              form.setFieldValue(
                                'heroImageUrls',
                                images.filter((_, itemIndex) => itemIndex !== index),
                              )
                              form.setFieldValue(
                                'heroImageCaptions',
                                captions.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }}
                          />
                        </div>
                        <Input
                          value={captions[index] ?? ''}
                          maxLength={100}
                          placeholder={`Image ${index + 1} caption (optional)`}
                          onChange={(event) => {
                            const nextCaptions = [...captions]
                            nextCaptions[index] = event.target.value
                            form.setFieldValue('heroImageCaptions', nextCaptions)
                          }}
                        />
                      </div>
                    ))}
                    {images.length < MAX_HERO_IMAGES && (
                      <Upload
                        accept="image/jpeg,image/png,image/webp"
                        showUploadList={false}
                        customRequest={({ file, onSuccess, onError }) => {
                          void uploadHeroImage(file as File)
                            .then(() => onSuccess?.({}))
                            .catch((error: Error) => {
                              api.error(error.message || 'Could not upload image.')
                              onError?.(error)
                            })
                        }}
                      >
                        <Button icon={<UploadOutlined />} loading={uploading}>
                          Upload hero image
                        </Button>
                      </Upload>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Maximum two images. Add an optional caption for each slide. JPG, PNG, or WebP, up to 5 MB
                    each.
                  </p>
                </div>
              )
            }}
          </Form.Item>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="whatsapp" label="WhatsApp number">
            <Input placeholder="2348012345678 or 08012345678" inputMode="tel" />
          </Form.Item>
        </div>
        <Form.Item name="address" label="Address">
          <Input />
        </Form.Item>
        <div className="mb-6 grid gap-5 lg:col-span-2 lg:grid-cols-2">
          <div className="border border-slate-200 p-4">
            <div className="mb-3 font-medium">Business details</div>
            <Form.Item
              name="mapUrl"
              label="Google Maps link"
              extra="Paste a Google Maps share link."
              className="!mb-4"
            >
              <Input inputMode="url" placeholder="https://maps.google.com/..." />
            </Form.Item>
            <Form.List name="businessHours">
              {(fields, { add, remove }) => (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Opening hours</span>
                    <Button size="small" onClick={() => add({})} disabled={fields.length >= 7}>
                      Add hours
                    </Button>
                  </div>
                  {fields.map((field) => (
                    <div key={field.key} className="mb-2 grid grid-cols-[1fr_1.4fr_auto] gap-2">
                      <Form.Item {...field} name={[field.name, 'day']} noStyle>
                        <Input placeholder="Monday" />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'hours']} noStyle>
                        <Input placeholder="8am – 6pm" />
                      </Form.Item>
                      <Button danger onClick={() => remove(field.name)} aria-label="Remove opening hours">
                        <DeleteOutlined />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Form.List>
          </div>
          <div className="border border-slate-200 p-4">
            <div className="mb-3 font-medium">Social links</div>
            <div className="space-y-3">
              <Form.Item name="instagramUrl" label="Instagram" className="!mb-0">
                <Input inputMode="url" placeholder="https://instagram.com/..." />
              </Form.Item>
              <Form.Item name="facebookUrl" label="Facebook" className="!mb-0">
                <Input inputMode="url" placeholder="https://facebook.com/..." />
              </Form.Item>
              <Form.Item name="tiktokUrl" label="TikTok" className="!mb-0">
                <Input inputMode="url" placeholder="https://tiktok.com/..." />
              </Form.Item>
            </div>
          </div>
        </div>
        <div className="mb-6 border border-slate-200 p-4 lg:col-span-2">
          <div className="mb-3 font-medium">Search and sharing</div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Form.Item name="seoTitle" label="Page title" extra="Used in browser tabs and Google results.">
              <Input maxLength={70} placeholder={`${storeName || 'Your business'} | Online shop`} />
            </Form.Item>
            <Form.Item
              name="socialImageUrl"
              label="Social-share image URL"
              extra="Optional image used when the link is shared."
            >
              <Input inputMode="url" placeholder="https://..." />
            </Form.Item>
          </div>
          <Form.Item
            name="seoDescription"
            label="Search description"
            extra="A concise summary for search engines and sharing."
            className="!mb-0"
          >
            <Input.TextArea rows={2} maxLength={160} />
          </Form.Item>
        </div>
        <Form.Item name="enabled" label="Publish storefront" valuePropName="checked">
          <Switch disabled={!canUseLogo} checkedChildren="Published" unCheckedChildren="Draft" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          Save storefront
        </Button>
      </Form>
    </Card>
  )
}
