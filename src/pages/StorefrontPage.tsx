import { ArrowLeftOutlined, ArrowRightOutlined, CloseOutlined, EnvironmentOutlined, MenuOutlined, PhoneOutlined, RightOutlined, SearchOutlined, ShoppingOutlined, StarFilled, WhatsAppOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Skeleton, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatNaira } from '../lib/currency'
import { supabase } from '../supabase'

type Storefront = { store_name: string; slug: string; headline?: string; description?: string; phone?: string; whatsapp?: string; address?: string; primary_color?: string; hero_image_urls?: string[]; logo_url?: string; vision?: string; mission?: string; trust_stats?: Array<{ value: string; label: string }> }
type Product = { id: string; name: string; description?: string; image_url?: string; image_urls?: string[]; price_kobo: number; category?: string; is_featured?: boolean; published_at?: string }
type Section = { id: string; section_type: 'text' | 'banner' | 'collection' | 'testimonials'; title: string; body?: string; image_url?: string; cta_label?: string; cta_url?: string; position: number }
type Testimonial = { id: string; customer_name: string; customer_title?: string; quote: string; rating: number; photo_url?: string; verified: boolean }

function productImage(product: Product) {
  return product.image_urls?.[0] ?? product.image_url
}

export function StorefrontPage() {
  const { pathname } = useLocation()
  const [, slug = '', section, productId] = pathname.split('/').filter(Boolean)
  const [store, setStore] = useState<Storefront>()
  const [products, setProducts] = useState<Product[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const baseUrl = `/shop/${slug}`
  const selectedProduct = useMemo(() => products.find((product) => product.id === productId), [productId, products])

  useEffect(() => {
    if (!supabase) return
    setLoading(true)
    void Promise.all([
      supabase.rpc('public_storefront', { p_slug: slug }),
      supabase.rpc('public_storefront_products', { p_slug: slug }),
      supabase.rpc('public_storefront_sections', { p_slug: slug }),
      supabase.rpc('public_storefront_testimonials', { p_slug: slug }),
    ]).then(([storeResult, productResult, sectionResult, testimonialResult]) => {
      setStore(storeResult.data?.[0] as Storefront | undefined)
      setProducts((productResult.data ?? []) as Product[])
      setSections((sectionResult.data ?? []).map((item: Section & { display_position?: number }) => ({ ...item, position: item.display_position ?? item.position })) as Section[])
      setTestimonials((testimonialResult.data ?? []).map((item: Testimonial & { display_position?: number }) => ({ ...item, position: item.display_position ?? 0 })) as Testimonial[])
      setLoading(false)
    })
  }, [slug])

  if (loading) return <div className="mx-auto max-w-7xl p-6"><Skeleton active /></div>
  if (!store) return <div className="grid min-h-screen place-items-center p-5"><Empty description="This store is not published or does not exist." /></div>

  const whatsappUrl = store.whatsapp ? `https://wa.me/${store.whatsapp.replace(/\D/g, '')}` : undefined
  const primaryColor = /^#[0-9A-Fa-f]{6}$/.test(store.primary_color ?? '') ? store.primary_color! : '#0B1121'
  const contactActions = <div className="flex flex-wrap gap-3">
    {store.phone && <Button size="large" icon={<PhoneOutlined />} href={`tel:${store.phone}`}>Call store</Button>}
    {whatsappUrl && <Button size="large" type="primary" style={{ backgroundColor: primaryColor, borderColor: primaryColor }} icon={<WhatsAppOutlined />} href={whatsappUrl} target="_blank">Order on WhatsApp</Button>}
  </div>

  return <main className="flex min-h-screen flex-col bg-white text-[#0B1121]">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link to={baseUrl} className="flex min-w-0 items-center gap-2 font-semibold text-[#0B1121]">{store.logo_url ? <img src={store.logo_url} alt={`${store.store_name} logo`} className="h-8 w-8 border border-slate-200 object-contain" /> : <span style={{ backgroundColor: primaryColor }} className="grid h-8 w-8 place-items-center text-white"><ShoppingOutlined /></span>}<span className="truncate">{store.store_name}</span></Link>
        <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
          <Link className="text-slate-600 transition hover:text-[#0B1121]" to={baseUrl}>Shop</Link>
          <Link className="text-slate-600 transition hover:text-[#0B1121]" to={`${baseUrl}/about`}>About</Link>
          <Link className="text-slate-600 transition hover:text-[#0B1121]" to={`${baseUrl}/contact`}>Contact</Link>
        </nav>
        <div className="flex items-center gap-2">{whatsappUrl ? <Button type="primary" style={{ backgroundColor: primaryColor, borderColor: primaryColor }} href={whatsappUrl} target="_blank" className="hidden sm:inline-flex">Order now</Button> : <Link to={`${baseUrl}/contact`} className="hidden text-sm font-medium sm:inline">Contact us</Link>}<Button aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} className="!flex !h-10 !w-10 !items-center !justify-center sm:!hidden" icon={mobileMenuOpen ? <CloseOutlined /> : <MenuOutlined />} onClick={() => setMobileMenuOpen((open) => !open)} /></div>
      </div>
      {mobileMenuOpen && <nav className="border-t border-slate-200 bg-white px-5 py-3 sm:hidden"><div className="mx-auto grid max-w-7xl gap-1"><Link className="px-3 py-3 text-sm font-medium text-slate-700" to={baseUrl} onClick={() => setMobileMenuOpen(false)}>Shop</Link><Link className="px-3 py-3 text-sm font-medium text-slate-700" to={`${baseUrl}/about`} onClick={() => setMobileMenuOpen(false)}>About</Link><Link className="px-3 py-3 text-sm font-medium text-slate-700" to={`${baseUrl}/contact`} onClick={() => setMobileMenuOpen(false)}>Contact</Link>{whatsappUrl && <Button type="primary" style={{ backgroundColor: primaryColor, borderColor: primaryColor }} href={whatsappUrl} target="_blank" className="mt-2">Order on WhatsApp</Button>}</div></nav>}
    </header>

    {section === 'about' ? <AboutPage store={store} baseUrl={baseUrl} primaryColor={primaryColor} /> : section === 'contact' ? <ContactPage store={store} baseUrl={baseUrl} primaryColor={primaryColor} actions={contactActions} /> : section === 'products' ? <ProductPage product={selectedProduct} store={store} baseUrl={baseUrl} actions={contactActions} /> : <HomePage store={store} products={products} sections={sections} testimonials={testimonials} baseUrl={baseUrl} actions={contactActions} primaryColor={primaryColor} />}

    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} {store.store_name}. All rights reserved.</span>
        <div className="flex gap-4"><Link to={`${baseUrl}/about`}>About</Link><Link to={`${baseUrl}/contact`}>Contact</Link></div>
      </div>
    </footer>
  </main>
}

