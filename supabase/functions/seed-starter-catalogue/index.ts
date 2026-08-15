import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const catalogue = [
  ['Groceries', 'Mama Gold Rice 5kg', 11500, 14500, 18, 5], ['Groceries', 'Golden Penny Spaghetti 500g', 700, 950, 36, 10], ['Groceries', 'Indomie Super Pack', 620, 850, 48, 12], ['Groceries', 'Honeywell Semolina 1kg', 1450, 1800, 22, 6],
  ['Beverages', 'Coca-Cola 60cl', 520, 750, 36, 12], ['Beverages', 'Maltina Can 33cl', 500, 700, 24, 8], ['Beverages', 'Peak Milk 400g', 2500, 3200, 20, 5], ['Beverages', 'Milo Refill 500g', 3800, 4900, 14, 4],
  ['Household', 'Morning Fresh 450ml', 1250, 1700, 16, 5], ['Household', 'Hypo Bleach 1L', 700, 950, 18, 5], ['Household', 'Dettol Soap 110g', 650, 900, 30, 8],
  ['Personal care', 'Closeup Toothpaste 140g', 900, 1250, 21, 6], ['Personal care', 'Lux Beauty Soap', 550, 750, 24, 8], ['Dairy', 'Dano Milk 500g', 3400, 4300, 12, 4],
  ['Snacks', 'Oreo Original 119g', 900, 1250, 20, 6], ['Snacks', 'Chivita 1L Fruit Juice', 1450, 1900, 15, 5], ['Bakery', 'Sliced Bread Large', 850, 1100, 12, 4],
  ['Frozen', 'Chicken Drumsticks 1kg', 4200, 5200, 10, 3], ['Baby care', 'Pampers Baby Dry Midi', 5200, 6500, 8, 3], ['Stationery', 'Bic Ballpoint Pen Blue', 120, 200, 50, 15],
] as const

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
    const { count, error: countError } = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('store_id', profile.store_id)
    if (countError) throw countError
    if ((count ?? 0) > 0) return json({ error: 'This branch already has products. Starter data is only for an empty catalogue.' }, 409)
    const categoryNames = [...new Set(catalogue.map(([category]) => category))]
    const { data: categories, error: categoryError } = await adminClient.from('categories').upsert(categoryNames.map((name) => ({ store_id: profile.store_id, name })), { onConflict: 'store_id,name' }).select('id,name')
    if (categoryError || !categories) throw categoryError ?? new Error('Could not create categories')
    const categoryIds = new Map(categories.map((category) => [category.name, category.id]))
    const { data: products, error: productError } = await adminClient.from('products').insert(catalogue.map(([category, name, cost, price, stock, threshold], index) => ({
      store_id: profile.store_id, category_id: categoryIds.get(category), name, sku: `DEMO-${String(index + 10001)}`,
      cost_price_kobo: cost * 100, price_kobo: price * 100, stock_quantity: stock, low_stock_threshold: threshold,
    }))).select('id,stock_quantity')
    if (productError || !products) throw productError ?? new Error('Could not create products')
    const { data: location, error: locationError } = await adminClient.from('inventory_locations').upsert({ store_id: profile.store_id, name: 'Shop floor', location_type: 'shop_floor' }, { onConflict: 'store_id,name' }).select('id').single()
    if (locationError || !location) throw locationError ?? new Error('Could not create shop floor')
    const { error: balanceError } = await adminClient.from('inventory_location_balances').upsert(products.map((product) => ({ location_id: location.id, product_id: product.id, quantity: product.stock_quantity })), { onConflict: 'location_id,product_id' })
    if (balanceError) throw balanceError
    return json({ seeded: products.length })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
