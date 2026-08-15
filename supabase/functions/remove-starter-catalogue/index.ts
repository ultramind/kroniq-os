import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
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
    const { data: profile } = await adminClient.from('profiles').select('store_id, role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') return json({ error: 'Administrator access required' }, 403)
    const { data: samples, error: sampleError } = await adminClient.from('products').select('id').eq('store_id', profile.store_id).like('sku', 'DEMO-%')
    if (sampleError) throw sampleError
    const ids = (samples ?? []).map((product) => product.id)
    if (!ids.length) return json({ removed: 0, archived: 0 })
    const { data: sold, error: soldError } = await adminClient.from('sale_items').select('product_id').in('product_id', ids)
    if (soldError) throw soldError
    const soldIds = new Set((sold ?? []).map((item) => item.product_id))
    const removeIds = ids.filter((id) => !soldIds.has(id))
    const archiveIds = ids.filter((id) => soldIds.has(id))
    if (removeIds.length) { const { error } = await adminClient.from('products').delete().in('id', removeIds); if (error) throw error }
    if (archiveIds.length) { const { error } = await adminClient.from('products').update({ active: false, updated_at: new Date().toISOString() }).in('id', archiveIds); if (error) throw error }
    return json({ removed: removeIds.length, archived: archiveIds.length })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500) }
})
