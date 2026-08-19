import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
type Role = 'admin' | 'manager' | 'cashier'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = request.headers.get('Authorization') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(url, serviceKey)
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthenticated' }, 401)
    const { data: requester } = await adminClient
      .from('profiles')
      .select('store_id, role')
      .eq('id', user.id)
      .single()
    if (!requester || requester.role !== 'admin') return json({ error: 'Administrator access required' }, 403)
    const { data: requesterStore } = await adminClient
      .from('stores')
      .select('organization_id')
      .eq('id', requester.store_id)
      .single()
    if (!requesterStore?.organization_id) return json({ error: 'Company workspace not found' }, 403)
    const organizationId = requesterStore.organization_id
    const payload = await request.json()
    if (payload.action === 'list') {
      const [{ data: memberships, error: membershipsError }, { data: users, error: usersError }] =
        await Promise.all([
          adminClient
            .from('organization_memberships')
            .select('user_id, role, status, created_at')
            .eq('organization_id', organizationId)
            .order('created_at'),
          adminClient.auth.admin.listUsers({ page: 1, perPage: 100 }),
        ])
      if (membershipsError || usersError) throw membershipsError ?? usersError
      const byId = new Map(users.users.map((member) => [member.id, member]))
      const memberIds = (memberships ?? []).map((member) => member.user_id)
      const { data: profiles, error: profilesError } = memberIds.length
        ? await adminClient.from('profiles').select('id, full_name').in('id', memberIds)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      return json({
        staff: (memberships ?? []).map((membership) => {
          const user = byId.get(membership.user_id)
          const profile = profileById.get(membership.user_id)
          return {
            id: membership.user_id,
            fullName: profile?.full_name ?? user?.user_metadata?.full_name ?? 'Staff member',
            role: membership.role,
            createdAt: membership.created_at,
            email: user?.email ?? '',
            active: membership.status === 'active',
          }
        }),
      })
    }
    if (payload.action === 'create') {
      const { fullName, email, password, role } = payload as {
        fullName: string
        email: string
        password: string
        role: Role
      }
      if (!fullName || !email || !password || !['admin', 'manager', 'cashier'].includes(role))
        return json({ error: 'Invalid staff details' }, 400)
      const normalizedEmail = email.trim().toLowerCase()
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      })
      let staffId = created.user?.id
      const createdNewUser = Boolean(staffId)
      if (createError || !staffId) {
        const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })
        if (usersError) throw usersError
        const existingUser = users.users.find((member) => member.email?.toLowerCase() === normalizedEmail)
        if (!existingUser) throw createError ?? new Error('User creation failed')
        const { data: existingProfile } = await adminClient
          .from('profiles')
          .select('id')
          .eq('id', existingUser.id)
          .maybeSingle()
        const { data: existingMembership } = await adminClient
          .from('organization_memberships')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('user_id', existingUser.id)
          .maybeSingle()
        if (existingMembership)
          return json(
            {
              error: 'This email already belongs to this company.',
            },
            409,
          )
        if (!existingProfile) return json({ error: 'This account is not ready for company access.' }, 409)
        const { error: restoreError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          ban_duration: 'none',
        })
        if (restoreError) throw restoreError
        staffId = existingUser.id
      }
      if (createdNewUser) {
        const { error: profileError } = await adminClient
          .from('profiles')
          .insert({ id: staffId, store_id: requester.store_id, full_name: fullName.trim(), role })
        if (profileError) {
          if (created.user) await adminClient.auth.admin.deleteUser(staffId)
          throw profileError
        }
      }
      const { error: membershipError } = await adminClient.from('organization_memberships').upsert(
        {
          organization_id: organizationId,
          user_id: staffId,
          role,
          status: 'active',
          deactivated_at: null,
          deactivated_by: null,
        },
        { onConflict: 'organization_id,user_id' },
      )
      if (membershipError) throw membershipError
      return json(
        {
          staff: {
            id: staffId,
            email: normalizedEmail,
            fullName,
            role,
            createdAt: new Date().toISOString(),
            active: true,
          },
        },
        201,
      )
    }
    if (payload.action === 'deactivate') {
      if (!payload.staffId || payload.staffId === user.id)
        return json({ error: 'You cannot deactivate this account.' }, 400)
      const { data: target } = await adminClient
        .from('organization_memberships')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', payload.staffId)
        .maybeSingle()
      if (!target) return json({ error: 'Staff member not found' }, 404)
      const { error } = await adminClient
        .from('organization_memberships')
        .update({ status: 'deactivated', deactivated_at: new Date().toISOString(), deactivated_by: user.id })
        .eq('id', target.id)
      if (error) throw error
      return json({ success: true })
    }
    return json({ error: 'Unsupported action' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
