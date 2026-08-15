import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function paystack(secret: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const result = await response.json()
  if (!response.ok || !result.status) throw new Error(result.message ?? 'Paystack request failed')
  return result.data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!secret) return json({ error: 'Billing is not configured.' }, 503)
    const authorization = request.headers.get('Authorization') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const admin = createClient(url, serviceKey)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthenticated' }, 401)
    const { planCode } = await request.json()
    if (typeof planCode !== 'string' || !planCode) return json({ error: 'Choose a plan.' }, 400)
    if (planCode === 'enterprise') return json({ error: 'Enterprise plans require a custom agreement.' }, 400)
    const { data: profile } = await admin.from('profiles').select('store_id,role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') return json({ error: 'Only company administrators can manage billing.' }, 403)
    const { data: store } = await admin.from('stores').select('organization_id').eq('id', profile.store_id).single()
    const { data: plan } = await admin.from('subscription_plans').select('code,name,description,monthly_price_kobo,paystack_plan_code,active').eq('code', planCode).single()
    if (!store || !plan?.active || !plan.monthly_price_kobo) return json({ error: 'This plan is unavailable for online billing.' }, 400)
    let paystackPlanCode = plan.paystack_plan_code
    if (!paystackPlanCode) {
      const remotePlan = await paystack(secret, '/plan', { method: 'POST', body: JSON.stringify({ name: `Naira POS ${plan.name}`, amount: plan.monthly_price_kobo, interval: 'monthly', currency: 'NGN', description: plan.description }) })
      paystackPlanCode = remotePlan.plan_code
      await admin.from('subscription_plans').update({ paystack_plan_code: paystackPlanCode }).eq('code', plan.code)
    }
    const { data: subscription } = await admin.from('organization_subscriptions').select('id').eq('organization_id', store.organization_id).single()
    if (!subscription) return json({ error: 'Subscription record is missing.' }, 409)
    const reference = `sub_${store.organization_id.slice(0, 8)}_${crypto.randomUUID().replaceAll('-', '')}`
    const { error: paymentError } = await admin.from('subscription_payments').insert({ organization_id: store.organization_id, subscription_id: subscription.id, provider_reference: reference, amount_kobo: plan.monthly_price_kobo, status: 'initialized' })
    if (paymentError) throw paymentError
    const callbackUrl = `${Deno.env.get('APP_URL') ?? 'http://localhost:5173'}/settings?billing=success`
    const transaction = await paystack(secret, '/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: user.email, amount: String(plan.monthly_price_kobo), plan: paystackPlanCode, reference, callback_url: callbackUrl, metadata: { organization_id: store.organization_id, plan_code: plan.code } }) })
    return json({ authorizationUrl: transaction.authorization_url, reference })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not start billing checkout.' }, 500) }
})
