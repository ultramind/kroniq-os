import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Space, Typography } from 'antd'
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

export function AuthGate() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const platformRoute = pathname.startsWith('/platform')
  const publicMarketingRoute = pathname === '/' || pathname === '/product' || pathname === '/pricing' || pathname === '/about' || pathname === '/contact' || pathname === '/help' || pathname === '/privacy' || pathname === '/terms' || pathname === '/status' || pathname.startsWith('/solutions/')
  const [state, setState] = useState<{ loading: boolean; unauthenticated?: boolean; startupError?: string; onboarding?: boolean; registering?: boolean; platformAdmin?: boolean; platformDenied?: boolean; billingBlocked?: boolean; role?: Role; staffName?: string }>({ loading: true })
  useEffect(() => {
    if (!supabase) { setState({ loading: false }); return }
    const client = supabase
    const load = async () => {
      const within = async <T,>(request: PromiseLike<T>, label: string): Promise<T> => await Promise.race([request, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out. Check your connection and try again.`)), 15000))])
      try {
      const { data: { session } } = await within(client.auth.getSession(), 'Session check')
      if (!session) { setState({ loading: false, unauthenticated: true }); return }
      if (platformRoute) {
        const { data: membership } = await within(client.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle(), 'Platform access check')
        setState({ loading: false, platformAdmin: Boolean(membership), platformDenied: !membership })
        return
      }
      const { data, error } = await within(client.from('profiles').select('role, full_name').eq('id', session.user.id).maybeSingle(), 'Workspace profile check')
      if (error) { setState({ loading: false, startupError: error.message }); return }
      if (!data) {
        await clearLocalPosDataForNewTenant()
        setState({ loading: false, onboarding: true })
        return
      }
      const { data: billing } = await within(client.rpc('current_organization_billing_status').maybeSingle(), 'Subscription check') as { data: { organization_status?: string } | null }
      if (billing?.organization_status === 'suspended') { setState({ loading: false, billingBlocked: true, role: data.role, staffName: data.full_name }); return }
      setState({ loading: false, role: data.role, staffName: data.full_name })
      } catch (error) { setState({ loading: false, startupError: error instanceof Error ? error.message : 'Could not start the tenant workspace.' }) }
    }
    void load()
    const { data: listener } = client.auth.onAuthStateChange(() => void load())
    return () => listener.subscription.unsubscribe()
  }, [platformRoute])
  if (state.loading) return <main className="kroniq-loader grid min-h-screen place-items-center overflow-hidden p-6"><div className="relative w-full max-w-sm text-center"><div className="kroniq-loader-orb absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2" /><Typography.Title level={3} className="relative !mb-2 !text-[#0B1121]">KroniqOS</Typography.Title><Typography.Text type="secondary" className="relative">Preparing your workspace</Typography.Text><div className="relative mx-auto mt-7 h-px w-44 overflow-hidden bg-slate-200"><span className="kroniq-loader-line block h-full w-1/2 bg-[#0B1121]" /></div><div className="relative mt-4 flex items-center justify-center gap-2 text-[11px] text-slate-500"><CloudSyncOutlined className="kroniq-loader-spin" />Checking your secure workspace</div></div></main>
  if (state.unauthenticated && pathname === '/register') return <CompanyRegistration onBack={() => navigate('/login')} onSignedIn={() => window.location.reload()} />
  if (state.unauthenticated && pathname === '/login') return <Login onRegister={() => navigate('/register')} />
  if (state.unauthenticated && publicMarketingRoute) return <MarketingSite />
  if (state.startupError) return <main className="grid min-h-screen place-items-center p-4"><Card title="Could not open this workspace" className="w-full max-w-md"><Alert type="error" showIcon message={state.startupError} /><Space className="mt-5"><Button type="primary" onClick={() => window.location.reload()}>Retry</Button><Button onClick={() => void supabase?.auth.signOut()}>Sign out</Button></Space></Card></main>
  if (state.platformAdmin) return <PlatformApp />
  if (state.platformDenied) return <PlatformAccessDenied />
  if (state.billingBlocked) return <main className="grid min-h-screen place-items-center p-4"><div className="w-full max-w-4xl"><Card title="Subscription payment required"><p className="text-slate-600">This company workspace is temporarily suspended because its subscription is overdue. {state.role === 'admin' ? 'Complete payment below to restore access.' : 'Please contact your company administrator to restore access.'}</p></Card>{state.role === 'admin' && <BillingPanel />}</div></main>
  if (state.onboarding) return <OrganizationOnboarding onComplete={() => { setState({ loading: true }); void supabase?.auth.getSession().then(() => window.location.reload()) }} />
  if (state.registering) return <CompanyRegistration onBack={() => setState({ loading: false })} onSignedIn={() => window.location.reload()} />
  if (supabaseConfigured && !state.role) return <Login platform={platformRoute} onRegister={platformRoute ? undefined : () => setState({ loading: false, registering: true })} />
  return <App enforcedRole={state.role} enforcedStaffName={state.staffName} />
}
