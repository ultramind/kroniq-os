import type { Product, Role } from '../types'
import { InventoryOverview } from '../features/inventory/InventoryOverview'
import { InventoryMovementHistory } from '../features/inventory/InventoryMovementHistory'
import type { StockMovement } from '../types'

export function InventoryPage({ products, movements, role, onAdjustProduct, onCountProduct }: { products: Product[]; movements: StockMovement[]; role: Role; onAdjustProduct: (product: Product) => void; onCountProduct: (product: Product) => void }) {
  return <div className="space-y-6"><InventoryOverview products={products} role={role} onAdjustProduct={onAdjustProduct} onCountProduct={onCountProduct} /><InventoryMovementHistory products={products} movements={movements} /></div>
}
