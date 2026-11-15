import { db } from '../../db'
import { supabase } from '../../supabase'
import type { Product } from '../../types'

export type ProductDetails = Pick<
  Product,
  | 'category'
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
  | 'barcodeAliases'
>

export type ProductLifecycleAction = 'archive' | 'restore' | 'delete'

export async function publishAllActiveProducts() {
  if (!supabase || !navigator.onLine) throw new Error('Publishing products requires an internet connection.')
  const { data, error } = await supabase.rpc('publish_all_current_store_products')
  if (error) throw error
  return Number(data ?? 0)
}

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
    const imageUrls = (details.imageUrls ?? (details.imageUrl ? [details.imageUrl] : [])).slice(0, 3)
    const { error } = await supabase.rpc('update_product_details', {
      p_product_id: product.id,
      p_product: {
        name: details.name.trim().toUpperCase(),
        category_name: details.category.trim(),
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
        barcode_aliases: (details.barcodeAliases ?? [])
          .filter((alias) => alias.barcode?.trim())
          .map((alias) => ({
            barcode: alias.barcode.trim(),
            label: alias.label?.trim() || null,
          })),
      },
    })
    if (error) throw error
  }
  await db.products.update(product.id, {
    ...details,
    name: details.name.trim().toUpperCase(),
    barcodeAliases: details.barcodeAliases
      ?.filter((alias) => alias.barcode?.trim())
      .map((alias) => ({
        ...alias,
        barcode: alias.barcode.trim(),
        label: alias.label?.trim() || undefined,
      })),
  })
}
