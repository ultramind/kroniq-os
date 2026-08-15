# Supabase production setup

The frontend is already connected to Supabase through `.env.local`; these steps create the project data and staff access it needs.

## 1. Create the project

Create a Supabase project in the region closest to the store. In **Authentication → Providers**, keep Email enabled and disable public sign-up if staff accounts will be created only by an administrator.

Copy the project URL and anonymous key into a new local file:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never commit `.env.local` or the Supabase service-role key.

## 2. Apply database files in order

In the Supabase SQL Editor, run these files in order:

1. `supabase/migrations/20260730180000_initial_schema.sql`
2. `supabase/migrations/20260730190000_stock_movements.sql`
3. `supabase/migrations/20260730200000_returns.sql`
4. `supabase/migrations/20260730210000_record_sales_atomically.sql`
5. `supabase/migrations/20260730220000_secure_stores.sql`
6. `supabase/migrations/20260730230000_record_sale_movements.sql`
7. `supabase/migrations/20260730240000_cash_shifts.sql`
8. `supabase/migrations/20260730250000_sale_discounts.sql`
9. `supabase/migrations/20260730260000_partial_returns.sql`
10. `supabase/migrations/20260730270000_return_selected_sale_items.sql`
11. `supabase/migrations/20260730280000_enable_sales_realtime.sql`
12. `supabase/migrations/20260730290000_record_discounted_sales.sql`
13. `supabase/migrations/20260730300000_recover_legacy_discounted_sales.sql`
14. `supabase/migrations/20260730310000_product_cost_prices.sql`
15. `supabase/migrations/20260730320000_snapshot_sale_item_cost.sql`
16. `supabase/migrations/20260730330000_manage_categories.sql`
17. `supabase/migrations/20260730340000_supplier_deliveries.sql`
18. `supabase/migrations/20260730350000_fix_inventory_access.sql`
19. `supabase/migrations/20260730360000_delivery_received_date.sql`
20. `supabase/migrations/20260730370000_customer_credit.sql`
21. `supabase/migrations/20260730380000_mark_credit_paid.sql`
22. `supabase/migrations/20260730390000_credit_initial_payment.sql`
23. `supabase/migrations/20260730400000_product_low_stock_threshold.sql`
24. `supabase/migrations/20260730410000_credit_payment_history.sql`
25. `supabase/migrations/20260730420000_fix_credit_payment_role_check.sql`
26. `supabase/migrations/20260730430000_expenses.sql`
27. `supabase/migrations/20260730440000_optional_warehouses.sql`
28. `supabase/migrations/20260730450000_receive_deliveries_into_locations.sql`
29. `supabase/seed.sql`

The seed creates **Naira POS Supermarket**, starter categories, and a small ₦ catalogue. Currency is stored as kobo in Postgres and displayed as ₦ in the app.

## 3. Add staff accounts and roles

1. In **Authentication → Users**, create each staff email/password account.
2. Copy each account’s UUID.
3. Run this statement once per user, replacing the values:

```sql
insert into public.profiles (id, store_id, full_name, role)
select 'AUTH_USER_UUID', id, 'Staff member name', 'cashier'::public.app_role
from public.stores
where name = 'Naira POS Supermarket';
```

Use `admin`, `manager`, or `cashier` for the role. Create at least one admin before any staff member signs in.

## 4. Verify

Run `npm run dev`, sign in with a staff account, and confirm:

- The demo-mode label becomes **Offline-first**.
- The displayed role matches the staff profile.
- Products load from Supabase after reconnecting.
- A test sale syncs from the pending queue.

## 5. Deploy admin staff management

The **Staff** page is available only to admins and calls a server-side Edge Function. Install the Supabase CLI, authenticate, link this project, and deploy it:

```bash
supabase functions deploy manage-staff
```

The function uses Supabase-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` values at runtime. Do not put the service-role key in `.env.local` or the browser.

## Production note

The current client handles local persistence and synchronization. Put Supabase backups and database-alert monitoring in place before operational use.
