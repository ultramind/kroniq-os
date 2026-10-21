alter table public.storefront_sections
  drop constraint if exists storefront_sections_section_type_check;
alter table public.storefront_sections
  add constraint storefront_sections_section_type_check
  check (section_type in ('text', 'banner', 'collection', 'testimonials', 'faq'));
