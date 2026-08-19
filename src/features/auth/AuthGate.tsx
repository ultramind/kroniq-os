import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Space, Typography, message } from 'antd'
import { CloudSyncOutlined } from '@ant-design/icons'
import { supabase, supabaseConfigured } from '../../supabase'
import type { Role } from '../../types'
import { App } from '../../app/App'
import { Login } from './Login'
import { OrganizationOnboarding } from './OrganizationOnboarding'
import { CompanyRegistration } from './CompanyRegistration'
import { clearLocalPosDataForNewTenant } from '../../db'
import { PlatformAccessDenied, PlatformApp } from '../platform/PlatformApp'
import { BillingPanel } from '../billing/BillingPanel'
import { MarketingSite } from '../marketing/MarketingSite'
import { StorefrontPage } from '../../pages/StorefrontPage'
import { CompanyWorkspacePicker, type CompanyWorkspace } from './CompanyWorkspacePicker'
import { useTheme } from '../../app/theme'
import { pullProducts } from '../../sync'
import { clearOfflineWorkspace, getOfflineWorkspace, saveOfflineWorkspace } from '../../lib/offlineWorkspace'
import { initials } from '../../lib/initials'

export function AuthGate() {
  const { mode } = useTheme()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const platformRoute = pathname.startsWith('/platform')
  const publicStorefrontRoute = pathname.startsWith('/shop/')
  const publicMarketingRoute =
    pathname === '/' ||
    pathname === '/product' ||
    pathname === '/pricing' ||
    pathname === '/about' ||
    pathname === '/contact' ||
    pathname === '/help' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/status' ||
    pathname.startsWith('/solutions/')
  const [state, setState] = useState<{
    loading: boolean
    unauthenticated?: boolean
    startupError?: string
    onboarding?: boolean
    registering?: boolean
    platformAdmin?: boolean
    platformDenied?: boolean
    billingBlocked?: boolean
    role?: Role
    staffName?: string
    tenantName?: string
    tenantLogoUrl?: string
    workspaceChoices?: CompanyWorkspace[]
    selectingWorkspaceId?: string
    workspaceError?: string
  }>({ loading: true })
  const wasUnauthenticated = useRef(false)
  async function selectWorkspace(workspace: CompanyWorkspace) {
    if (!supabase) return
    setState((current) => ({
      ...current,
      selectingWorkspaceId: workspace.organizationId,
      workspaceError: undefined,
    }))
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.rpc('activate_organization_workspace', {
      p_organization_id: workspace.organizationId,
    })
    if (error) {
      setState((current) => ({ ...current, selectingWorkspaceId: undefined, workspaceError: error.message }))
      return
    }
    const cachedWorkspace = getOfflineWorkspace(user.id)
    if (cachedWorkspace?.organizationId && cachedWorkspace.organizationId !== workspace.organizationId)
      await clearLocalPosDataForNewTenant()
    sessionStorage.setItem(`kroniq-active-organization:${user.id}`, workspace.organizationId)
    window.location.reload()
  }
  useEffect(() => {
    if (publicStorefrontRoute) {
      setState({ loading: false })
      return
    }
    if (!supabase) {
      setState({ loading: false })
      return
    }
    const client = supabase
    const load = async (redirectToDefault = false) => {
      const within = async <T,>(request: PromiseLike<T>, label: string): Promise<T> =>
        await Promise.race([
          request,
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () => reject(new Error(`${label} timed out. Check your connection and try again.`)),
              15000,
            ),
          ),
        ])
      try {
        const {
          data: { session },
        } = await within(client.auth.getSession(), 'Session check')
        if (!session) {
          wasUnauthenticated.current = true
          clearOfflineWorkspace()
          setState({ loading: false, unauthenticated: true })
          return
        }
        const cachedWorkspace = getOfflineWorkspace(session.user.id)
        if (cachedWorkspace?.tenantName)
          setState((current) => ({
            ...current,
            tenantName: cachedWorkspace.tenantName,
            tenantLogoUrl: cachedWorkspace.tenantLogoUrl,
          }))
        if (platformRoute) {
          const { data: membership } = await within(
            client.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
            'Platform access check',
          )
          setState({ loading: false, platformAdmin: Boolean(membership), platformDenied: !membership })
          return
        }
        if (!navigator.onLine) {
          if (cachedWorkspace) {
            setState({
              loading: false,
              role: cachedWorkspace.role,
              staffName: cachedWorkspace.staffName,
              tenantName: cachedWorkspace.tenantName,
              tenantLogoUrl: cachedWorkspace.tenantLogoUrl,
            })
            return
          }
          setState({
            loading: false,
            startupError: 'This device must sign in online once before it can open the offline checkout.',
          })
          return
        }
        const { data: memberships, error: membershipsError } = await within(
          client.rpc('current_user_memberships'),
          'Company access check',
        )
        if (membershipsError) {
          setState({ loading: false, startupError: membershipsError.message })
          return
        }
        const workspaces = (
          (memberships ?? []) as Array<{
            organization_id: string
            organization_name: string
            role: Role
            status: string
          }>
        )
          .filter((membership) => membership.status === 'active')
          .map((membership) => ({
            organizationId: membership.organization_id,
            organizationName: membership.organization_name,
            role: membership.role,
          }))
        if (!workspaces.length) {
          setState({ loading: false, onboarding: true })
          return
        }
        const workspaceKey = `kroniq-active-organization:${session.user.id}`
        let activeWorkspace = workspaces.find(
          (workspace) => workspace.organizationId === sessionStorage.getItem(workspaceKey),
        )
        if (!activeWorkspace && workspaces.length > 1) {
          setState({ loading: false, workspaceChoices: workspaces })
          return
        }
        activeWorkspace ??= workspaces[0]
        if (
          cachedWorkspace?.organizationId &&
          cachedWorkspace.organizationId !== activeWorkspace.organizationId
        )
          await clearLocalPosDataForNewTenant()
        if (sessionStorage.getItem(workspaceKey) !== activeWorkspace.organizationId) {
          const { error: activationError } = await client.rpc('activate_organization_workspace', {
            p_organization_id: activeWorkspace.organizationId,
          })
          if (activationError) {
            setState({ loading: false, startupError: activationError.message })
            return
          }
          sessionStorage.setItem(workspaceKey, activeWorkspace.organizationId)
        }
        const { data, error } = await within(
          client.from('profiles').select('role, full_name, store_id').eq('id', session.user.id).maybeSingle(),
          'Workspace profile check',
        )
        if (error) {
          setState({ loading: false, startupError: error.message })
          return
        }
        if (!data) {
          // Keep a previously verified device workspace during a flaky refresh.
          // Clearing IndexedDB here would make an offline cashier lose the catalogue.
          if (cachedWorkspace) {
            setState({
              loading: false,
              role: cachedWorkspace.role,
              staffName: cachedWorkspace.staffName,
            })
            return
          }
          await clearLocalPosDataForNewTenant()
          setState({ loading: false, onboarding: true })
          return
        }
        let tenantName = cachedWorkspace?.tenantName
        let tenantLogoUrl = cachedWorkspace?.tenantLogoUrl
        if (data.store_id) {
          const [{ data: store }, { data: brand }] = await Promise.all([
            client.from('stores').select('organization_id').eq('id', data.store_id).maybeSingle(),
            client.rpc('current_store_invoice_brand').maybeSingle(),
          ])
          const invoiceBrand = brand as { company_name?: string | null; logo_url?: string | null } | null
          if (invoiceBrand?.company_name) tenantName = invoiceBrand.company_name
          if (invoiceBrand?.logo_url) tenantLogoUrl = invoiceBrand.logo_url
          if (store?.organization_id) {
            const { data: organization } = await client
              .from('organizations')
              .select('name')
              .eq('id', store.organization_id)
              .maybeSingle()
            tenantName = invoiceBrand?.company_name ?? organization?.name ?? tenantName
          }
        }
        saveOfflineWorkspace({
          userId: session.user.id,
          organizationId: activeWorkspace.organizationId,
          role: data.role,
          staffName: data.full_name,
          tenantName,
          tenantLogoUrl,
        })
        const { data: billing } = (await within(
          client.rpc('current_organization_billing_status').maybeSingle(),
          'Subscription check',
        )) as { data: { organization_status?: string } | null }
        if (billing?.organization_status === 'suspended') {
          setState({
            loading: false,
            billingBlocked: true,
            role: data.role,
            staffName: data.full_name,
            tenantName,
            tenantLogoUrl,
          })
          return
        }
        if (data.role === 'cashier' && navigator.onLine) await within(pullProducts(), 'Checkout catalogue')
        if (redirectToDefault && wasUnauthenticated.current) {
          wasUnauthenticated.current = false
          message.success('Logged in successfully.')
          navigate(data.role === 'cashier' ? '/checkout' : '/', { replace: true })
        }
        setState({ loading: false, role: data.role, staffName: data.full_name, tenantName, tenantLogoUrl })
      } catch (error) {
        const {
          data: { session },
        } = await client.auth.getSession()
        const cachedWorkspace = session ? getOfflineWorkspace(session.user.id) : undefined
        if (!platformRoute && cachedWorkspace) {
          setState({
            loading: false,
            role: cachedWorkspace.role,
            staffName: cachedWorkspace.staffName,
            tenantName: cachedWorkspace.tenantName,
            tenantLogoUrl: cachedWorkspace.tenantLogoUrl,
          })
          return
        }
        setState({
          loading: false,
          startupError: error instanceof Error ? error.message : 'Could not start the tenant workspace.',
        })
      }
    }
    void load()
    const { data: listener } = client.auth.onAuthStateChange((event) => void load(event === 'SIGNED_IN'))
    return () => listener.subscription.unsubscribe()
  }, [navigate, platformRoute, publicStorefrontRoute])
  if (publicStorefrontRoute) return <StorefrontPage />
  if (state.workspaceChoices)
    return (
      <CompanyWorkspacePicker
        companies={state.workspaceChoices}
        selectingId={state.selectingWorkspaceId}
        onSelect={(workspace) => void selectWorkspace(workspace)}
        onSignOut={() => void supabase?.auth.signOut()}
      />
    )
  if (state.loading)
    return (
      <main
        className={`kroniq-loader kroniq-loader--${mode} grid min-h-screen place-items-center overflow-hidden p-6`}
      >
        <div className="relative w-full max-w-sm text-center">
          <div className="kroniq-loader-orb absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" />
          {state.tenantLogoUrl ? (
            <img
              src={state.tenantLogoUrl}
              alt="Company logo"
              className="relative mx-auto mb-4 h-12 w-12 object-contain"
            />
          ) : (
            <span className="relative mx-auto mb-4 grid h-12 w-12 place-items-center bg-[#0B1121] text-sm font-bold text-white">
              {initials(state.tenantName ?? 'Kroniqos')}
            </span>
          )}
          <Typography.Title level={3} className="kroniq-loader-title relative !mb-1 !text-xl">
            {state.tenantName ?? 'Kroniqos'}
          </Typography.Title>
          <Typography.Text className="kroniq-loader-subtitle relative">
            Loading workspace securely
          </Typography.Text>
          <div className="kroniq-loader-track relative mx-auto mt-4 h-px w-44 overflow-hidden">
            <span className="kroniq-loader-line block h-full w-1/2" />
          </div>
          <div className="kroniq-loader-status relative mt-2 flex items-center justify-center gap-2 text-[11px]">
            <CloudSyncOutlined className="kroniq-loader-spin" />
            Powered by Kroniqos
          </div>
        </div>
      </main>
    )
  if (state.unauthenticated && pathname === '/register')
    return (
      <CompanyRegistration onBack={() => navigate('/login')} onSignedIn={() => window.location.reload()} />
    )
  if (state.unauthenticated && pathname === '/login')
    return <Login onRegister={() => navigate('/register')} />
  if (state.unauthenticated && publicMarketingRoute) return <MarketingSite />
  if (state.startupError)
    return (
      <main className="grid min-h-screen place-items-center p-4">
        <Card title="Could not open this workspace" className="w-full max-w-md">
          <Alert type="error" showIcon message={state.startupError} />
          <Space className="mt-5">
            <Button type="primary" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button onClick={() => void supabase?.auth.signOut()}>Sign out</Button>
          </Space>
        </Card>
      </main>
    )
  if (state.platformAdmin) return <PlatformApp />
  if (state.platformDenied) return <PlatformAccessDenied />
  if (state.billingBlocked)
    return (
      <main className="grid min-h-screen place-items-center p-4">
        <div className="w-full max-w-4xl">
          <Card title="Subscription payment required">
            <p className="text-slate-600">
              This company workspace is temporarily suspended because its subscription is overdue.{' '}
              {state.role === 'admin'
                ? 'Complete payment below to restore access.'
                : 'Please contact your company administrator to restore access.'}
            </p>
          </Card>
          {state.role === 'admin' && <BillingPanel />}
        </div>
      </main>
    )
  if (state.onboarding)
    return (
      <OrganizationOnboarding
        onComplete={() => {
          setState({ loading: true })
          void supabase?.auth.getSession().then(() => window.location.reload())
        }}
      />
    )
  if (state.registering)
    return (
      <CompanyRegistration
        onBack={() => setState({ loading: false })}
        onSignedIn={() => window.location.reload()}
      />
    )
  if (supabaseConfigured && !state.role)
    return (
      <Login
        platform={platformRoute}
        onRegister={platformRoute ? undefined : () => setState({ loading: false, registering: true })}
      />
    )
  return <App enforcedRole={state.role} enforcedStaffName={state.staffName} />
}
