import { Button, Descriptions, Divider, Modal, Space, Typography } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { formatNaira } from '../../lib/currency'
import type { ReceiptItem, Sale } from '../../types'
import { getStoreSettings } from '../../lib/storeSettings'

const { Title, Text } = Typography
type Props = { sale?: Sale; items: ReceiptItem[]; onClose: () => void }
export function ReceiptModal({ sale, items, onClose }: Props) {
  if (!sale) return null
  const settings = getStoreSettings()
  return <Modal open title="Sale complete" onCancel={onClose} footer={<Space><Button onClick={onClose}>Close</Button><Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>Print receipt</Button></Space>}>
    <section id="receipt" className="mx-auto max-w-sm text-sm">
      <div className="text-center"><Title level={4} className="!mb-1">{settings.storeName}</Title><Text type="secondary">{settings.address || 'Supermarket receipt'}{settings.phone ? ` · ${settings.phone}` : ''}</Text></div>
      <Divider />
      <Descriptions column={1} size="small" colon={false} items={[{ key: 'receipt', label: 'Receipt', children: sale.receiptNo }, { key: 'date', label: 'Date', children: new Date(sale.createdAt).toLocaleString('en-NG') }, { key: 'payment', label: 'Payment', children: sale.paymentMethod.replace('_', ' ') }]} />
      <Divider />
      {items.map((item, index) => <div key={`${item.productName}-${index}`} className="mb-3 flex justify-between gap-3"><div><Text>{item.productName}</Text><br/><Text type="secondary">{item.quantity} × {formatNaira(item.unitPrice)}</Text></div><Text strong>{formatNaira(item.quantity * item.unitPrice)}</Text></div>)}
      <Divider />
      <div className="flex justify-between text-base"><Text strong>Total</Text><Text strong>{formatNaira(sale.total)}</Text></div>
      <Text type="secondary" className="mt-5 block text-center">{settings.receiptFooter || 'Thank you for shopping with us.'}</Text>
    </section>
  </Modal>
}
