import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
type Role = 'admin' | 'manager' | 'cashier'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = request.headers.get('Authorization') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const adminClient = createClient(url, serviceKey)
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthenticated' }, 401)
    const { data: requester } = await adminClient.from('profiles').select('store_id, role').eq('id', user.id).single()
    if (!requester || requester.role !== 'admin') return json({ error: 'Administrator access required' }, 403)
    const payload = await request.json()
    if (payload.action === 'list') {
      const [{ data: profiles, error: profilesError }, { data: users, error: usersError }] = await Promise.all([adminClient.from('profiles').select('id, full_name, role, created_at').eq('store_id', requester.store_id).order('created_at'), adminClient.auth.admin.listUsers({ page: 1, perPage: 100 })])
      if (profilesError || usersError) throw profilesError ?? usersError
      const byId = new Map(users.users.map((member) => [member.id, member]))
      return json({ staff: (profiles ?? []).map((profile) => { const user = byId.get(profile.id); return { id: profile.id, fullName: profile.full_name, role: profile.role, createdAt: profile.created_at, email: user?.email ?? '', active: !user?.banned_until } }) })
    }
    if (payload.action === 'create') {
      const { fullName, email, password, role } = payload as { fullName: string; email: string; password: string; role: Role }
      if (!fullName || !email || !password || !['admin', 'manager', 'cashier'].includes(role)) return json({ error: 'Invalid staff details' }, 400)
      const normalizedEmail = email.trim().toLowerCase()
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true })
      let staffId = created.user?.id
      if (createError || !staffId) {
        const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
        if (usersError) throw usersError
        const existingUser = users.users.find((member) => member.email?.toLowerCase() === normalizedEmail)
        if (!existingUser) throw createError ?? new Error('User creation failed')
        const { data: existingProfile } = await adminClient.from('profiles').select('store_id').eq('id', existingUser.id).maybeSingle()
        if (existingProfile) return json({ error: existingProfile.store_id === requester.store_id ? 'This email already belongs to a staff account.' : 'This email belongs to another company.' }, 409)
        const { error: restoreError } = await adminClient.auth.admin.updateUserById(existingUser.id, { password, ban_duration: 'none', email_confirm: true })
        if (restoreError) throw restoreError
        staffId = existingUser.id
      }
      const { error: profileError } = await adminClient.from('profiles').insert({ id: staffId, store_id: requester.store_id, full_name: fullName.trim(), role })
      if (profileError) {
        if (created.user) await adminClient.auth.admin.deleteUser(staffId)
        throw profileError
      }
      return json({ staff: { id: staffId, email: normalizedEmail, fullName, role, createdAt: new Date().toISOString(), active: true } }, 201)
    }
    if (payload.action === 'deactivate') {
      if (!payload.staffId || payload.staffId === user.id) return json({ error: 'You cannot deactivate this account.' }, 400)
      const { data: target } = await adminClient.from('profiles').select('id').eq('id', payload.staffId).eq('store_id', requester.store_id).maybeSingle()
      if (!target) return json({ error: 'Staff member not found' }, 404)
      const { error } = await adminClient.auth.admin.updateUserById(payload.staffId, { ban_duration: '876000h' })
      if (error) throw error
      return json({ success: true })
    }
    return json({ error: 'Unsupported action' }, 400)
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500) }
})
