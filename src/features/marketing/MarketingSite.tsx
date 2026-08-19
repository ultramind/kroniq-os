import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckOutlined,
  CloudSyncOutlined,
  MenuOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Button, Collapse, Drawer, Input, message } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const nav = [
  { label: 'Product', to: '/product' },
  { label: 'Solutions', to: '/solutions/retail' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Resources', to: '/help' },
]

const solutions = [
  {
    icon: <ShoppingCartOutlined />,
    title: 'Retail & supermarkets',
    body: 'Fast checkout, stock control, supplier deliveries, credit and profit reporting.',
    to: '/solutions/retail',
  },
  {
    icon: <ProjectOutlined />,
    title: 'Service businesses',
    body: 'Clients, contracts, stages, payments, expenses and invoices in one workspace.',
    to: '/solutions/services',
  },
  {
    icon: <ShopOutlined />,
    title: 'Hybrid businesses',
    body: 'One company can sell products and deliver services without running separate systems.',
    to: '/solutions/hybrid-business',
  },
]

const features = [
  {
    icon: <CloudSyncOutlined />,
    title: 'Keep selling, even offline',
    body: 'Checkout is designed to continue through weak connectivity and sync safely when the internet returns.',
  },
  {
    icon: <BarChartOutlined />,
    title: 'Know your numbers',
    body: 'See sales, cost, gross profit, expenses, credit and operational performance by period.',
  },
  {
    icon: <WalletOutlined />,
    title: 'Control cash and credit',
    body: 'Track shifts, cash variance, customer credit, deposits and partial repayments.',
  },
  {
    icon: <TeamOutlined />,
    title: 'Give staff the right access',
    body: 'Clear roles for cashiers, managers and administrators keep sensitive operations controlled.',
  },
  {
    icon: <ProjectOutlined />,
    title: 'Deliver service work clearly',
    body: 'Turn jobs into managed projects with clients, stages, team assignments and invoices.',
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: 'Built to grow with you',
    body: 'Organisation, stores, plans and entitlements prepare your business for the next stage.',
  },
]

const plans = [
  {
    name: 'Starter',
    price: 'For getting organised',
    features: [
      'Retail or service operations',
      'Core POS, inventory and flexible pricing',
      'Customer orders, expenses, credit and reports',
      'Secure staff roles',
    ],
  },
  {
    name: 'Growth',
    price: 'For growing businesses',
    featured: true,
    features: [
      'Everything in Starter',
      'Packs, warehouses and bulk imports',
      'Online storefront',
      'Logo, brand colour and content',
      'Service contracts and expanded limits',
    ],
  },
  {
    name: 'Scale',
    price: 'For larger operations',
    features: [
      'Everything in Growth',
      'Higher limits and operational controls',
      'Advanced reporting needs',
      'Priority implementation support',
    ],
  },
  {
    name: 'Kroniqos Plus',
    price: 'For tailored operations',
    features: [
      'Custom limits and rollout',
      'Multi-store planning',
      'Dedicated support and governance',
      'Custom commercial agreement',
    ],
  },
]

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="text-lg font-bold tracking-tight text-[#0B1121]">
            Kroniqos
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
            Business operations for the way African companies actually work.
          </p>
        </div>
        <div>
          <p className="font-semibold text-[#0B1121]">Product</p>
          <div className="mt-3 space-y-2 text-sm text-slate-500">
            <Link to="/product">Overview</Link>
            <Link to="/solutions/retail" className="block">
              Retail
            </Link>
            <Link to="/solutions/services" className="block">
              Services
            </Link>
            <Link to="/pricing" className="block">
              Pricing
            </Link>
          </div>
        </div>
        <div>
          <p className="font-semibold text-[#0B1121]">Company</p>
          <div className="mt-3 space-y-2 text-sm text-slate-500">
            <Link to="/about">About</Link>
            <Link to="/contact" className="block">
              Contact
            </Link>
            <Link to="/status" className="block">
              System status
            </Link>
          </div>
        </div>
        <div>
          <p className="font-semibold text-[#0B1121]">Legal & help</p>
          <div className="mt-3 space-y-2 text-sm text-slate-500">
            <Link to="/help">Help centre</Link>
            <Link to="/privacy" className="block">
              Privacy
            </Link>
            <Link to="/terms" className="block">
              Terms
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-slate-100 px-5 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Kroniqos · Powered by AltraMorph Technologies
      </div>
    </footer>
  )
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_right,_#e8edf7,_transparent_36%),linear-gradient(#0B112108_1px,_transparent_1px),linear-gradient(90deg,#0B112108_1px,_transparent_1px)] bg-[size:auto,30px_30px,30px_30px]">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[#0B1121] sm:text-6xl">
          {title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">{body}</p>
      </div>
    </section>
  )
}

