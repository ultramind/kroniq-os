import { DeleteOutlined } from '@ant-design/icons'
import { Button, Input, Modal, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import type { Product } from '../../types'

type Props = { product?: Product; maxQuantity: number; open: boolean; onClose: () => void; onConfirm: (quantity: number) => void }

export function QuantityKeypadModal({ product, maxQuantity, open, onClose, onConfirm }: Props) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue('') }, [open, product?.id])
  const quantity = Number(value)
  const valid = Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity
  const append = (digit: string) => setValue((current) => (current + digit).replace(/^0+(?=\d)/, '').slice(0, 5))
  return <Modal open={open} title="Add quantity" footer={null} onCancel={onClose} destroyOnClose>
    {product && <div className="mb-5"><Typography.Text strong className="block text-base">{product.name}</Typography.Text><Typography.Text type="secondary">{formatNaira(product.price)} each · {maxQuantity} available to add</Typography.Text></div>}
    <Input value={value || '0'} readOnly size="large" className="mb-4 !h-14 !text-center !text-2xl !font-semibold" aria-label="Quantity" />
    <div className="grid grid-cols-3 gap-2">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <Button key={digit} className="!h-14 !text-xl" onClick={() => append(digit)}>{digit}</Button>)}
      <Button className="!h-14" onClick={() => setValue('')}>Clear</Button>
      <Button className="!h-14 !text-xl" onClick={() => append('0')}>0</Button>
      <Button aria-label="Delete last digit" className="!h-14 !text-lg" icon={<DeleteOutlined />} onClick={() => setValue((current) => current.slice(0, -1))} />
    </div>
    {value && !valid && <Typography.Text type="danger" className="mt-3 block">Enter a quantity from 1 to {maxQuantity}.</Typography.Text>}
    <Button type="primary" block size="large" className="mt-5 !h-12" disabled={!valid} onClick={() => { onConfirm(quantity); onClose() }}>Add {valid ? quantity : ''} to cart</Button>
  </Modal>
}
