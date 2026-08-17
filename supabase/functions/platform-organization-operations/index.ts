import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    })
    const admin = createClient(url, serviceKey)
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthenticated' }, 401)
    const { data: platformAdmin } = await admin
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!platformAdmin) return json({ error: 'Platform administrator access required.' }, 403)
    const { action, organizationId, staffId } = await request.json()
    if (action !== 'resend_invite' || typeof organizationId !== 'string' || typeof staffId !== 'string')
      return json({ error: 'Invalid request.' }, 400)
    const { data: staff } = await admin.from('profiles').select('id,store_id').eq('id', staffId).single()
    const { data: store } = staff
      ? await admin.from('stores').select('organization_id').eq('id', staff.store_id).single()
      : { data: null }
    if (!staff || !store || store.organization_id !== organizationId)
      return json({ error: 'Staff member was not found in this organisation.' }, 404)
    const { data: targetUser, error: targetError } = await admin.auth.admin.getUserById(staff.id)
    if (targetError || !targetUser.user.email) throw targetError ?? new Error('Staff email is unavailable')
    const { error: emailError } = await admin.auth.resetPasswordForEmail(targetUser.user.email, {
      redirectTo: Deno.env.get('APP_URL') ?? undefined,
    })
    if (emailError) throw emailError
    await admin.from('platform_audit_events').insert({
      actor_id: user.id,
      organization_id: organizationId,
      action: 'staff_invite_resent',
      after_data: { staff_id: staffId },
    })
    return json({ success: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not resend invitation.' }, 500)
  }
})
