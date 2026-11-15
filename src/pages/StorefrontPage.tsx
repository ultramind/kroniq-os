import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CloseOutlined,
  CloudSyncOutlined,
  EnvironmentOutlined,
  MenuOutlined,
  PhoneOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingOutlined,
  StarFilled,
  WhatsAppOutlined,
} from '@ant-design/icons'
import { Button, Empty, Form, Input, Pagination, Tag, message } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatNaira } from '../lib/currency'
import { initials } from '../lib/initials'
import { supabase } from '../supabase'
import { useTheme } from '../app/theme'

type Storefront = {
  store_name: string
  slug: string
  template_key?: 'classic_retail' | 'modern_catalogue' | 'premium_brand'
  headline?: string
  description?: string
  phone?: string
  whatsapp?: string
  address?: string
  primary_color?: string
  hero_image_urls?: string[]
  hero_image_captions?: string[]
  hero_background_url?: string
  logo_url?: string
  vision?: string
  mission?: string
  trust_stats?: Array<{ value: string; label: string }>
  business_hours?: Array<{ day?: string; hours?: string }>
  map_url?: string
  social_links?: Record<string, string>
  seo_title?: string
  seo_description?: string
  social_image_url?: string
}
type Product = {
  id: string
  name: string
  description?: string
  image_url?: string
  image_urls?: string[]
  price_kobo: number
  category?: string
  is_featured?: boolean
  published_at?: string
  in_stock?: boolean
}
type Section = {
  id: string
  section_type: 'text' | 'banner' | 'collection' | 'testimonials' | 'faq'
  title: string
  body?: string
  image_url?: string
  cta_label?: string
  cta_url?: string
  collection_category?: string
  position: number
}
type Testimonial = {
  id: string
  customer_name: string
  customer_title?: string
  quote: string
  rating: number
  photo_url?: string
  verified: boolean
}

function productImage(product: Product) {
  return product.image_urls?.[0] ?? product.image_url
}

