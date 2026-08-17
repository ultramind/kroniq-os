import {
  AppstoreOutlined,
  BarChartOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileSearchOutlined,
  FundOutlined,
  InboxOutlined,
  LogoutOutlined,
  MoneyCollectOutlined,
  PieChartOutlined,
  SettingOutlined,
  ToolOutlined,
  MenuOutlined,
  MoonOutlined,
  MoreOutlined,
  ShoppingCartOutlined,
  SunOutlined,
  TeamOutlined,
  TruckOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Tag, Tooltip, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../supabase'
import type { Role } from '../types'
import { usePosStore } from '../store'
import { useTheme } from './theme'

const { Header, Content, Footer, Sider } = Layout
const { Text } = Typography

type Props = {
  role: Role
  pendingSync: number
  syncError?: string
  onRetrySync?: () => void
  onReloadCatalogue?: () => void
  children: React.ReactNode
}

export function AppShell({ role, pendingSync, syncError, onRetrySync, onReloadCatalogue, children }: Props) {
  const navigate = useNavigate()
  const { pathname, hash, search } = useLocation()
  const { mode, toggleTheme } = useTheme()
  const cartItemCount = usePosStore((state) => state.cart.reduce((count, item) => count + item.quantity, 0))
  const [collapsed, setCollapsed] = useState(true)
  const [businessModes, setBusinessModes] = useState<string[]>(['retail'])
  const [userName, setUserName] = useState('Account')
  const [tenantBrand, setTenantBrand] = useState({ name: 'Kroniqos', logoUrl: '' })
  useEffect(() => {
    if (!supabase) return
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id, full_name').eq('id', user.id).maybeSingle()
        : { data: null }
      if (profile?.full_name) setUserName(profile.full_name)
      else if (user?.email) setUserName(user.email)
      if (!profile) return
      const [{ data: store }, { data: brand }] = await Promise.all([
        supabase.from('stores').select('organization_id').eq('id', profile.store_id).maybeSingle(),
        supabase.rpc('current_store_invoice_brand').maybeSingle(),
      ])
      const invoiceBrand = brand as { company_name?: string; logo_url?: string } | null
      if (invoiceBrand?.company_name)
        setTenantBrand({ name: invoiceBrand.company_name, logoUrl: invoiceBrand.logo_url ?? '' })
      if (!store) return
      const { data: organization } = await supabase
        .from('organizations')
        .select('business_modes,name')
        .eq('id', store.organization_id)
        .maybeSingle()
      if (organization?.business_modes?.length) setBusinessModes(organization.business_modes)
      if (organization?.name && !invoiceBrand?.company_name)
        setTenantBrand((current) => ({ ...current, name: organization.name }))
    })()
  }, [])
  const retailEnabled = businessModes.includes('retail')
  const servicesEnabled = businessModes.includes('services')
  const activeKey =
    hash === '#audit'
      ? 'audit'
      : pathname === '/' || pathname.startsWith('/summary')
        ? 'dashboard'
        : pathname.startsWith('/staff')
          ? 'staff'
          : pathname.startsWith('/shifts')
            ? 'shifts'
            : pathname.startsWith('/reports')
              ? 'reports'
              : pathname.startsWith('/credits')
                ? 'credits'
                : pathname.startsWith('/expenses')
                  ? 'expenses'
                  : pathname.startsWith('/products')
                    ? 'products'
                    : pathname.startsWith('/deliveries')
                      ? 'deliveries'
                      : pathname.startsWith('/warehouses')
                        ? 'warehouses'
                        : pathname.startsWith('/sales')
                          ? 'sales'
                          : pathname.startsWith('/inventory')
                            ? 'inventory'
                            : pathname.startsWith('/services')
                              ? 'services'
                              : pathname.startsWith('/settings')
                                ? 'settings'
                                : 'checkout'
  const title =
    activeKey === 'dashboard'
      ? 'Dashboard'
      : activeKey === 'audit'
        ? 'Audit log'
        : activeKey === 'staff'
          ? 'Staff management'
          : activeKey === 'shifts'
            ? 'Cash shifts'
            : activeKey === 'reports'
              ? 'Profit reports'
              : activeKey === 'credits'
                ? 'Customer credit'
                : activeKey === 'expenses'
                  ? 'Expenses'
                  : activeKey === 'products'
                    ? 'Products'
                    : activeKey === 'deliveries'
                      ? 'Supplier deliveries'
                      : activeKey === 'warehouses'
                        ? 'Warehouses'
                        : activeKey === 'sales'
                          ? 'Sales'
                          : activeKey === 'inventory'
                            ? 'Inventory'
                            : activeKey === 'services'
                              ? 'Service jobs'
                              : activeKey === 'settings'
                                ? 'Settings'
                                : 'Checkout'
  const menuItems = [
    { key: 'dashboard', icon: <PieChartOutlined />, label: 'Dashboard' },
    ...(retailEnabled
      ? [
          {
            key: 'pos',
            icon: <ShoppingCartOutlined />,
            label: 'Point of sale',
            children: [
              { key: 'checkout', icon: <ShoppingCartOutlined />, label: 'Checkout' },
              { key: 'shifts', icon: <DollarOutlined />, label: 'Cash shifts' },
              { key: 'sales', icon: <BarChartOutlined />, label: 'Sales' },
              ...(role !== 'cashier'
                ? [{ key: 'credits', icon: <WalletOutlined />, label: 'Customer credit' }]
                : []),
            ],
          },
        ]
      : []),
    ...(servicesEnabled ? [{ key: 'services', icon: <ToolOutlined />, label: 'Services' }] : []),
    ...(retailEnabled && role !== 'cashier'
      ? [
          {
            key: 'catalogue',
            icon: <AppstoreOutlined />,
            label: 'Catalogue & stock',
            children: [
              { key: 'products', icon: <AppstoreOutlined />, label: 'Products' },
              { key: 'inventory', icon: <InboxOutlined />, label: 'Inventory' },
              { key: 'deliveries', icon: <TruckOutlined />, label: 'Deliveries' },
              { key: 'warehouses', icon: <DatabaseOutlined />, label: 'Warehouses' },
            ],
          },
          {
            key: 'finance',
            icon: <MoneyCollectOutlined />,
            label: 'Finance',
            children: [
              { key: 'expenses', icon: <MoneyCollectOutlined />, label: 'Expenses' },
              ...(role === 'admin'
                ? [{ key: 'reports', icon: <FundOutlined />, label: 'Profit reports' }]
                : []),
            ],
          },
        ]
      : retailEnabled
        ? [
            {
              key: 'stock',
              icon: <InboxOutlined />,
              label: 'Stock',
              children: [{ key: 'inventory', icon: <InboxOutlined />, label: 'Inventory' }],
            },
          ]
        : []),
    ...(!retailEnabled && servicesEnabled && role !== 'cashier'
      ? [
          {
            key: 'finance',
            icon: <MoneyCollectOutlined />,
            label: 'Finance',
            children: [{ key: 'expenses', icon: <MoneyCollectOutlined />, label: 'Expenses' }],
          },
        ]
      : []),
    ...(role === 'admin'
      ? [
          {
            key: 'admin',
            icon: <SettingOutlined />,
            label: 'Administration',
            children: [
              { key: 'staff', icon: <TeamOutlined />, label: 'Staff' },
              { key: 'audit', icon: <FileSearchOutlined />, label: 'Audit log' },
              { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
            ],
          },
        ]
      : []),
  ]
  const activeGroup = ['checkout', 'shifts', 'sales', 'credits'].includes(activeKey)
    ? 'pos'
    : ['products', 'inventory', 'deliveries', 'warehouses'].includes(activeKey)
      ? role === 'cashier'
        ? 'stock'
        : 'catalogue'
      : ['expenses', 'reports'].includes(activeKey)
        ? 'finance'
        : ['staff', 'audit', 'settings'].includes(activeKey)
          ? 'admin'
          : undefined
  const [openKeys, setOpenKeys] = useState<string[]>(activeGroup ? [activeGroup] : [])
  useEffect(() => {
    setOpenKeys(activeGroup ? [activeGroup] : [])
  }, [activeGroup])
  const mobileItems = [
    { key: 'dashboard', label: 'Home', icon: <PieChartOutlined /> },
    ...(retailEnabled ? [{ key: 'checkout', label: 'Checkout', icon: <ShoppingCartOutlined /> }] : []),
    { key: 'more', label: 'Menu', icon: <MenuOutlined /> },
    ...(retailEnabled
      ? [{ key: 'cart', label: 'Cart', icon: <ShoppingCartOutlined />, badge: cartItemCount }]
      : []),
    ...(servicesEnabled ? [{ key: 'services', label: 'Projects', icon: <ToolOutlined /> }] : []),
    ...(retailEnabled
      ? [{ key: 'sales', label: 'Sales', icon: <BarChartOutlined /> }]
      : !servicesEnabled || role === 'cashier'
        ? []
        : [{ key: 'expenses', label: 'Expenses', icon: <MoneyCollectOutlined /> }]),
  ]

  return (
    <Layout className="app-shell min-h-screen">
      <Sider
        collapsible
        collapsed={collapsed}
        collapsedWidth="0"
        width={236}
        onCollapse={setCollapsed}
        theme={mode === 'dark' ? 'dark' : 'light'}
        className="app-sider fixed bottom-0 left-0 top-0 z-30"
      >
        <div className="px-5 py-7">
          <div className="flex min-w-0 items-center gap-3">
            {tenantBrand.logoUrl ? (
              <img src={tenantBrand.logoUrl} alt="" className="h-8 w-8 shrink-0 object-contain" />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center bg-[#0B1121] text-xs font-bold text-white">
                {tenantBrand.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <Text className="brand-wordmark truncate font-bold">{tenantBrand.name}</Text>
          </div>
          <p className="brand-subtitle mb-0 mt-1 text-sm">Business operations</p>
        </div>
        <Menu
          theme={mode === 'dark' ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[activeKey]}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => setOpenKeys(collapsed ? [] : keys)}
          className="!border-0 !bg-transparent"
          items={menuItems}
          onClick={({ key }) => {
            setOpenKeys([])
            setCollapsed(true)
            navigate(key === 'dashboard' ? '/' : key === 'audit' ? '/settings#audit' : `/${key}`)
          }}
        />
      </Sider>
      {!collapsed && (
        <button
          type="button"
          className="mobile-menu-dismiss md:hidden"
          aria-label="Close navigation menu"
          onClick={() => setCollapsed(true)}
        />
      )}
      <Layout
        className="transition-[margin,width] duration-200 ease-out"
        style={{
          marginLeft: collapsed ? 0 : 236,
          width: collapsed ? '100%' : 'calc(100% - 236px)',
        }}
      >
        <Header
          className="app-header fixed right-0 top-0 z-20 !h-auto px-4 py-2 transition-[left] duration-200 ease-out md:px-8"
          style={{ left: collapsed ? 0 : 236 }}
        >
          <div className="mx-auto flex min-h-[44px] max-w-7xl flex-nowrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="mb-0 truncate text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Tag
                color={syncError ? 'error' : supabaseConfigured ? 'green' : 'gold'}
                className="!m-0 flex !h-9 items-center rounded-full !border-0 !px-2.5 !text-xs !font-medium shadow-sm"
              >
                <CloudSyncOutlined />{' '}
                <span className="ml-1 hidden md:inline">
                  {syncError ? 'Sync needs attention' : supabaseConfigured ? 'Offline-first' : 'Demo mode'}{' '}
                  ·{' '}
                </span>
                {pendingSync} pending
              </Tag>
              <div className="hidden items-center rounded-full border border-slate-200 bg-white p-0.5 shadow-sm md:flex">
                <Avatar size={30} icon={<UserOutlined />} className="!bg-[#173a28] !text-emerald-100" />
                <span className="mx-2 text-xs font-semibold capitalize text-slate-700">{role}</span>
              </div>
              <Tooltip title={mode === 'dark' ? 'Use light theme' : 'Use dark theme'}>
                <Button
                  aria-label="Toggle colour theme"
                  className="theme-toggle !flex !h-9 !w-9 !items-center !justify-center !rounded-full"
                  icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                  onClick={toggleTheme}
                />
              </Tooltip>
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                dropdownRender={() => (
                  <div className="mobile-account-dropdown">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <p className="mb-0 max-w-48 truncate text-sm font-semibold">{userName}</p>
                      <p className="mb-0 mt-0.5 text-xs capitalize text-slate-500">{role}</p>
                    </div>
                    {supabaseConfigured && (
                      <Button
                        danger
                        type="text"
                        block
                        className="!mt-1 !flex !h-10 !items-center !justify-start !px-3"
                        icon={<LogoutOutlined />}
                        onClick={() => void supabase?.auth.signOut()}
                      >
                        Sign out
                      </Button>
                    )}
                  </div>
                )}
              >
                <Button
                  aria-label="Account menu"
                  className="!flex !h-9 !w-9 !items-center !justify-center !rounded-full md:!hidden"
                  icon={<MoreOutlined />}
                />
              </Dropdown>
              {supabaseConfigured && (
                <Tooltip title="Sign out">
                  <Button
                    aria-label="Sign out"
                    className="hidden !h-9 !w-9 !items-center !justify-center !rounded-full !border-slate-200 !text-slate-600 hover:!border-red-200 hover:!text-red-600 md:!flex"
                    icon={<LogoutOutlined />}
                    onClick={() => void supabase?.auth.signOut()}
                  />
                </Tooltip>
              )}
            </div>
          </div>
        </Header>
        <div className="pt-24 md:pt-20">
          {syncError && (
            <div className="flex flex-wrap items-center gap-3 bg-red-50 px-4 py-2 text-sm text-red-700 md:px-8">
              <span>Sync needs attention: {syncError}</span>
              {onRetrySync && (
                <Button size="small" type="primary" onClick={onRetrySync}>
                  Retry sync
                </Button>
              )}
              {onReloadCatalogue && (
                <Button size="small" onClick={onReloadCatalogue}>
                  Reload catalogue
                </Button>
              )}
            </div>
          )}
          <Content className="px-4 pb-24 pt-6 md:px-8 md:py-6">{children}</Content>
        </div>
        <Footer className="app-footer px-4 py-4 text-center text-xs md:px-8">
          Copyright © {new Date().getFullYear()} · Powered by AltraMorph Technologies
        </Footer>
      </Layout>
      <nav className="mobile-bottom-nav md:hidden" aria-label="Mobile navigation">
        {mobileItems.map((item) => {
          const selected =
            item.key === 'more'
              ? !collapsed
              : item.key === 'cart'
                ? pathname === '/checkout' && new URLSearchParams(search).has('cart')
                : activeKey === item.key
          return (
            <button
              key={item.key}
              type="button"
              className={selected ? 'is-active' : ''}
              onClick={() => {
                if (item.key === 'more') {
                  setCollapsed(false)
                  return
                }
                navigate(
                  item.key === 'dashboard' ? '/' : item.key === 'cart' ? '/checkout?cart=1' : `/${item.key}`,
                )
                setCollapsed(true)
              }}
            >
              <span className="mobile-bottom-nav-icon">
                {item.badge ? (
                  <Badge count={item.badge} size="small">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </Layout>
  )
}
