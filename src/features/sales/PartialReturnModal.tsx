import { Alert, InputNumber, Modal, Table, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { formatNaira } from '../../lib/currency'
import type { Sale, SaleItem } from '../../types'

const { Text } = Typography

type Props = {
  sale?: Sale
  open: boolean
  saving?: boolean
  onClose: () => void
  onSubmit: (sale: Sale, selected: Array<{ item: SaleItem; quantity: number }>) => void
}

export function PartialReturnModal({ sale, open, saving, onClose, onSubmit }: Props) {
  const [items, setItems] = useState<SaleItem[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!sale || !open) return
    void db.saleItems.where('saleId').equals(sale.id).toArray().then((saleItems) => {
      setItems(saleItems)
      setQuantities({})
    })
  }, [sale, open])

  const selected = useMemo(() => items.flatMap((item) => quantities[item.id] ? [{ item, quantity: quantities[item.id] }] : []), [items, quantities])
  const returnTotal = selected.reduce((total, { item, quantity }) => total + item.unitPrice * quantity, 0)

  return <Modal open={open} title={sale ? `Return items · ${sale.receiptNo}` : 'Return items'} okText={`Record return${returnTotal ? ` · ${formatNaira(returnTotal)}` : ''}`} okButtonProps={{ danger: true, disabled: !selected.length }} confirmLoading={saving} onCancel={onClose} onOk={() => sale && onSubmit(sale, selected)} width={720}>
    <Alert className="mb-4" type="info" showIcon message="Select only the quantities received back. Stock is restored immediately and the return is queued for sync." />
    <Table rowKey="id" size="small" pagination={false} dataSource={items} locale={{ emptyText: 'Sale items are unavailable on this device.' }} columns={[
      { title: 'Item', dataIndex: 'productName', key: 'productName', render: (name: string, item: SaleItem) => <div><Text strong>{name}</Text><br /><Text type="secondary" className="text-xs">{formatNaira(item.unitPrice)} each</Text></div> },
      { title: 'Sold', dataIndex: 'quantity', key: 'quantity' },
      { title: 'Previously returned', key: 'returned', render: (_: unknown, item: SaleItem) => item.returnedQuantity ?? 0 },
      { title: 'Return now', key: 'returnNow', render: (_: unknown, item: SaleItem) => { const available = item.quantity - (item.returnedQuantity ?? 0); return <InputNumber min={0} max={available} precision={0} disabled={available === 0} value={quantities[item.id] ?? 0} onChange={(value) => setQuantities((current) => ({ ...current, [item.id]: Number(value ?? 0) }))} /> } },
    ]} />
  </Modal>
}
