import { ExclamationCircleOutlined } from '@ant-design/icons'
import { Button, Card, List, Statistic, Typography } from 'antd'
import type { Product, Role } from '../../types'

const { Text } = Typography
type Props = {
  products: Product[]
  role: Role
  onAdjustProduct: (product: Product) => void
  onCountProduct: (product: Product) => void
}
export function InventoryOverview({ products, role, onAdjustProduct, onCountProduct }: Props) {
  const savedSettings = JSON.parse(localStorage.getItem('naira-pos-settings') ?? '{}') as {
    lowStock?: number
  }
  const lowStockThreshold = Number(savedSettings.lowStock ?? 10)
  const activeProducts = products.filter((product) => product.active !== false)
  const needsAttention = activeProducts.filter(
    (product) => product.stock <= (product.lowStockThreshold ?? lowStockThreshold),
  )
  const lowStock = needsAttention.length
  return (
    <Card className="overflow-hidden border-0 shadow-sm" bodyStyle={{ padding: 0 }}>
      <div className="bg-gradient-to-r from-[#0B1121] to-[#1d2d46] px-4 py-4 text-white sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[.15em] text-slate-300">
              Inventory control
            </p>
            <h2 className="mb-0 text-xl font-semibold sm:text-2xl">Stock health</h2>
            <p className="mb-0 mt-1 text-sm text-slate-300/80">
              Monitor items that need a count or adjustment.
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-right sm:px-4">
            <p className="mb-0 text-xs text-slate-300">Active products</p>
            <p className="mb-0 text-2xl font-semibold">{activeProducts.length}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className={`rounded-xl p-4 sm:p-5 ${lowStock ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className="flex items-center gap-2">
            <ExclamationCircleOutlined className={lowStock ? 'text-amber-600' : 'text-[#0B1121]'} />
            <Text strong>Attention needed</Text>
          </div>
          <Statistic
            className="mt-3"
            value={lowStock}
            valueStyle={{ fontSize: 34, color: lowStock ? '#d46b08' : '#0B1121' }}
            suffix={<span className="text-sm font-normal text-slate-500">products</span>}
          />
          <Text type="secondary" className="mt-1 block text-xs">
            Based on each product’s alert level.
          </Text>
        </div>
        {role !== 'cashier' && (
          <div className="min-w-0">
            <Text strong className="mb-2 block">
              Low-stock queue
            </Text>
            <List
              className="low-stock-queue"
              size="small"
              dataSource={needsAttention}
              pagination={
                needsAttention.length > 10
                  ? {
                      pageSize: 10,
                      size: 'small',
                      showSizeChanger: false,
                      position: 'bottom',
                      align: 'end',
                    }
                  : false
              }
              locale={{ emptyText: 'All products are above their alert quantities.' }}
              renderItem={(product) => (
                <List.Item className="!block !px-0">
                  <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Text strong className="block break-words leading-5">
                        {product.name}
                      </Text>
                      <Text type="secondary" className="mt-0.5 block text-xs leading-5">
                        {product.category || 'Uncategorised'}
                      </Text>
                      <Text type="danger" className="mt-0.5 block text-xs leading-5">
                        {product.stock} in stock · alert at {product.lowStockThreshold ?? lowStockThreshold}
                      </Text>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                      <Button size="middle" onClick={() => onCountProduct(product)}>
                        Count
                      </Button>
                      <Button type="primary" size="middle" onClick={() => onAdjustProduct(product)}>
                        Adjust
                      </Button>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </Card>
  )
}
