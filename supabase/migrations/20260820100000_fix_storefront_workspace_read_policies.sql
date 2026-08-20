-- Storefront upserts require the caller to be able to read the existing row.
-- The workspace-safe write migration intentionally split the old ALL policies,
-- but omitted the corresponding admin read policies for these tenant controls.

drop policy if exists "active admins view storefront" on public.storefronts;
create policy "active admins view storefront" on public.storefronts
for select to authenticated
using (public.has_active_store_membership(store_id, array['admin']));

drop policy if exists "active admins view storefront sections" on public.storefront_sections;
create policy "active admins view storefront sections" on public.storefront_sections
for select to authenticated
using (public.has_active_store_membership(store_id, array['admin']));

drop policy if exists "active admins view storefront testimonials" on public.storefront_testimonials;
create policy "active admins view storefront testimonials" on public.storefront_testimonials
for select to authenticated
using (public.has_active_store_membership(store_id, array['admin']));
