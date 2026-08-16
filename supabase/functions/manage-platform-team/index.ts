import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const roles = ['owner', 'operator', 'support', 'finance', 'viewer'] as const
type PlatformRole = typeof roles[number]
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

    const { data: requester } = await adminClient.from('platform_admins').select('platform_role').eq('user_id', user.id).maybeSingle()
    if (requester?.platform_role !== 'owner') return json({ error: 'Only platform owners can add team members.' }, 403)

    const { email, password, role } = await request.json() as { email?: string; password?: string; role?: PlatformRole }
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail || !password || password.length < 8 || !role || !roles.includes(role)) return json({ error: 'Enter a valid email, temporary password, and role.' }, 400)

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true })
    let memberId = created.user?.id
    if (createError || !memberId) {
      const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (usersError) throw usersError
      const existing = users.users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail)
      if (!existing) throw createError ?? new Error('User creation failed')
      memberId = existing.id
      const { data: existingMember } = await adminClient.from('platform_admins').select('user_id').eq('user_id', memberId).maybeSingle()
      if (existingMember) return json({ error: 'This email is already a platform team member.' }, 409)
      const { data: tenantProfile } = await adminClient.from('profiles').select('id').eq('id', memberId).maybeSingle()
      if (tenantProfile) return json({ error: 'This email belongs to a tenant staff account and cannot be added to the platform team.' }, 409)
      const { error: updateError } = await adminClient.auth.admin.updateUserById(memberId, { password, ban_duration: 'none', email_confirm: true })
      if (updateError) throw updateError
    }

    const { error: membershipError } = await adminClient.from('platform_admins').insert({ user_id: memberId, platform_role: role })
    if (membershipError) {
      if (created.user) await adminClient.auth.admin.deleteUser(memberId)
      throw membershipError
    }
    await adminClient.from('platform_audit_events').insert({ actor_id: user.id, action: 'platform_team_member_added', after_data: { user_id: memberId, email: normalizedEmail, role } })
    return json({ member: { user_id: memberId, email: normalizedEmail, platform_role: role } }, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
