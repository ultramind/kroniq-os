import { RollbackOutlined, SwapOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import type { Product, Role } from '../../types'

type Props = {
  product?: Product
  maxQuantity: number
  open: boolean
  role: Role
  flexiblePricingEnabled: boolean
  onClose: () => void
  onConfirm: (quantity: number, agreedPrice: number, priceOverrideReason?: string) => void
}

export function QuantityKeypadModal({ product, maxQuantity, open, role, flexiblePricingEnabled, onClose, onConfirm }: Props) {
  const [quantityValue, setQuantityValue] = useState('')
  const [priceValue, setPriceValue] = useState('')
  const [editingPrice, setEditingPrice] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => { if (open && product) { setQuantityValue(''); setPriceValue(String(Math.round(product.price))); setEditingPrice(false); setReason('') } }, [open, product?.id])
  const quantity = Number(quantityValue)
  const agreedPrice = Number(priceValue)
  const productFlexiblePricingEnabled = flexiblePricingEnabled && product?.minimumSellingPrice !== undefined
  const priceChanged = Boolean(product && agreedPrice !== product.price)
  const cashiersCanChange = Boolean(productFlexiblePricingEnabled)
  const belowFloor = Boolean(product?.minimumSellingPrice !== undefined && agreedPrice < (product?.minimumSellingPrice ?? 0))
  const requiresReason = priceChanged && role !== 'cashier' && belowFloor
  const quantityValid = Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity
  const priceValid = Number.isFinite(agreedPrice) && agreedPrice >= 0 && (!priceChanged || (productFlexiblePricingEnabled && (role !== 'cashier' || (cashiersCanChange && agreedPrice <= (product?.price ?? 0) && !belowFloor))))
  const valid = quantityValid && priceValid && (!requiresReason || reason.trim().length >= 3)
  const activeValue = editingPrice ? priceValue : quantityValue
  const setActiveValue = editingPrice ? setPriceValue : setQuantityValue
  const displayValue = useMemo(() => editingPrice ? (priceValue ? formatNaira(agreedPrice) : '₦0.00') : (quantityValue || '0'), [agreedPrice, editingPrice, priceValue, quantityValue])
  const append = (digit: string) => setActiveValue((current) => (current + digit).replace(/^0+(?=\d)/, '').slice(0, editingPrice ? 8 : 5))
  if (!product) return null
  return <Modal open={open} title="Add to current sale" footer={null} onCancel={onClose} destroyOnClose>
    <div className="mb-4"><Typography.Text strong className="block text-base">{product.name}</Typography.Text><Typography.Text type="secondary">Default {formatNaira(product.price)} · {maxQuantity} available to add</Typography.Text></div>
    <div className={`mb-3 grid gap-2 ${productFlexiblePricingEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}><Button type={!editingPrice ? 'primary' : 'default'} className="!h-12" onClick={() => setEditingPrice(false)}>Quantity</Button>{productFlexiblePricingEnabled && <Button type={editingPrice ? 'primary' : 'default'} className="!h-12" icon={<SwapOutlined />} onClick={() => setEditingPrice(true)}>Set agreed price</Button>}</div>
    <Input value={displayValue} readOnly size="large" className="mb-4 !h-14 !text-center !text-2xl !font-semibold" aria-label={editingPrice ? 'Agreed unit price' : 'Quantity'} />
    {editingPrice && <div className="mb-4"><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Default: {formatNaira(product.price)}</span>{product.minimumSellingPrice !== undefined ? <span className={belowFloor ? 'font-semibold text-red-600' : 'text-slate-500'}>Cashier floor: {formatNaira(product.minimumSellingPrice)}</span> : <span className="text-amber-700">Flexible price not enabled</span>}</div><Button size="small" className="!mt-2" onClick={() => setPriceValue(String(Math.round(product.price)))}>Use default price</Button></div>}
    <div className="grid grid-cols-3 gap-2">{['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <Button key={digit} className="!h-14 !w-full !text-xl" onClick={() => append(digit)}>{digit}</Button>)}<Button className="!h-14 !w-full" onClick={() => setActiveValue('')}>Clear</Button><Button className="!h-14 !w-full !text-xl" onClick={() => append('0')}>0</Button><Button aria-label="Delete last digit" className="!h-14 !w-full !text-lg" icon={<RollbackOutlined />} onClick={() => setActiveValue((current) => current.slice(0, -1))} /></div>
    {editingPrice && priceChanged && <Alert className="mt-4" type="warning" showIcon message={agreedPrice > product.price ? `Agreed price is ${formatNaira(agreedPrice - product.price)} above the default price.` : belowFloor ? 'This price requires manager approval.' : `Customer saves ${formatNaira(product.price - agreedPrice)} per item.`} />}
    {requiresReason && <Input className="mt-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for below-floor price" aria-label="Reason for below-floor price" />}
    {quantityValue && !quantityValid && <Typography.Text type="danger" className="mt-3 block">Enter a quantity from 1 to {maxQuantity}.</Typography.Text>}
    {editingPrice && !priceValid && <Typography.Text type="danger" className="mt-3 block">This agreed price is not allowed for your role.</Typography.Text>}
    <Button type="primary" block size="large" className="mt-5 !h-12" disabled={!valid} onClick={() => { onConfirm(quantity, agreedPrice, priceChanged ? reason.trim() || undefined : undefined); onClose() }}>{priceChanged ? `Add at ${formatNaira(agreedPrice)}` : `Add ${quantityValid ? quantity : ''} to cart`}</Button>
  </Modal>
}
