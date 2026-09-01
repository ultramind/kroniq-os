import { db } from '../../db'
import { supabase } from '../../supabase'
import type { Product } from '../../types'

export type ProductDetails = Pick<
  Product,
  | 'name'
  | 'sku'
  | 'price'
  | 'costPrice'
  | 'minimumSellingPrice'
  | 'lowStockThreshold'
  | 'active'
  | 'description'
  | 'imageUrl'
  | 'imageUrls'
  | 'onlinePublished'
  | 'featured'
>

export type ProductLifecycleAction = 'archive' | 'restore' | 'delete'

export async function manageProductLifecycle(product: Product, action: ProductLifecycleAction) {
  if (!supabase || !navigator.onLine)
    throw new Error('Product lifecycle changes require an internet connection.')
  const { error } = await supabase.rpc('manage_product_lifecycle', {
    p_product_id: product.id,
    p_action: action,
  })
  if (error) throw error
  if (action === 'delete') await db.products.delete(product.id)
  else
    await db.products.update(product.id, {
      active: action === 'restore',
      ...(action === 'archive' ? { onlinePublished: false } : {}),
    })
}

export async function updateProductDetails(product: Product, details: ProductDetails) {
  if (supabase) {
    if (!navigator.onLine) throw new Error('Product changes require an internet connection.')
    const imageUrls = (details.imageUrls ?? (details.imageUrl ? [details.imageUrl] : [])).slice(0, 2)
    const { error } = await supabase.rpc('update_product_details', {
      p_product_id: product.id,
      p_product: {
        name: details.name.trim().toUpperCase(),
        sku: details.sku,
        price_kobo: Math.round(details.price * 100),
        cost_price_kobo: Math.round(details.costPrice * 100),
        minimum_selling_price_kobo:
          details.minimumSellingPrice === undefined ? null : Math.round(details.minimumSellingPrice * 100),
        low_stock_threshold: details.lowStockThreshold,
        active: details.active ?? true,
        description: details.description ?? null,
        image_urls: imageUrls,
        online_published: details.onlinePublished ?? false,
        is_featured: details.featured ?? false,
      },
    })
    if (error) throw error
  }
  await db.products.update(product.id, {
    ...details,
    name: details.name.trim().toUpperCase(),
  })
}
