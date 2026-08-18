-- Keep the application-owned checkout-settings RPC signature. PostgreSQL cannot
-- choose between it and a manually-added AI-language overload when callers send
-- only p_flexible_pricing_enabled.
drop function if exists public.update_current_store_checkout_settings(boolean, text);
