import { CloseOutlined } from '@ant-design/icons'
import { Button, Card, List, Popconfirm } from 'antd'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import type { HeldSale } from '../../types'

type HeldSalesProps = {
  sales: HeldSale[]
  onResume: (sale: HeldSale) => void
}

export function HeldSales({ sales, onResume }: HeldSalesProps) {
  return (
    <Card title={`Held sales (${sales.length})`}>
      <List
        dataSource={sales}
        locale={{ emptyText: 'No held sales.' }}
        renderItem={(sale) => (
          <List.Item
            className="!items-center"
            actions={[
              <div key="actions" className="flex items-center gap-2">
                <Button type="primary" onClick={() => onResume(sale)}>
                  Resume
                </Button>
                <Popconfirm
                  title="Discard this held sale?"
                  description="This removes the parked cart from this device."
                  okText="Discard"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => void db.heldSales.delete(sale.id)}
                >
                  <Button danger aria-label="Discard held sale" icon={<CloseOutlined />} />
                </Popconfirm>
              </div>,
            ]}
          >
            <div className="flex items-center">
              {sale.items.length} item(s) ·{' '}
              {formatNaira(sale.items.reduce((total, item) => total + item.price * item.quantity, 0))}
            </div>
          </List.Item>
        )}
      />
    </Card>
  )
}
