-- Fill the default fulfilment cost for existing orders that were created
-- before order_cost_kobo was calculated on creation.
update public.sales as sale
set order_cost_kobo = costs.total_cost_kobo
from (
  select
    item.sale_id,
    sum(coalesce(item.cost_price_kobo, product.cost_price_kobo, 0) * item.quantity) as total_cost_kobo
  from public.sale_items as item
  join public.products as product on product.id = item.product_id
  group by item.sale_id
) as costs
where sale.id = costs.sale_id
  and sale.payment_method = 'order'
  and sale.order_cost_kobo is null;