function HomePage({ store, products, sections, testimonials, baseUrl, actions, primaryColor }: { store: Storefront; products: Product[]; sections: Section[]; testimonials: Testimonial[]; baseUrl: string; actions: React.ReactNode; primaryColor: string }) {
  const [query, setQuery] = useState('')
  const matches = products.filter((product) => `${product.name} ${product.category} ${product.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const featured = products.filter((product) => product.is_featured).slice(0, 8)
  const recent = [...products].sort((a, b) => +new Date(b.published_at ?? 0) - +new Date(a.published_at ?? 0)).slice(0, 8)
  const categories = [...new Set(products.map((product) => product.category || 'Products'))]
  return <>
    <section style={{ backgroundColor: primaryColor }} className="overflow-hidden text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7"><p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Welcome to {store.store_name}</p><h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{store.headline || 'Everything you need, from a store you can trust.'}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">{store.description || 'Browse our latest products and place your order directly with our team.'}</p><div className="mt-8">{actions}</div></div>
        <div className="relative min-h-64 overflow-hidden border border-white/20 bg-black/10 lg:col-span-5">{store.hero_image_urls?.[0] ? <img src={store.hero_image_urls[0]} alt="Storefront hero" className="absolute inset-0 h-full w-full object-cover opacity-80" /> : null}<div className="relative flex min-h-64 flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-7"><p className="text-sm text-slate-200">Available products</p><p className="mt-2 text-5xl font-semibold">{products.length}</p><p className="mt-3 text-sm text-slate-100">Carefully selected products, with current prices and availability.</p></div>{store.hero_image_urls?.[1] ? <img src={store.hero_image_urls[1]} alt="Storefront feature" className="absolute right-4 top-4 h-16 w-16 border-2 border-white object-cover shadow-lg" /> : null}</div>
      </div>
    </section>
    {store.trust_stats?.length ? <section className="border-b border-slate-200 bg-slate-50"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-200 px-5 sm:grid-cols-4">{store.trust_stats.map((stat, index) => <div key={`${stat.label}-${index}`} className="px-4 py-7 text-center"><p className="text-2xl font-semibold">{stat.value}</p><p className="mt-1 text-sm text-slate-500">{stat.label}</p></div>)}</div></section> : null}
    <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:py-20"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Catalogue</p><h2 className="mt-2 text-3xl font-semibold">Find what you need</h2></div><Input value={query} onChange={(event) => setQuery(event.target.value)} prefix={<SearchOutlined />} placeholder="Search products or categories" className="max-w-md" allowClear /></div>{products.length ? <>{query ? <ProductGrid products={matches} baseUrl={baseUrl} empty="No products match your search." /> : <><div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{categories.map((category) => <button key={category} onClick={() => setQuery(category)} className="border border-slate-200 px-4 py-4 text-left text-sm font-medium transition hover:border-slate-500">{category}</button>)}</div>{featured.length > 0 && <StorefrontCollection eyebrow="Popular picks" title="Featured products" products={featured} baseUrl={baseUrl} />}{recent.length > 0 && <StorefrontCollection eyebrow="Just in" title="Recently added" products={recent} baseUrl={baseUrl} />}{sections.map((item) => <CustomSection key={item.id} section={item} products={featured} testimonials={testimonials} baseUrl={baseUrl} primaryColor={primaryColor} />)}<StorefrontCollection eyebrow="Full catalogue" title="Shop all products" products={products} baseUrl={baseUrl} /></>}</> : <Empty description="No products have been published yet." />}</section>
  </>
}

function StorefrontCollection({ eyebrow, title, products, baseUrl }: { eyebrow: string; title: string; products: Product[]; baseUrl: string }) {
  return <section className="mb-16"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p><h2 className="mb-7 mt-2 text-3xl font-semibold">{title}</h2><ProductGrid products={products} baseUrl={baseUrl} empty="No products available." /></section>
}

function ProductGrid({ products, baseUrl, empty }: { products: Product[]; baseUrl: string; empty: string }) {
  return products.length ? <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} href={`${baseUrl}/products/${product.id}`} />)}</div> : <Empty description={empty} />
}

function CustomSection({ section, products, testimonials, baseUrl, primaryColor }: { section: Section; products: Product[]; testimonials: Testimonial[]; baseUrl: string; primaryColor: string }) {
  if (section.section_type === 'collection') return <StorefrontCollection eyebrow="Curated" title={section.title} products={products} baseUrl={baseUrl} />
  if (section.section_type === 'testimonials') return testimonials.length ? <section className="mb-16 border-y border-slate-200 py-14"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Customer stories</p><h2 className="mb-8 mt-2 text-3xl font-semibold">{section.title}</h2><div className="grid gap-4 md:grid-cols-3">{testimonials.slice(0, 6).map((item) => <article key={item.id} className="border border-slate-200 p-5"><div className="mb-4 flex gap-1 text-amber-500">{Array.from({ length: item.rating }).map((_, index) => <StarFilled key={index} />)}</div><p className="leading-7 text-slate-600">“{item.quote}”</p><p className="mt-5 font-semibold">{item.customer_name} {item.verified && <span className="text-xs font-medium text-emerald-700">· Verified customer</span>}</p>{item.customer_title && <p className="text-sm text-slate-500">{item.customer_title}</p>}</article>)}</div></section> : null
  return <section className="mb-16 overflow-hidden border border-slate-200"><div className="grid md:grid-cols-2">{section.image_url && <img src={section.image_url} alt="" className="h-full min-h-64 w-full object-cover" />}<div className="p-8 sm:p-12"><h2 className="text-3xl font-semibold">{section.title}</h2>{section.body && <p className="mt-4 whitespace-pre-line leading-7 text-slate-600">{section.body}</p>}{section.cta_label && section.cta_url && <a href={section.cta_url} style={{ backgroundColor: primaryColor }} className="mt-7 inline-block px-5 py-3 font-medium text-white">{section.cta_label}</a>}</div></div></section>
}

function AboutPage({ store, baseUrl, primaryColor }: { store: Storefront; baseUrl: string; primaryColor: string }) {
  return <><StorefrontPageHero store={store} baseUrl={baseUrl} title="About us" primaryColor={primaryColor} /><section className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-24"><h2 className="text-3xl font-semibold tracking-tight">{store.store_name}</h2><div style={{ borderColor: primaryColor }} className="mt-8 border-l-2 pl-6 text-lg leading-8 text-slate-600">{store.description || 'We are committed to serving our customers with quality products and dependable service.'}</div>{(store.vision || store.mission) && <div className="mt-12 grid gap-6 sm:grid-cols-2"><article className="border border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Vision</p><p className="mt-3 leading-7 text-slate-600">{store.vision}</p></article><article className="border border-slate-200 p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mission</p><p className="mt-3 leading-7 text-slate-600">{store.mission}</p></article></div>}{store.address && <div className="mt-12 flex items-start gap-3 border-t border-slate-200 pt-7"><EnvironmentOutlined className="mt-1" /><div><strong>Visit our store</strong><p className="mt-1 text-slate-600">{store.address}</p></div></div>}</section></>
}

function ContactPage({ store, baseUrl, primaryColor, actions }: { store: Storefront; baseUrl: string; primaryColor: string; actions: React.ReactNode }) {
  return <><StorefrontPageHero store={store} baseUrl={baseUrl} title="Contact" primaryColor={primaryColor} /><section className="mx-auto w-full max-w-4xl px-5 py-16 sm:py-24"><h2 className="text-3xl font-semibold tracking-tight">We are here to help.</h2><p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Contact {store.store_name} to ask about a product, confirm availability, or place an order.</p><div className="mt-10 border border-slate-200 p-7"><div className="grid gap-7 sm:grid-cols-2"><div><p className="text-sm font-medium text-slate-500">Phone</p><p className="mt-2 text-lg font-semibold">{store.phone || 'Contact details coming soon'}</p></div><div><p className="text-sm font-medium text-slate-500">Store address</p><p className="mt-2 text-lg font-semibold">{store.address || 'Address coming soon'}</p></div></div><div className="mt-8">{actions}</div></div></section></>
}

function StorefrontPageHero({ store, baseUrl, title, primaryColor }: { store: Storefront; baseUrl: string; title: string; primaryColor: string }) {
  const image = store.hero_image_urls?.[0]
  return <section style={{ backgroundColor: primaryColor }} className="relative isolate overflow-hidden text-white">{image && <img src={image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />}<div className="absolute inset-0 -z-10 bg-black/20" /><div className="mx-auto max-w-7xl px-5 py-14 sm:py-16"><nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-white/75"><Link to={baseUrl} className="transition hover:text-white">Home</Link><RightOutlined className="text-[10px]" /><span className="text-white">{title}</span></nav><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1></div></section>
}

function ProductPage({ product, store, baseUrl, actions }: { product?: Product; store: Storefront; baseUrl: string; actions: React.ReactNode }) {
  if (!product) return <section className="grid flex-1 place-items-center px-5 py-20"><Empty description="This product is unavailable."><Link to={baseUrl}><Button>Back to shop</Button></Link></Empty></section>
  const images = product.image_urls?.length ? product.image_urls : product.image_url ? [product.image_url] : []
  return <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:py-16"><Link to={baseUrl} className="text-sm font-medium text-slate-600"><ArrowLeftOutlined /> Back to shop</Link><div className="mt-8 grid gap-10 lg:grid-cols-2"><div className="aspect-square overflow-hidden bg-slate-100">{images[0] ? <img className="h-full w-full object-cover" src={images[0]} alt={product.name} /> : <div className="grid h-full place-items-center text-slate-400">No product image</div>}</div><div className="lg:py-8"><Tag className="!m-0">{product.category || 'Products'}</Tag><h1 className="mt-4 text-4xl font-semibold tracking-tight">{product.name}</h1><p className="mt-5 text-xl font-semibold">{formatNaira(product.price_kobo / 100)}</p><p className="mt-7 max-w-xl whitespace-pre-line leading-7 text-slate-600">{product.description || `${product.name} is available from ${store.store_name}. Contact us to confirm availability.`}</p>{images.length > 1 && <div className="mt-7 flex gap-3">{images.slice(1).map((image) => <img key={image} className="h-20 w-20 border border-slate-200 object-cover" src={image} alt={`${product.name} alternate view`} />)}</div>}<div className="mt-10">{actions}</div></div></div></section>
}

function ProductCard({ product, href }: { product: Product; href: string }) {
  const image = productImage(product)
  return <Link to={href} className="group block"><div className="aspect-square overflow-hidden bg-slate-100">{image ? <img className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" src={image} alt={product.name} /> : <div className="grid h-full place-items-center text-sm text-slate-400">No image</div>}</div><div className="pt-4"><Tag className="!m-0">{product.category || 'Products'}</Tag><div className="mt-2 flex items-start justify-between gap-3"><h3 className="font-semibold leading-6">{product.name}</h3><RightOutlined className="mt-1 text-xs text-slate-400 transition group-hover:translate-x-0.5" /></div><p className="mt-2 font-semibold">{formatNaira(product.price_kobo / 100)}</p></div></Link>
}
