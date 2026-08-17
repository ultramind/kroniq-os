import { BarcodeOutlined } from '@ant-design/icons'
import { Button, Card, Tag, Typography } from 'antd'
import { formatNaira } from '../../lib/currency'
import type { Product } from '../../types'

const { Title, Text } = Typography
export function ProductCard({ product, onAdd }: { product: Product; onAdd: () => void }) {
  return (
    <Card size="small" className="touch-card flex h-full flex-col shadow-sm" bodyStyle={{ padding: 18 }}>
      <div className="flex min-h-36 flex-col">
        <Tag color="green" className="!m-0 w-fit">
          {product.category}
        </Tag>
        <Title level={5} className="!mb-1 !mt-3">
          {product.name}
        </Title>
        <Text type="secondary" className="text-xs">
          SKU {product.sku}
        </Text>
        <div className="mt-auto flex items-center justify-between">
          <Text strong>{formatNaira(product.price)}</Text>
          <Text type={product.stock < 10 ? 'danger' : 'secondary'} className="text-xs">
            {product.stock} in stock
          </Text>
        </div>
      </div>
      <Button
        type="primary"
        size="large"
        block
        className="touch-target mt-4 text-base font-semibold active:scale-[0.98]"
        disabled={!product.stock}
        onClick={onAdd}
        icon={<BarcodeOutlined />}
      >
        {product.stock ? 'Add to cart' : 'Out of stock'}
      </Button>
    </Card>
  )
}
