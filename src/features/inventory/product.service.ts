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
  | 'active'
  | 'description'
  | 'imageUrl'
  | 'imageUrls'
  | 'onlinePublished'
  | 'featured'
>
export async function updateProductDetails(product: Product, details: ProductDetails) {
  if (supabase) {
    if (!navigator.onLine) throw new Error('Product changes require an internet connection.')
    const imageUrls = (details.imageUrls ?? (details.imageUrl ? [details.imageUrl] : [])).slice(0, 2)
    const { error } = await supabase
      .from('products')
      .update({
        name: details.name,
        sku: details.sku,
        price_kobo: Math.round(details.price * 100),
        cost_price_kobo: Math.round(details.costPrice * 100),
        minimum_selling_price_kobo:
          details.minimumSellingPrice === undefined ? null : Math.round(details.minimumSellingPrice * 100),
        active: details.active ?? true,
        description: details.description ?? null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        online_published: details.onlinePublished ?? false,
        is_featured: details.featured ?? false,
        published_at:
          details.onlinePublished && !product.onlinePublished ? new Date().toISOString() : undefined,
      })
      .eq('id', product.id)
    if (error) throw error
  }
  await db.products.update(product.id, details)
}
