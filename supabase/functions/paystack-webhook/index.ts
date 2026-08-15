import { createClient } from 'npm:@supabase/supabase-js@2'

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
async function digest(algorithm: AlgorithmIdentifier, value: string) { return hex(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value))) }
async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

function readString(value: unknown) { return typeof value === 'string' ? value : undefined }
function eventMetadata(data: Record<string, unknown>) {
  const raw = data.metadata
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown> } catch { return undefined }
  }
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined
}
function eventOrganizationId(data: Record<string, unknown>) {
  return readString(eventMetadata(data)?.organization_id)
}
function eventPlanCode(data: Record<string, unknown>) {
  return readString(eventMetadata(data)?.plan_code)
}

Deno.serve(async (request) => {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!secret) return new Response('Billing is not configured.', { status: 503 })
  const raw = await request.text()
  const expected = await signature(secret, raw)
  if (request.headers.get('x-paystack-signature') !== expected) return new Response('Invalid signature', { status: 401 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const event = JSON.parse(raw) as { event?: string; data?: Record<string, unknown> }
  if (!event.event || !event.data) return new Response('Invalid payload', { status: 400 })
  const eventKey = await digest('SHA-256', raw)
  const { error: insertError } = await admin.from('billing_webhook_events').insert({ event_key: eventKey, event_type: event.event, payload: event })
  if (insertError?.code === '23505') return new Response('ok', { status: 200 })
  if (insertError) return new Response(insertError.message, { status: 500 })
  try {
    const data = event.data
    const reference = readString(data.reference)
    let organizationId = eventOrganizationId(data)
    const planCode = eventPlanCode(data)
    if (!organizationId && reference) {
      const { data: payment } = await admin.from('subscription_payments').select('organization_id,subscription_id').eq('provider_reference', reference).maybeSingle()
      organizationId = payment?.organization_id
    }
    const paidAt = readString(data.paid_at) ?? new Date().toISOString()
    if (event.event === 'charge.success' && reference) {
      await admin.from('subscription_payments').update({ status: 'success', provider_transaction_id: String(data.id ?? ''), paid_at: paidAt, updated_at: new Date().toISOString() }).eq('provider_reference', reference)
      if (organizationId) {
        const subscriptionUpdate: Record<string, unknown> = { status: 'active', past_due_at: null, grace_period_ends_at: null, suspended_at: null, current_period_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(), updated_at: new Date().toISOString() }
        if (planCode) subscriptionUpdate.plan_code = planCode
        await admin.from('organization_subscriptions').update(subscriptionUpdate).eq('organization_id', organizationId)
        await admin.from('organization_subscriptions').update({ first_paid_at: paidAt }).eq('organization_id', organizationId).is('first_paid_at', null)
      }
      if (organizationId) await admin.from('organizations').update({ status: 'active' }).eq('id', organizationId)
    }
    if (event.event === 'subscription.create') {
      const customer = data.customer as Record<string, unknown> | undefined
      const subscriptionCode = readString(data.subscription_code)
      if (organizationId && subscriptionCode) await admin.from('organization_subscriptions').update({ provider: 'paystack', provider_subscription_id: subscriptionCode, provider_customer_id: readString(customer?.customer_code), status: 'active', past_due_at: null, grace_period_ends_at: null, updated_at: new Date().toISOString() }).eq('organization_id', organizationId)
    }
    if (event.event === 'invoice.payment_failed') {
      const subscription = data.subscription as Record<string, unknown> | undefined
      const subscriptionCode = readString(subscription?.subscription_code) ?? readString(data.subscription_code)
      const query = admin.from('organization_subscriptions').select('organization_id').eq('provider_subscription_id', subscriptionCode ?? '')
      const { data: failedSubscription } = await query.maybeSingle()
      const failedOrganizationId = organizationId ?? failedSubscription?.organization_id
      if (failedOrganizationId) await admin.from('organization_subscriptions').update({ status: 'past_due', past_due_at: new Date().toISOString(), grace_period_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(), updated_at: new Date().toISOString() }).eq('organization_id', failedOrganizationId)
    }
    if (event.event === 'subscription.disable') {
      const subscriptionCode = readString(data.subscription_code)
      const { data: disabledSubscription } = await admin.from('organization_subscriptions').select('organization_id').eq('provider_subscription_id', subscriptionCode ?? '').maybeSingle()
      const disabledOrganizationId = organizationId ?? disabledSubscription?.organization_id
      if (disabledOrganizationId) {
        await admin.from('organization_subscriptions').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('organization_id', disabledOrganizationId)
        await admin.from('organizations').update({ status: 'suspended' }).eq('id', disabledOrganizationId)
      }
    }
    await admin.from('billing_webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_key', eventKey)
    return new Response('ok', { status: 200 })
  } catch (error) {
    await admin.from('billing_webhook_events').update({ processing_error: error instanceof Error ? error.message : 'Unknown error' }).eq('event_key', eventKey)
    return new Response('Processing failed', { status: 500 })
  }
})
