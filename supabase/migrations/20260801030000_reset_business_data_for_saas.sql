-- Intentional SaaS reset. This preserves auth.users so the current login can
-- complete onboarding again, but removes every business record and tenant.
truncate table public.organizations restart identity cascade;