function Home() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200 bg-[radial-gradient(circle_at_80%_20%,_#e3e9f4,_transparent_28%),linear-gradient(#0B112108_1px,_transparent_1px),linear-gradient(90deg,#0B112108_1px,_transparent_1px)] bg-[size:auto,34px_34px,34px_34px]">
        <div className="mx-auto grid min-h-[620px] max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-28">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">
              Kroniqos business operations
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-.055em] text-[#0B1121] sm:text-7xl">
              Run your business. <span className="text-slate-500">Know every move.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">
              One calm, dependable workspace for retail, service work, inventory, cash, customer credit and
              online selling.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register">
                <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPosition="end">
                  Start your business
                </Button>
              </Link>
              <Link to="/product">
                <Button size="large">Explore the product</Button>
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500">
              Built for real business conditions, including unreliable connectivity.
            </p>
          </div>
          <div className="relative">
            <div className="border border-slate-200 bg-white p-4 shadow-[0_26px_70px_rgb(11_17_33_/_14%)]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-slate-500">
                    Today at a glance
                  </p>
                  <p className="mb-0 mt-1 text-lg font-semibold text-[#0B1121]">Business dashboard</p>
                </div>
                <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                  Live operations
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="border border-slate-200 p-4">
                  <p className="m-0 text-xs text-slate-500">Sales today</p>
                  <p className="mb-0 mt-2 text-2xl font-semibold text-[#0B1121]">₦284,500</p>
                </div>
                <div className="border border-slate-200 p-4">
                  <p className="m-0 text-xs text-slate-500">Pending credit</p>
                  <p className="mb-0 mt-2 text-2xl font-semibold text-[#0B1121]">₦56,200</p>
                </div>
              </div>
              <div className="mt-3 border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0B1121]">Operational movement</span>
                  <span className="text-xs text-slate-500">This month</span>
                </div>
                <div className="mt-6 flex h-24 items-end gap-2">
                  {[42, 68, 50, 82, 60, 94, 76].map((height, index) => (
                    <div
                      key={index}
                      className="flex-1 bg-[#0B1121]"
                      style={{ height: `${height}%`, opacity: 0.35 + index / 12 }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border border-slate-200 p-4">
                <div>
                  <p className="m-0 font-semibold text-[#0B1121]">Offline-ready checkout</p>
                  <p className="mb-0 mt-1 text-sm text-slate-500">0 sales waiting to sync</p>
                </div>
                <CloudSyncOutlined className="text-xl text-emerald-600" />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Built around the work</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0B1121] sm:text-4xl">
            One platform. The operations your business needs.
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {solutions.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              className="group border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-slate-400 hover:shadow-lg"
            >
              <span className="grid h-11 w-11 place-items-center bg-[#0B1121] text-lg text-white">
                {item.icon}
              </span>
              <h3 className="mt-6 text-lg font-semibold text-[#0B1121]">{item.title}</h3>
              <p className="mb-0 mt-2 leading-6 text-slate-500">{item.body}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#0B1121]">
                Learn more <ArrowRightOutlined className="transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">
                Designed for clarity
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0B1121] sm:text-4xl">
                The right detail, without the daily chaos.
              </h2>
              <p className="mt-5 leading-7 text-slate-600">
                Kroniqos gives each person the views and actions they need—from a cashier working a
                touchscreen till to an owner reviewing profit, projects and growth.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {features.map((item) => (
                <div key={item.title} className="border border-slate-200 bg-white p-5">
                  <span className="text-xl text-[#0B1121]">{item.icon}</span>
                  <h3 className="mt-4 font-semibold text-[#0B1121]">{item.title}</h3>
                  <p className="mb-0 mt-2 text-sm leading-6 text-slate-500">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#0B1121] sm:text-4xl">
              Start with your business, not a complicated setup.
            </h2>
          </div>
          <div className="space-y-5">
            {[
              'Create your company account and choose retail, services, or both.',
              'Set up your store, products or service catalogue, staff and settings.',
              'Start selling, managing work and understanding your numbers.',
            ].map((step, index) => (
              <div key={step} className="flex gap-4 border-b border-slate-200 pb-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center bg-[#0B1121] text-sm font-bold text-white">
                  0{index + 1}
                </span>
                <p className="m-0 pt-1 text-lg text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-[#0B1121]">
        <div className="mx-auto max-w-7xl px-5 py-20 text-white sm:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Ready when you are</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
              Bring clarity to every part of your business.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
              Set up your company, invite your team, and begin with the module that matters most today.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register">
                <Button size="large" className="!border-white !bg-white !text-[#0B1121]">
                  Create your business
                </Button>
              </Link>
              <Link to="/contact">
                <Button size="large" className="!border-slate-600 !bg-transparent !text-white">
                  Talk to us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function ProductPage() {
  return (
    <>
      <PageIntro
        eyebrow="Product"
        title="One operating system for your business."
        body="Start at the till, in the stock room, with a client project, or on your public storefront. Kroniqos keeps the business connected."
      />
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="border border-slate-200 p-6">
              <span className="text-xl text-[#0B1121]">{feature.icon}</span>
              <h2 className="mt-5 text-lg font-semibold text-[#0B1121]">{feature.title}</h2>
              <p className="mb-0 mt-2 leading-6 text-slate-500">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
function SolutionPage({ kind }: { kind: 'retail' | 'services' | 'hybrid' }) {
  const copy =
    kind === 'retail'
      ? [
          'Retail that keeps moving.',
          'A touch-friendly point of sale for sales, stock, deliveries, cash shifts, customer credit and profit.',
        ]
      : kind === 'services'
        ? [
            'Service work without losing the details.',
            'Capture the client, contract, payment, progress, team work and invoice in one organised project record.',
          ]
        : [
            'For businesses that do more than one thing.',
            'Sell products and deliver services from one company workspace, with a dashboard that adapts to both operations.',
          ]
  const items =
    kind === 'retail'
      ? [
          'Offline-ready checkout',
          'Barcode and quantity entry',
          'Supplier deliveries and cost changes',
          'Stock count, adjustments and low-stock alerts',
          'Credit register and partial repayments',
          'Profit, sales and expense reporting',
        ]
      : kind === 'services'
        ? [
            'Service catalogue and optional benchmark pricing',
            'Client records and contract/project wizard',
            'Project dates and PDF attachments',
            'Stages, comments and optional WhatsApp updates',
            'Payments, deposits, expenses and assigned staff',
            'Tenant-branded invoice with payment breakdown',
          ]
        : [
            'Choose retail, services or both on company setup',
            'Separate operational menus with one tenant account',
            'Retail sales and service revenue in the same business picture',
            'Shared staff, expenses, customer and company settings',
            'Optional Growth-plan public storefront for products',
            'One plan, one organisation, flexible business modes',
          ]
  return (
    <>
      <PageIntro eyebrow={`Solutions · ${kind}`} title={copy[0]} body={copy[1]} />
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item} className="flex gap-3 border border-slate-200 p-5">
              <CheckOutlined className="mt-1 text-sm text-[#0B1121]" />
              <span className="leading-6 text-slate-700">{item}</span>
            </div>
          ))}
        </div>
        <div className="mt-10">
          <Link to="/register">
            <Button type="primary" size="large">
              Start your business
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}
function PricingPage() {
  return (
    <>
      <PageIntro
        eyebrow="Pricing"
        title="Choose the tools your business needs now."
        body="Begin with the operational foundation. Move up when online selling, branding, higher limits or tailored support become important."
      />
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative border p-6 ${plan.featured ? 'border-[#0B1121] bg-[#0B1121] text-white shadow-xl' : 'border-slate-200 bg-white'}`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-5 bg-white px-2 py-1 text-xs font-bold text-[#0B1121]">
                  Recommended
                </span>
              )}
              <h2 className="text-xl font-semibold">{plan.name}</h2>
              <p className={`mt-2 text-sm ${plan.featured ? 'text-slate-300' : 'text-slate-500'}`}>
                {plan.price}
              </p>
              <div className={`my-6 border-t ${plan.featured ? 'border-slate-700' : 'border-slate-200'}`} />{' '}
              <details className="group">
                <summary
                  className={`cursor-pointer list-none text-sm font-medium ${plan.featured ? 'text-white' : 'text-[#0B1121]'}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    Included features ({plan.features.length})
                    <span className="transition-transform duration-200 group-open:rotate-45">+</span>
                  </span>
                </summary>
                <ul className="mt-4 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex gap-2 text-sm ${plan.featured ? 'text-slate-200' : 'text-slate-600'}`}
                    >
                      <CheckOutlined className="mt-1" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </details>
              <Link className="mt-8 block" to="/register">
                <Button
                  size="large"
                  block
                  className={plan.featured ? '!border-white !bg-white !text-[#0B1121]' : ''}
                >
                  Get started
                </Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Final prices and plan limits are managed by Kroniqos platform administration. Contact us for an
          implementation plan.
        </p>
      </section>
    </>
  )
}
function SimplePage({ type }: { type: string }) {
  const content: Record<string, [string, string, string[]]> = {
    about: [
      'About Kroniqos',
      'We are building practical business infrastructure for companies doing real work every day.',
      [
        'Kroniqos is focused on operational clarity, not unnecessary complexity.',
        'We design around local realities: cash, transfers, credit, offline conditions, stock movement and service delivery.',
        'The platform is powered by AltraMorph Technologies.',
      ],
    ],
    contact: [
      'Talk to the Kroniqos team',
      'Tell us about your business, your operations, and where you want to grow.',
      [
        'For product demonstrations, onboarding support or partnerships, use the form below. We will respond using the contact details you provide.',
      ],
    ],
    help: [
      'Help centre',
      'Practical guidance for setting up and operating Kroniqos.',
      [
        'Company onboarding and staff access',
        'Checkout, held sales and offline sync',
        'Products, inventory, deliveries and stock counts',
        'Customer credit, expenses and reports',
        'Service projects, invoices and storefront settings',
      ],
    ],
    privacy: [
      'Privacy',
      'How Kroniqos handles organisation, staff, customer and operational information.',
      [
        'Tenant data is separated by organisation and protected by server access controls.',
        'Your business should only collect customer information needed for a legitimate operational purpose.',
        'A full production privacy policy and data-retention schedule should be published before public SaaS launch.',
      ],
    ],
    terms: [
      'Terms of use',
      'Terms governing use of the Kroniqos platform.',
      [
        'Your organisation is responsible for the accuracy of records entered by its staff.',
        'Subscription access and feature availability are governed by the selected plan.',
        'A final legal terms document should be reviewed by qualified counsel before public launch.',
      ],
    ],
    status: [
      'System status',
      'Current service communications and scheduled maintenance notices.',
      [
        'Kroniqos status is managed by the platform team.',
        'Active incidents and upcoming maintenance should be published here as they occur.',
        'For account-specific support, contact your company administrator or Kroniqos support.',
      ],
    ],
  }
  const [title, body, points] = content[type] ?? content.about
  const [api, holder] = message.useMessage()
  return (
    <>
      <PageIntro eyebrow="Kroniqos" title={title} body={body} />
      <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        {holder}
        {type === 'contact' && (
          <div className="mb-10 border border-slate-200 p-6">
            <Input className="mb-3" placeholder="Your name" />
            <Input className="mb-3" placeholder="Work email" />
            <Input.TextArea rows={4} placeholder="How can we help?" />
            <Button
              className="mt-3"
              type="primary"
              onClick={() => api.success('Thanks — your enquiry has been captured for follow-up.')}
            >
              Send enquiry
            </Button>
          </div>
        )}
        <div className="space-y-4">
          {points.map((point) => (
            <div key={point} className="flex gap-3 border-b border-slate-200 pb-4">
              <CheckOutlined className="mt-1 text-[#0B1121]" />
              <p className="m-0 leading-7 text-slate-600">{point}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export function MarketingSite() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('.marketing-site section'))
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.marketing-site section .group, .marketing-site section .border.border-slate-200',
      ),
    )
    sections.forEach((section) => section.classList.add('marketing-reveal'))
    cards.forEach((card, index) => {
      card.classList.add('marketing-card-reveal')
      card.style.transitionDelay = `${(index % 4) * 70}ms`
    })
    const revealTargets = [...sections, ...cards]
    if (!('IntersectionObserver' in window)) {
      revealTargets.forEach((target) => target.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }),
      { threshold: 0.12, rootMargin: '0px 0px -48px 0px' },
    )
    revealTargets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [pathname])
  const body =
    pathname === '/' ? (
      <Home />
    ) : pathname === '/product' ? (
      <ProductPage />
    ) : pathname === '/pricing' ? (
      <PricingPage />
    ) : pathname === '/solutions/retail' ? (
      <SolutionPage kind="retail" />
    ) : pathname === '/solutions/services' ? (
      <SolutionPage kind="services" />
    ) : pathname === '/solutions/hybrid-business' ? (
      <SolutionPage kind="hybrid" />
    ) : (
      <SimplePage type={pathname.slice(1) || 'about'} />
    )
  return (
    <main className="marketing-site min-h-screen bg-white text-[#0B1121]">
      <header className="marketing-header sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="text-lg font-bold tracking-tight text-[#0B1121]">
            Kroniqos
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className="transition hover:text-[#0B1121]">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button type="text" onClick={() => navigate('/login')}>
              Sign in
            </Button>
            <Button type="primary" onClick={() => navigate('/register')}>
              Start free
            </Button>
          </div>
          <Button
            className="md:hidden"
            aria-label="Open menu"
            icon={<MenuOutlined />}
            onClick={() => setOpen(true)}
          />
        </div>
      </header>
      {body}
      <Footer />
      <Drawer title="Kroniqos" placement="right" open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="border-b border-slate-100 py-3 font-medium text-[#0B1121]"
            >
              {item.label}
            </Link>
          ))}
          <Button
            onClick={() => {
              setOpen(false)
              navigate('/login')
            }}
          >
            Sign in
          </Button>
          <Button
            type="primary"
            onClick={() => {
              setOpen(false)
              navigate('/register')
            }}
          >
            Start free
          </Button>
        </div>
      </Drawer>
    </main>
  )
}