function whatsappNumber(value?: string) {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (digits.startsWith('2340')) return `234${digits.slice(4)}`
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`
  return digits
}

export function StorefrontPage() {
  const { mode } = useTheme()
  const { pathname } = useLocation()
  const pathSegments = pathname.split('/').filter(Boolean)
  const hostname = window.location.hostname.toLowerCase()
  const customDomainHost =
    hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    hostname !== 'kroniqos.com' &&
    hostname !== 'www.kroniqos.com' &&
    !hostname.endsWith('.vercel.app')
  const [, routeSlug = '', routeSection, routeResourceId] = pathSegments
  const [customDomainSlug, setCustomDomainSlug] = useState<string>()
  const [customDomainResolved, setCustomDomainResolved] = useState(!customDomainHost)
  const slug = customDomainHost ? (customDomainSlug ?? '') : routeSlug
  const section = customDomainHost ? pathSegments[0] : routeSection
  const resourceId = customDomainHost ? pathSegments[1] : routeResourceId
  const productId = section === 'products' ? resourceId : undefined
  const categoryName =
    section === 'categories' && resourceId ? decodeURIComponent(resourceId).trim() : undefined
  const [store, setStore] = useState<Storefront>()
  const [products, setProducts] = useState<Product[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const baseUrl = customDomainHost ? '' : `/shop/${slug}`
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  )

  const trackStorefrontEvent = (
    eventType: 'page_view' | 'product_view' | 'whatsapp_click',
    product?: Product,
  ) => {
    if (!supabase || !slug) return
    void supabase.rpc('record_storefront_event', {
      p_slug: slug,
      p_event_type: eventType,
      p_product_id: product?.id ?? null,
      p_path: window.location.pathname,
    })
  }

  useEffect(() => {
    if (!customDomainHost || !supabase) return
    let cancelled = false
    setCustomDomainResolved(false)
    setCustomDomainSlug(undefined)
    void (async () => {
      try {
        const { data } = await supabase.rpc('public_storefront_slug_by_domain', { p_domain: hostname })
        if (!cancelled) setCustomDomainSlug((data?.[0] as { slug?: string } | undefined)?.slug)
      } finally {
        if (!cancelled) setCustomDomainResolved(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customDomainHost, hostname])

  useEffect(() => {
    if (!supabase) return
    if (!customDomainResolved) return
    if (!slug) {
      setLoading(false)
      return
    }
    const client = supabase
    let cancelled = false
    setLoading(true)
    setStore(undefined)
    const load = async () => {
      const storeResult = await client.rpc('public_storefront', { p_slug: slug })
      if (cancelled) return
      const storefront = storeResult.data?.[0] as Storefront | undefined
      setStore(storefront)
      if (!storefront) {
        setLoading(false)
        return
      }
      const [productResult, sectionResult, testimonialResult] = await Promise.all([
        client.rpc('public_storefront_products', { p_slug: slug }),
        client.rpc('public_storefront_sections', { p_slug: slug }),
        client.rpc('public_storefront_testimonials', { p_slug: slug }),
      ])
      if (cancelled) return
      setProducts((productResult.data ?? []) as Product[])
      setSections(
        (sectionResult.data ?? []).map((item: Section & { display_position?: number }) => ({
          ...item,
          position: item.display_position ?? item.position,
        })) as Section[],
      )
      setTestimonials(
        (testimonialResult.data ?? []).map((item: Testimonial & { display_position?: number }) => ({
          ...item,
          position: item.display_position ?? 0,
        })) as Testimonial[],
      )
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [customDomainResolved, slug])

  useEffect(() => {
    if (!store) return
    document.title = store.seo_title || `${store.store_name} | Online shop`
    const description = store.seo_description || store.description
    let descriptionTag = document.querySelector('meta[name="description"]')
    if (!descriptionTag) {
      descriptionTag = document.createElement('meta')
      descriptionTag.setAttribute('name', 'description')
      document.head.appendChild(descriptionTag)
    }
    if (description) descriptionTag.setAttribute('content', description)
  }, [store])

  useEffect(() => {
    if (store) trackStorefrontEvent(selectedProduct ? 'product_view' : 'page_view', selectedProduct)
    // Track page/product impressions only when the public route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.slug, pathname, selectedProduct?.id])

  if (loading)
    return (
      <main
        className={`kroniq-loader kroniq-loader--${mode} grid min-h-screen place-items-center overflow-hidden p-6`}
      >
        <div className="relative w-full max-w-sm text-center">
          <div className="kroniq-loader-orb absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" />
          {store?.logo_url ? (
            <img
              src={store.logo_url}
              alt={`${store.store_name} logo`}
              className="relative mx-auto mb-4 h-12 w-12 object-contain"
            />
          ) : (
            <span className="relative mx-auto mb-4 grid h-12 w-12 place-items-center bg-[#0B1121] text-sm font-bold text-white">
              {initials(store?.store_name ?? 'Kroniqos')}
            </span>
          )}
          <h1 className="kroniq-loader-title relative mb-1 text-xl font-semibold">
            {store?.store_name ?? 'Kroniqos'}
          </h1>
          <p className="kroniq-loader-subtitle relative m-0 text-sm">Loading online store</p>
          <div className="kroniq-loader-track relative mx-auto mt-4 h-px w-44 overflow-hidden">
            <span className="kroniq-loader-line block h-full w-1/2" />
          </div>
          <div className="kroniq-loader-status relative mt-2 flex items-center justify-center gap-2 text-[11px]">
            <CloudSyncOutlined className="kroniq-loader-spin" />
            Powered by AMT
          </div>
        </div>
      </main>
    )
  if (!store)
    return (
      <div className="grid min-h-screen place-items-center p-5">
        <Empty description="This store is not published or does not exist." />
      </div>
    )

  const whatsappRecipient = whatsappNumber(store.whatsapp)
  const whatsappUrl = whatsappRecipient ? `https://wa.me/${whatsappRecipient}` : undefined
  const primaryColor = /^#[0-9A-Fa-f]{6}$/.test(store.primary_color ?? '') ? store.primary_color! : '#0B1121'
  const contactActions = (
    <div className="flex flex-wrap gap-3">
      {store.phone && (
        <Button size="large" icon={<PhoneOutlined />} href={`tel:${store.phone}`}>
          Call store
        </Button>
      )}
      {whatsappUrl && (
        <Button
          size="large"
          type="primary"
          style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          icon={<WhatsAppOutlined />}
          href={whatsappUrl}
          target="_blank"
          onClick={() => trackStorefrontEvent('whatsapp_click')}
        >
          Order on WhatsApp
        </Button>
      )}
    </div>
  )

  return (
    <main
      className={`storefront storefront--${store.template_key ?? 'classic_retail'} flex min-h-screen flex-col bg-white text-[#0B1121]`}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link to={baseUrl || '/'} className="flex min-w-0 items-center gap-2 font-semibold text-[#0B1121]">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={`${store.store_name} logo`}
                className="h-8 w-8 border border-slate-200 object-contain"
              />
            ) : (
              <span
                style={{ backgroundColor: primaryColor }}
                className="grid h-8 w-8 place-items-center text-white"
              >
                <ShoppingOutlined />
              </span>
            )}
            <span className="truncate">{store.store_name}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
            <Link className="text-slate-600 transition hover:text-[#0B1121]" to={baseUrl || '/'}>
              Shop
            </Link>
            <Link className="text-slate-600 transition hover:text-[#0B1121]" to={`${baseUrl}/categories`}>
              Categories
            </Link>
            <Link className="text-slate-600 transition hover:text-[#0B1121]" to={`${baseUrl}/about`}>
              About
            </Link>
            <Link className="text-slate-600 transition hover:text-[#0B1121]" to={`${baseUrl}/contact`}>
              Contact
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {whatsappUrl ? (
              <Button
                type="primary"
                style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                href={whatsappUrl}
                target="_blank"
                onClick={() => trackStorefrontEvent('whatsapp_click')}
                className="hidden sm:inline-flex"
              >
                Order now
              </Button>
            ) : (
              <Link to={`${baseUrl}/contact`} className="hidden text-sm font-medium sm:inline">
                Contact us
              </Link>
            )}
            <Button
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="!flex !h-10 !w-10 !items-center !justify-center sm:!hidden"
              icon={mobileMenuOpen ? <CloseOutlined /> : <MenuOutlined />}
              onClick={() => setMobileMenuOpen((open) => !open)}
            />
          </div>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-slate-200 bg-white px-5 py-3 sm:hidden">
            <div className="mx-auto grid max-w-7xl gap-1">
              <Link
                className="px-3 py-3 text-sm font-medium text-slate-700"
                to={baseUrl || '/'}
                onClick={() => setMobileMenuOpen(false)}
              >
                Shop
              </Link>
              <Link
                className="px-3 py-3 text-sm font-medium text-slate-700"
                to={`${baseUrl}/categories`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Categories
              </Link>
              <Link
                className="px-3 py-3 text-sm font-medium text-slate-700"
                to={`${baseUrl}/about`}
                onClick={() => setMobileMenuOpen(false)}
              >
                About
              </Link>
              <Link
                className="px-3 py-3 text-sm font-medium text-slate-700"
                to={`${baseUrl}/contact`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Contact
              </Link>
              {whatsappUrl && (
                <Button
                  type="primary"
                  style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                  href={whatsappUrl}
                  target="_blank"
                  className="mt-2"
                >
                  Order on WhatsApp
                </Button>
              )}
            </div>
          </nav>
        )}
      </header>

      {section === 'about' ? (
        <AboutPage store={store} baseUrl={baseUrl} primaryColor={primaryColor} />
      ) : section === 'contact' ? (
        <ContactPage store={store} baseUrl={baseUrl} primaryColor={primaryColor} actions={contactActions} />
      ) : section === 'products' ? (
        <ProductPage product={selectedProduct} store={store} baseUrl={baseUrl} actions={contactActions} />
      ) : section === 'categories' ? (
        <CategoryPage
          store={store}
          products={products}
          baseUrl={baseUrl}
          primaryColor={primaryColor}
          categoryName={categoryName}
        />
      ) : (
        <HomePage
          store={store}
          products={products}
          sections={sections}
          testimonials={testimonials}
          baseUrl={baseUrl}
          actions={contactActions}
          primaryColor={primaryColor}
          template={store.template_key ?? 'classic_retail'}
        />
      )}

      {whatsappUrl && (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackStorefrontEvent('whatsapp_click')}
          className="fixed bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-[#25D366] text-xl text-white shadow-lg transition hover:scale-105"
          aria-label="Chat with us on WhatsApp"
        >
          <WhatsAppOutlined />
        </a>
      )}

      <footer className="mt-auto border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {store.store_name}. All rights reserved.
          </span>
          <div className="flex gap-4">
            <Link to={`${baseUrl}/about`}>About</Link>
            <Link to={`${baseUrl}/contact`}>Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function HomePage({
  store,
  products,
  sections,
  testimonials,
  baseUrl,
  actions,
  primaryColor,
  template,
}: {
  store: Storefront
  products: Product[]
  sections: Section[]
  testimonials: Testimonial[]
  baseUrl: string
  actions: React.ReactNode
  primaryColor: string
  template: NonNullable<Storefront['template_key']>
}) {
  const [query, setQuery] = useState('')
  const matches = products.filter((product) =>
    `${product.name} ${product.category} ${product.description ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const featured = products.filter((product) => product.is_featured).slice(0, 8)
  const recent = [...products]
    .sort((a, b) => +new Date(b.published_at ?? 0) - +new Date(a.published_at ?? 0))
    .slice(0, 8)
  const categories = [...new Set(products.map((product) => product.category || 'Products'))]
  const banners = sections.filter((section) => section.section_type === 'banner').slice(0, 2)
  const collectionSections = sections.filter((section) => section.section_type === 'collection')
  const contentSections = sections.filter(
    (section) =>
      section.section_type !== 'banner' &&
      section.section_type !== 'collection' &&
      section.section_type !== 'testimonials',
  )
  return (
    <>
      <StorefrontHero
        store={store}
        products={products}
        actions={actions}
        primaryColor={primaryColor}
        template={template}
      />
      {store.trust_stats?.length ? (
        <section className="border-b border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-200 px-5 sm:grid-cols-4">
            {store.trust_stats.map((stat, index) => (
              <div
                key={`${stat.label}-${index}`}
                style={{ borderTopColor: primaryColor }}
                className="border-t-2 px-4 py-7 text-center first:border-t-0 sm:first:border-t-2"
              >
                <p style={{ color: primaryColor }} className="text-2xl font-semibold">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:py-20">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Catalogue</p>
            <h2 className="mt-2 text-3xl font-semibold">Find what you need</h2>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Search products or categories"
            className="max-w-md"
            allowClear
          />
        </div>
        {products.length ? (
          <>
            {query ? (
              <ProductGrid products={matches} baseUrl={baseUrl} empty="No products match your search." />
            ) : (
              <>
                <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {categories.map((category) => (
                    <Link
                      key={category}
                      to={`${baseUrl}/categories/${encodeURIComponent(category)}`}
                      className="border border-slate-200 px-4 py-4 text-left text-sm font-medium transition hover:border-slate-500"
                    >
                      {category}
                    </Link>
                  ))}
                </div>
                {banners.length > 0 && (
                  <div className="mb-16 grid gap-5 md:grid-cols-2">
                    {banners.map((banner) => (
                      <CustomSection
                        key={banner.id}
                        section={banner}
                        products={featured}
                        testimonials={testimonials}
                        baseUrl={baseUrl}
                        primaryColor={primaryColor}
                        compact
                      />
                    ))}
                  </div>
                )}
                {collectionSections.map((item) => (
                  <CustomSection
                    key={item.id}
                    section={item}
                    products={featured}
                    testimonials={testimonials}
                    baseUrl={baseUrl}
                    primaryColor={primaryColor}
                  />
                ))}
                {featured.length > 0 &&
                  !collectionSections.some((section) => !section.collection_category) && (
                    <StorefrontCollection
                      eyebrow="Popular picks"
                      title="Featured products"
                      products={featured}
                      baseUrl={baseUrl}
                    />
                  )}
                {recent.length > 0 && (
                  <StorefrontCollection
                    eyebrow="Just in"
                    title="Recently added"
                    products={recent}
                    baseUrl={baseUrl}
                  />
                )}
                {contentSections.map((item) => (
                  <CustomSection
                    key={item.id}
                    section={item}
                    products={featured}
                    testimonials={testimonials}
                    baseUrl={baseUrl}
                    primaryColor={primaryColor}
                  />
                ))}
                <StorefrontCollection
                  eyebrow="Full catalogue"
                  title="Shop all products"
                  products={products}
                  baseUrl={baseUrl}
                />
                {testimonials.length > 0 && <TestimonialsSection testimonials={testimonials} />}
              </>
            )}
          </>
        ) : (
          <Empty description="No products have been published yet." />
        )}
      </section>
    </>
  )
}

function StorefrontHero({
  store,
  products,
  actions,
  primaryColor,
  template,
}: {
  store: Storefront
  products: Product[]
  actions: React.ReactNode
  primaryColor: string
  template: NonNullable<Storefront['template_key']>
}) {
  const title = store.headline || 'Everything you need, from a store you can trust.'
  const description =
    store.description || 'Browse our latest products and place your order directly with our team.'
  const image = store.hero_image_urls?.[0]
  if (template === 'modern_catalogue')
    return (
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-500">
            {store.store_name} · Online catalogue
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[#0B1121] sm:text-6xl">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
              <div className="mt-8">{actions}</div>
            </div>
            <div className="border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-500">Live catalogue</p>
              <p className="mt-2 text-5xl font-semibold text-[#0B1121]">{products.length}</p>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Products ready to browse, with current prices and availability.
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  if (template === 'premium_brand')
    return (
      <section className="relative isolate min-h-[520px] overflow-hidden bg-[#0B1121] text-white">
        {image && (
          <HeroImageCarousel
            images={store.hero_image_urls ?? []}
            captions={store.hero_image_captions ?? []}
            storeName={store.store_name}
            className="absolute inset-0 -z-20 min-h-0"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0B1121]/45 via-[#0B1121]/65 to-[#0B1121]" />
        <div className="mx-auto flex min-h-[520px] max-w-5xl flex-col items-center justify-center px-5 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[.26em] text-slate-300">
            {store.store_name}
          </p>
          <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.02] sm:text-7xl">{title}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-200">{description}</p>
          <div className="mt-10">{actions}</div>
          <div className="mt-12 border border-white/30 px-5 py-3 text-sm text-slate-100">
            A thoughtful collection of {products.length} available products
          </div>
        </div>
      </section>
    )
  return (
    <section
      style={{ backgroundColor: primaryColor }}
      className="relative isolate overflow-hidden text-white"
    >
      {store.hero_background_url && (
        <img
          src={store.hero_background_url}
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
      )}
      {store.hero_background_url && <div className="absolute inset-0 -z-10 bg-black/45" />}
      <div className="relative mx-auto grid min-h-[480px] max-w-7xl lg:grid-cols-2">
        <div className="flex flex-col justify-center px-5 py-16 sm:px-10 lg:px-14">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
            Welcome to {store.store_name}
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-200">{description}</p>
          <div className="mt-8">{actions}</div>
        </div>
        <HeroImageCarousel
          images={store.hero_image_urls ?? []}
          captions={store.hero_image_captions ?? []}
          storeName={store.store_name}
        />
      </div>
    </section>
  )
}

function HeroImageCarousel({
  images,
  captions,
  storeName,
  className = '',
}: {
  images: string[]
  captions: string[]
  storeName: string
  className?: string
}) {
  const [activeImage, setActiveImage] = useState(0)
  const visibleImages = images.slice(0, 2)
  useEffect(() => {
    if (visibleImages.length < 2) return
    const timer = window.setInterval(
      () => setActiveImage((current) => (current + 1) % visibleImages.length),
      5000,
    )
    return () => window.clearInterval(timer)
  }, [visibleImages.length])
  return (
    <div className={`hero-image-carousel relative min-h-[330px] overflow-hidden lg:min-h-full ${className}`}>
      {visibleImages.length ? (
        visibleImages.map((image, index) => (
          <img
            key={image}
            src={image}
            alt={`${storeName} storefront`}
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ${index === activeImage ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
          />
        ))
      ) : (
        <div className="grid h-full place-items-center text-sm text-white/70">Storefront image</div>
      )}
      {visibleImages.length > 1 && (
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {visibleImages.map((image, index) => (
            <button
              key={image}
              type="button"
              aria-label={`Show hero image ${index + 1}`}
              onClick={() => setActiveImage(index)}
              className={`h-1.5 w-7 transition ${index === activeImage ? 'bg-white' : 'bg-white/45'}`}
            />
          ))}
        </div>
      )}
      {captions[activeImage]?.trim() && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-6 pb-10 pt-16 text-white">
          <p className="m-0 max-w-md text-sm font-medium leading-6">{captions[activeImage]}</p>
        </div>
      )}
    </div>
  )
}

function StorefrontCollection({
  eyebrow,
  title,
  products,
  baseUrl,
}: {
  eyebrow: string
  title: string
  products: Product[]
  baseUrl: string
}) {
  return (
    <section className="mb-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
      <h2 className="mb-7 mt-2 text-3xl font-semibold">{title}</h2>
      <ProductGrid products={products} baseUrl={baseUrl} empty="No products available." />
    </section>
  )
}

function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <section className="mb-16 border-y border-slate-200 py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Customer stories</p>
      <h2 className="mb-8 mt-2 text-3xl font-semibold">What our customers say</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {testimonials.slice(0, 6).map((item) => (
          <article key={item.id} className="border border-slate-200 p-5">
            <div className="mb-4 flex gap-1 text-amber-500">
              {Array.from({ length: item.rating }).map((_, index) => (
                <StarFilled key={index} />
              ))}
            </div>
            <p className="leading-7 text-slate-600">“{item.quote}”</p>
            <p className="mt-5 font-semibold">
              {item.customer_name}{' '}
              {item.verified && (
                <span className="text-xs font-medium text-emerald-700">· Verified customer</span>
              )}
            </p>
            {item.customer_title && <p className="text-sm text-slate-500">{item.customer_title}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function ProductGrid({ products, baseUrl, empty }: { products: Product[]; baseUrl: string; empty: string }) {
  const pageSize = 12
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [products])
  const totalPages = Math.ceil(products.length / pageSize)
  const visibleProducts = products.slice((page - 1) * pageSize, page * pageSize)
  return products.length ? (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
        {visibleProducts.map((product) => (
          <ProductCard key={product.id} product={product} href={`${baseUrl}/products/${product.id}`} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mt-8 flex justify-center">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={products.length}
            showSizeChanger={false}
            onChange={setPage}
          />
        </div>
      )}
    </>
  ) : (
    <Empty description={empty} />
  )
}

function CustomSection({
  section,
  products,
  testimonials,
  baseUrl,
  primaryColor,
  compact = false,
}: {
  section: Section
  products: Product[]
  testimonials: Testimonial[]
  baseUrl: string
  primaryColor: string
  compact?: boolean
}) {
  if (section.section_type === 'collection') {
    const collectionProducts = section.collection_category
      ? products.filter(
          (product) =>
            (product.category || 'Products').toLowerCase() === section.collection_category?.toLowerCase(),
        )
      : products
    return (
      <StorefrontCollection
        eyebrow="Curated"
        title={section.title}
        products={collectionProducts}
        baseUrl={baseUrl}
      />
    )
  }
  if (section.section_type === 'testimonials') return null
  if (section.section_type === 'faq') {
    const questions = (section.body ?? '')
      .split('\n')
      .map((line) => line.split('|').map((item) => item.trim()))
      .filter(([question, answer]) => question && answer)
    return questions.length ? (
      <section className="mb-16 border-y border-slate-200 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Helpful information
        </p>
        <h2 className="mb-8 mt-2 text-3xl font-semibold">{section.title}</h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {questions.map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-semibold text-[#0B1121]">
                {question}
                <span className="text-xl font-normal text-slate-400 group-open:rotate-45">+</span>
              </summary>
              <p className="mb-0 mt-3 max-w-3xl leading-7 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </section>
    ) : null
  }
  if (section.section_type === 'banner') {
    const hasCta = Boolean(section.cta_label && section.cta_url)
    const content = (
      <div
        className={`relative overflow-hidden bg-slate-100 ${compact ? 'min-h-56' : 'min-h-48 sm:min-h-64'}`}
      >
        {section.image_url ? (
          <img
            src={section.image_url}
            alt={section.title}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 hover:scale-[1.02]"
          />
        ) : null}
        {(section.title || section.body || hasCta) && (
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/45 to-black/15 p-6 text-white sm:p-8">
            <div>
              <h2 className="m-0 text-2xl font-semibold sm:text-3xl">{section.title}</h2>
              {section.body && (
                <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-white/90">{section.body}</p>
              )}
              {hasCta && (
                <a
                  href={section.cta_url ?? '#'}
                  className="mt-4 inline-flex bg-white px-4 py-2 text-sm font-semibold text-[#0B1121] transition hover:bg-slate-100"
                >
                  {section.cta_label}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    )
    return section.cta_url && !hasCta ? (
      <section className={`${compact ? '' : 'mb-10'} overflow-hidden border border-slate-200`}>
        <a href={section.cta_url} className="block" aria-label={section.title}>
          {content}
        </a>
      </section>
    ) : (
      <section className={`${compact ? '' : 'mb-10'} overflow-hidden border border-slate-200`}>
        {content}
      </section>
    )
  }
  return (
    <section className="mb-16 overflow-hidden border border-slate-200">
      <div className="grid md:grid-cols-2">
        {section.image_url && (
          <img src={section.image_url} alt="" className="h-full min-h-64 w-full object-cover" />
        )}
        <div className="p-8 sm:p-12">
          <h2 className="text-3xl font-semibold">{section.title}</h2>
          {section.body && (
            <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">{section.body}</p>
          )}
          {section.cta_label && section.cta_url && (
            <a
              href={section.cta_url}
              style={{ backgroundColor: primaryColor }}
              className="mt-7 inline-block px-5 py-3 font-medium text-white"
            >
              {section.cta_label}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function CategoryPage({
  store,
  products,
  baseUrl,
  primaryColor,
  categoryName,
}: {
  store: Storefront
  products: Product[]
  baseUrl: string
  primaryColor: string
  categoryName?: string
}) {
  const categories = [...new Set(products.map((product) => product.category || 'Products'))].sort((a, b) =>
    a.localeCompare(b),
  )
  const matchingCategory = categoryName
    ? categories.find((category) => category.toLowerCase() === categoryName.toLowerCase())
    : undefined
  const categoryProducts = matchingCategory
    ? products.filter(
        (product) => (product.category || 'Products').toLowerCase() === matchingCategory.toLowerCase(),
      )
    : []

  if (categoryName && !matchingCategory)
    return (
      <section className="grid flex-1 place-items-center px-5 py-20">
        <Empty description="This category is unavailable.">
          <Link to={`${baseUrl}/categories`}>
            <Button>Browse categories</Button>
          </Link>
        </Empty>
      </section>
    )

  if (matchingCategory)
    return (
      <>
        <StorefrontPageHero
          store={store}
          baseUrl={baseUrl}
          title={matchingCategory}
          primaryColor={primaryColor}
        />
        <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Category</p>
              <h2 className="mt-2 text-3xl font-semibold">{matchingCategory}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {categoryProducts.length} {categoryProducts.length === 1 ? 'product' : 'products'} available
              </p>
            </div>
            <Link
              to={`${baseUrl}/categories`}
              className="text-sm font-medium text-slate-600 hover:text-[#0B1121]"
            >
              <ArrowLeftOutlined /> All categories
            </Link>
          </div>
          <ProductGrid
            products={categoryProducts}
            baseUrl={baseUrl}
            empty="No products are available in this category."
          />
        </section>
      </>
    )

  return (
    <>
      <StorefrontPageHero
        store={store}
        baseUrl={baseUrl}
        title="Shop by category"
        primaryColor={primaryColor}
      />
      <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:py-16">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Browse the catalogue
          </p>
          <h2 className="mt-2 text-3xl font-semibold">Choose a category</h2>
        </div>
        {categories.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
              const count = products.filter((product) => (product.category || 'Products') === category).length
              return (
                <Link
                  key={category}
                  to={`${baseUrl}/categories/${encodeURIComponent(category)}`}
                  className="group border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-sm"
                >
                  <p className="m-0 text-base font-semibold text-[#0B1121]">{category}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {count} {count === 1 ? 'product' : 'products'}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 group-hover:text-[#0B1121]">
                    Shop category <RightOutlined className="text-xs" />
                  </span>
                </Link>
              )
            })}
          </div>
        ) : (
          <Empty description="No product categories have been published yet." />
        )}
      </section>
    </>
  )
}

function AboutPage({
  store,
  baseUrl,
  primaryColor,
}: {
  store: Storefront
  baseUrl: string
  primaryColor: string
}) {
  return (
    <>
      <StorefrontPageHero store={store} baseUrl={baseUrl} title="About us" primaryColor={primaryColor} />
      <section className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight">{store.store_name}</h2>
        <div
          style={{ borderColor: primaryColor }}
          className="mt-8 border-l-2 pl-6 text-lg leading-8 text-slate-600"
        >
          {store.description ||
            'We are committed to serving our customers with quality products and dependable service.'}
        </div>
        {(store.vision || store.mission) && (
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <article className="border border-slate-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Vision</p>
              <p className="mt-3 leading-7 text-slate-600">{store.vision}</p>
            </article>
            <article className="border border-slate-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mission</p>
              <p className="mt-3 leading-7 text-slate-600">{store.mission}</p>
            </article>
          </div>
        )}
        {store.address && (
          <div className="mt-12 flex items-start gap-3 border-t border-slate-200 pt-7">
            <EnvironmentOutlined className="mt-1" />
            <div>
              <strong>Visit our store</strong>
              <p className="mt-1 text-slate-600">{store.address}</p>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function ContactPage({
  store,
  baseUrl,
  primaryColor,
  actions,
}: {
  store: Storefront
  baseUrl: string
  primaryColor: string
  actions: React.ReactNode
}) {
  return (
    <>
      <StorefrontPageHero store={store} baseUrl={baseUrl} title="Contact" primaryColor={primaryColor} />
      <section className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight">We are here to help.</h2>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
          Contact {store.store_name} to ask about a product, confirm availability, or place an order.
        </p>
        <div className="mt-10 border border-slate-200 p-7">
          <div className="grid gap-7 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-slate-500">Phone</p>
              <p className="mt-2 text-lg font-semibold">{store.phone || 'Contact details coming soon'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Store address</p>
              <p className="mt-2 text-lg font-semibold">{store.address || 'Address coming soon'}</p>
            </div>
          </div>
          <div className="mt-8">{actions}</div>
        </div>
        <LeadCaptureForm slug={store.slug} />
        {(store.business_hours?.length || store.map_url || Object.keys(store.social_links ?? {}).length) && (
          <div className="mt-8 grid gap-5 border-t border-slate-200 pt-8 sm:grid-cols-2">
            <div>
              {store.business_hours?.length ? (
                <>
                  <h3 className="text-lg font-semibold">Opening hours</h3>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {store.business_hours.map((item, index) => (
                      <p key={`${item.day}-${index}`} className="m-0 flex justify-between gap-4">
                        <span>{item.day}</span>
                        <span>{item.hours}</span>
                      </p>
                    ))}
                  </div>
                </>
              ) : null}
              {store.map_url && (
                <a
                  className="mt-5 inline-flex font-medium text-[#0B1121] underline"
                  href={store.map_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View our location on Google Maps
                </a>
              )}
            </div>
            {Object.keys(store.social_links ?? {}).length ? (
              <div>
                <h3 className="text-lg font-semibold">Follow us</h3>
                <div className="mt-3 flex flex-wrap gap-3">
                  {Object.entries(store.social_links ?? {}).map(([network, url]) => (
                    <a
                      key={network}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-slate-200 px-3 py-2 text-sm font-medium capitalize hover:border-slate-400"
                    >
                      {network}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </>
  )
}

function LeadCaptureForm({ slug, product }: { slug: string; product?: Product }) {
  const [form] = Form.useForm<{ name: string; phone: string; email?: string; message?: string }>()
  const [api, holder] = message.useMessage()
  const [submitting, setSubmitting] = useState(false)
  const submit = async (values: { name: string; phone: string; email?: string; message?: string }) => {
    if (!supabase) return
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('submit_storefront_lead', {
        p_slug: slug,
        p_name: values.name,
        p_phone: values.phone,
        p_email: values.email || null,
        p_message: values.message || null,
        p_product_id: product?.id ?? null,
      })
      if (error) throw error
      form.resetFields()
      api.success('Thanks — the business will contact you shortly.')
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not send your enquiry.')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <section className="mt-8 border border-slate-200 p-6 sm:p-8">
      {holder}
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Send an enquiry</p>
      <h2 className="mt-2 text-2xl font-semibold">We will get back to you.</h2>
      {product && <p className="text-sm text-slate-500">Enquiry about: {product.name}</p>}
      <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item name="name" label="Your name" rules={[{ required: true, min: 2 }]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Form.Item name="phone" label="Phone number" rules={[{ required: true, min: 7 }]}>
            <Input inputMode="tel" autoComplete="tel" />
          </Form.Item>
        </div>
        <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email' }]}>
          <Input inputMode="email" autoComplete="email" />
        </Form.Item>
        <Form.Item name="message" label="How can we help?">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={submitting}>
          Send enquiry
        </Button>
      </Form>
    </section>
  )
}

function StorefrontPageHero({
  store,
  baseUrl,
  title,
  primaryColor,
}: {
  store: Storefront
  baseUrl: string
  title: string
  primaryColor: string
}) {
  const image = store.hero_image_urls?.[0]
  return (
    <section
      style={{ backgroundColor: primaryColor }}
      className="relative isolate overflow-hidden text-white"
    >
      {image && (
        <img src={image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />
      )}
      <div className="absolute inset-0 -z-10 bg-black/20" />
      <div className="mx-auto max-w-7xl px-5 py-14 sm:py-16">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-white/75">
          <Link to={baseUrl || '/'} className="transition hover:text-white">
            Home
          </Link>
          <RightOutlined className="text-[10px]" />
          <span className="text-white">{title}</span>
        </nav>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      </div>
    </section>
  )
}

function ProductPage({
  product,
  store,
  baseUrl,
  actions,
}: {
  product?: Product
  store: Storefront
  baseUrl: string
  actions: React.ReactNode
}) {
  const [selectedImage, setSelectedImage] = useState<string>()
  useEffect(() => setSelectedImage(undefined), [product?.id])

  if (!product)
    return (
      <section className="grid flex-1 place-items-center px-5 py-20">
        <Empty description="This product is unavailable.">
          <Link to={baseUrl || '/'}>
            <Button>Back to shop</Button>
          </Link>
        </Empty>
      </section>
    )
  const images = product.image_urls?.length
    ? product.image_urls
    : product.image_url
      ? [product.image_url]
      : []
  const mainImage = selectedImage && images.includes(selectedImage) ? selectedImage : images[0]
  const productWhatsappRecipient = whatsappNumber(store.whatsapp)
  const productWhatsappUrl = productWhatsappRecipient
    ? `https://wa.me/${productWhatsappRecipient}?text=${encodeURIComponent(`Hello, I would like to order ${product.name}.`)}`
    : undefined
  const primaryColor = /^#[0-9A-Fa-f]{6}$/.test(store.primary_color ?? '') ? store.primary_color : '#0B1121'
  return (
    <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:py-16">
      <Link to={baseUrl || '/'} className="text-sm font-medium text-slate-600">
        <ArrowLeftOutlined /> Back to shop
      </Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div className="aspect-square overflow-hidden bg-slate-100">
          {mainImage ? (
            <img
              key={mainImage}
              className="storefront-product-main-image h-full w-full object-cover"
              src={mainImage}
              alt={product.name}
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-400">No product image</div>
          )}
        </div>
        {images.length > 1 && (
          <ProductImageThumbnails
            className="mt-3 sm:hidden"
            images={images}
            productName={product.name}
            mainImage={mainImage}
            onSelect={setSelectedImage}
          />
        )}
        <div className="lg:py-8">
          <Tag className="!m-0">{product.category || 'Products'}</Tag>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-5 text-xl font-semibold">{formatNaira(product.price_kobo / 100)}</p>
          <p className="mt-7 max-w-xl whitespace-pre-line leading-7 text-slate-600">
            {product.description ||
              `${product.name} is available from ${store.store_name}. Contact us to confirm availability.`}
          </p>
          {images.length > 1 && (
            <ProductImageThumbnails
              className="mt-7 hidden sm:flex"
              images={images}
              productName={product.name}
              mainImage={mainImage}
              onSelect={setSelectedImage}
            />
          )}
          <div className="mt-10 flex flex-wrap gap-3">
            {productWhatsappUrl ? (
              <Button
                type="primary"
                size="large"
                icon={<WhatsAppOutlined />}
                style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
                href={productWhatsappUrl}
                target="_blank"
              >
                Order this product on WhatsApp
              </Button>
            ) : (
              actions
            )}
            {productWhatsappUrl && store.phone && (
              <Button size="large" icon={<PhoneOutlined />} href={`tel:${store.phone}`}>
                Call store
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ProductImageThumbnails({
  images,
  productName,
  mainImage,
  onSelect,
  className,
}: {
  images: string[]
  productName: string
  mainImage?: string
  onSelect: (image: string) => void
  className?: string
}) {
  return (
    <div className={`flex gap-3 ${className ?? ''}`}>
      {images.map((image, index) => (
        <button
          key={`${image}-${index}`}
          type="button"
          aria-label={`Show product image ${index + 1}`}
          aria-pressed={mainImage === image}
          className={`h-20 w-20 overflow-hidden border transition ${
            mainImage === image
              ? 'border-[#0B1121] ring-1 ring-[#0B1121]'
              : 'border-slate-200 hover:border-slate-400'
          }`}
          onClick={() => onSelect(image)}
        >
          <img className="h-full w-full object-cover" src={image} alt={`${productName} view ${index + 1}`} />
        </button>
      ))}
    </div>
  )
}

function ProductCard({ product, href }: { product: Product; href: string }) {
  const image = productImage(product)
  return (
    <Link
      to={href}
      className="storefront-product-card group block overflow-hidden border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_14px_34px_rgb(11_17_33_/_10%)]"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {image ? (
          <img
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
            src={image}
            alt={product.name}
          />
        ) : (
          <div className="grid h-full place-items-center text-center text-xs text-slate-400">
            No product image
          </div>
        )}
        <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate bg-white/95 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm backdrop-blur">
          {product.category || 'Products'}
        </span>
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-[#0B1121] sm:text-base">
          {product.name}
        </h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="m-0 truncate text-sm font-bold text-[#0B1121] sm:text-base">
            {formatNaira(product.price_kobo / 100)}
          </p>
          {product.in_stock === false ? (
            <span className="text-right text-[10px] font-semibold leading-4 text-amber-700">
              Out of stock
            </span>
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center border border-slate-200 text-xs text-slate-500 transition group-hover:border-[#0B1121] group-hover:bg-[#0B1121] group-hover:text-white">
              <RightOutlined />
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
