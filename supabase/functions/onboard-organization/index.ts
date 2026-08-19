import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'company'
  )
}

const starterCatalogue = [
  ['Groceries', 'Mama Gold Rice 5kg', 'DEMO-10001', 11500, 14500, 18, 5],
  ['Groceries', 'Golden Penny Spaghetti 500g', 'DEMO-10002', 700, 950, 36, 10],
  ['Groceries', 'Indomie Super Pack', 'DEMO-10003', 620, 850, 48, 12],
  ['Groceries', 'Honeywell Semolina 1kg', 'DEMO-10004', 1450, 1800, 22, 6],
  ['Beverages', 'Coca-Cola 60cl', 'DEMO-10005', 520, 750, 36, 12],
  ['Beverages', 'Maltina Can 33cl', 'DEMO-10006', 500, 700, 24, 8],
  ['Beverages', 'Peak Milk 400g', 'DEMO-10007', 2500, 3200, 20, 5],
  ['Beverages', 'Milo Refill 500g', 'DEMO-10008', 3800, 4900, 14, 4],
  ['Household', 'Morning Fresh 450ml', 'DEMO-10009', 1250, 1700, 16, 5],
  ['Household', 'Hypo Bleach 1L', 'DEMO-10010', 700, 950, 18, 5],
  ['Household', 'Dettol Soap 110g', 'DEMO-10011', 650, 900, 30, 8],
  ['Personal care', 'Closeup Toothpaste 140g', 'DEMO-10012', 900, 1250, 21, 6],
  ['Personal care', 'Lux Beauty Soap', 'DEMO-10013', 550, 750, 24, 8],
  ['Dairy', 'Dano Milk 500g', 'DEMO-10014', 3400, 4300, 12, 4],
  ['Snacks', 'Oreo Original 119g', 'DEMO-10015', 900, 1250, 20, 6],
  ['Snacks', 'Chivita 1L Fruit Juice', 'DEMO-10016', 1450, 1900, 15, 5],
  ['Bakery', 'Sliced Bread Large', 'DEMO-10017', 850, 1100, 12, 4],
  ['Frozen', 'Chicken Drumsticks 1kg', 'DEMO-10018', 4200, 5200, 10, 3],
  ['Baby care', 'Pampers Baby Dry Midi', 'DEMO-10019', 5200, 6500, 8, 3],
  ['Stationery', 'Bic Ballpoint Pen Blue', 'DEMO-10020', 120, 200, 50, 15],
] as const

async function seedStarterProducts(adminClient: ReturnType<typeof createClient>, storeId: string) {
  const categoryNames = [...new Set(starterCatalogue.map(([category]) => category))]
  const { data: categories, error: categoriesError } = await adminClient
    .from('categories')
    .insert(categoryNames.map((name) => ({ store_id: storeId, name })))
    .select('id, name')
  if (categoriesError || !categories)
    throw categoriesError ?? new Error('Could not create starter categories')
  const categoryIds = new Map(categories.map((category) => [category.name, category.id]))
  const { data: products, error: productsError } = await adminClient
    .from('products')
    .insert(
      starterCatalogue.map(([category, name, sku, cost, price, stock, threshold]) => ({
        store_id: storeId,
        category_id: categoryIds.get(category),
        name,
        sku,
        cost_price_kobo: cost * 100,
        price_kobo: price * 100,
        stock_quantity: stock,
        low_stock_threshold: threshold,
      })),
    )
    .select('id, stock_quantity')
  if (productsError || !products) throw productsError ?? new Error('Could not create starter products')
  const { data: shopFloor, error: locationError } = await adminClient
    .from('inventory_locations')
    .insert({ store_id: storeId, name: 'Shop floor', location_type: 'shop_floor' })
    .select('id')
    .single()
  if (locationError || !shopFloor) throw locationError ?? new Error('Could not create the shop floor')
  const { error: balanceError } = await adminClient.from('inventory_location_balances').insert(
    products.map((product) => ({
      location_id: shopFloor.id,
      product_id: product.id,
      quantity: product.stock_quantity,
    })),
  )
  if (balanceError) throw balanceError
}

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

    const { data: activeMemberships, error: membershipError } = await adminClient
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
    if (membershipError) throw membershipError
    if (activeMemberships?.length)
      return json({ error: 'This account already has an active company workspace.' }, 409)

    const {
      companyName,
      branchName,
      fullName,
      businessMode = 'retail',
      currencyCode = 'NGN',
    } = await request.json()
    if (![companyName, branchName, fullName].every((value) => typeof value === 'string' && value.trim())) {
      return json({ error: 'Company name, first branch name, and your name are required.' }, 400)
    }
    if (!['retail', 'services', 'hybrid'].includes(businessMode))
      return json({ error: 'Choose a valid business model.' }, 400)
    if (!['NGN', 'GHS', 'KES', 'ZAR', 'USD'].includes(currencyCode))
      return json({ error: 'Choose a valid business currency.' }, 400)
    const businessModes = businessMode === 'hybrid' ? ['retail', 'services'] : [businessMode]
    const slug = `${slugify(companyName)}-${crypto.randomUUID().slice(0, 8)}`
    const { data: organization, error: organizationError } = await adminClient
      .from('organizations')
      .insert({ name: companyName.trim(), slug, status: 'trial', business_modes: businessModes })
      .select('id')
      .single()
    if (organizationError || !organization) throw organizationError ?? new Error('Could not create company')

    const { data: store, error: storeError } = await adminClient
      .from('stores')
      .insert({
        organization_id: organization.id,
        name: branchName.trim(),
        currency_code: currencyCode,
        is_primary: true,
        status: 'active',
      })
      .select('id')
      .single()
    if (storeError || !store) {
      await adminClient.from('organizations').delete().eq('id', organization.id)
      throw storeError ?? new Error('Could not create first branch')
    }

    const [{ error: subscriptionError }, { error: profileError }, { error: membershipInsertError }] =
      await Promise.all([
        adminClient.from('organization_subscriptions').insert({
          organization_id: organization.id,
          plan_code: 'starter',
          status: 'trial',
          trial_started_at: new Date().toISOString(),
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        adminClient
          .from('profiles')
          .upsert({ id: user.id, store_id: store.id, full_name: fullName.trim(), role: 'admin' }),
        adminClient
          .from('organization_memberships')
          .upsert({ organization_id: organization.id, user_id: user.id, role: 'admin', status: 'active' }),
      ])
    if (subscriptionError || profileError || membershipInsertError) {
      await adminClient.from('organizations').delete().eq('id', organization.id)
      throw subscriptionError ?? profileError ?? membershipInsertError
    }
    return json({ organizationId: organization.id, storeId: store.id, role: 'admin' }, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500)
  }
})
