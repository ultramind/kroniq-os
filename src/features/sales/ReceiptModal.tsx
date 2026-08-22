import { useEffect, useState } from 'react'
import { Button, Descriptions, Divider, Modal, Space, Typography, message } from 'antd'
import { PrinterOutlined, ShareAltOutlined } from '@ant-design/icons'
import { formatNaira } from '../../lib/currency'
import { initials } from '../../lib/initials'
import type { ReceiptItem, Sale } from '../../types'
import { getStoreSettings } from '../../lib/storeSettings'
import { supabase } from '../../supabase'
import { printReceiptDirect, receiptShareText } from '../../lib/directPrint'

const { Title, Text } = Typography
type Props = { sale?: Sale; items: ReceiptItem[]; onClose: () => void }
export function ReceiptModal({ sale, items, onClose }: Props) {
  const [api, holder] = message.useMessage()
  const [brand, setBrand] = useState<{ companyName: string; logoUrl: string }>({
    companyName: '',
    logoUrl: '',
  })
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!sale || !supabase) return

    void (async () => {
      const { data } = await supabase.rpc('current_store_invoice_brand').maybeSingle()
      const invoiceBrand = data as { company_name?: string | null; logo_url?: string | null } | null
      setBrand({ companyName: invoiceBrand?.company_name ?? '', logoUrl: invoiceBrand?.logo_url ?? '' })
    })()
  }, [sale])

  if (!sale) return null
  const settings = getStoreSettings()
  const businessName = brand.companyName || settings.storeName || 'Kroniqos'
  const initialPayment = sale.creditInitialPayment ?? 0
  const creditBalance = Math.max(0, sale.total - initialPayment)
  const printReceipt = async () => {
    setPrinting(true)
    try {
      await printReceiptDirect({
        sale,
        items,
        companyName: businessName,
        logoUrl: brand.logoUrl || undefined,
      })
    } catch {
      // QZ Tray is optional. Browser printing keeps receipts available on mobile
      // devices and any machine where a local printer connector is not installed.
      window.print()
    } finally {
      setPrinting(false)
    }
  }
  const shareReceipt = async () => {
    const text = receiptShareText({ sale, items, companyName: businessName })
    try {
      if (navigator.share) {
        await navigator.share({ title: `Receipt ${sale.receiptNo}`, text })
        return
      }
      await navigator.clipboard.writeText(text)
      api.success('Receipt copied. You can paste it into WhatsApp or SMS.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      api.error('Could not share this receipt.')
    }
  }
  return (
    <>
      {holder}
      <Modal
        open
        title={sale.paymentMethod === 'order' ? 'Order receipt' : 'Sale complete'}
        onCancel={onClose}
        footer={
          <Space>
            <Button onClick={onClose}>Close</Button>
            <Button
              icon={<ShareAltOutlined />}
              aria-label="Share receipt"
              className="!px-2 sm:!px-4"
              onClick={() => void shareReceipt()}
            >
              <span className="hidden sm:inline">Share receipt</span>
            </Button>
            <Button
              type="primary"
              icon={<PrinterOutlined />}
              loading={printing}
              onClick={() => void printReceipt()}
            >
              Print receipt
            </Button>
          </Space>
        }
      >
        <section id="receipt" className="mx-auto max-w-sm text-sm">
          <div className="text-center">
            {brand.logoUrl ? (
              <img
                src={brand.logoUrl}
                alt={`${businessName} logo`}
                className="mx-auto mb-2 h-12 max-w-40 object-contain"
              />
            ) : (
              <span className="mx-auto mb-2 grid h-12 w-12 place-items-center bg-[#0B1121] text-sm font-bold text-white">
                {initials(businessName)}
              </span>
            )}
            <Title level={4} className="!mb-1">
              {businessName}
            </Title>
            <Text type="secondary">
              {settings.address || 'Sales receipt'}
              {settings.phone ? ` · ${settings.phone}` : ''}
            </Text>
          </div>
          <Divider />
          <Descriptions
            column={1}
            size="small"
            colon={false}
            items={[
              { key: 'receipt', label: 'Receipt', children: sale.receiptNo },
              { key: 'date', label: 'Date', children: new Date(sale.createdAt).toLocaleString('en-NG') },
              { key: 'payment', label: 'Payment', children: sale.paymentMethod.replace('_', ' ') },
            ]}
          />
          <Divider />
          {items.map((item, index) => (
            <div key={`${item.productName}-${index}`} className="mb-3 flex justify-between gap-3">
              <div>
                <Text>{item.productName}</Text>
                <br />
                <Text type="secondary">
                  {item.quantity} × {formatNaira(item.unitPrice)}
                </Text>
              </div>
              <Text strong>{formatNaira(item.quantity * item.unitPrice)}</Text>
            </div>
          ))}
          <Divider />
          <div className="flex justify-between text-base">
            <Text strong>Total</Text>
            <Text strong>{formatNaira(sale.total)}</Text>
          </div>
          {(sale.paymentMethod === 'credit' || sale.paymentMethod === 'order') && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
              <div className="flex justify-between">
                <Text type="secondary">
                  {sale.paymentMethod === 'order' ? 'Amount paid' : 'Initial deposit'}
                </Text>
                <Text>{formatNaira(initialPayment)}</Text>
              </div>
              <div className="flex justify-between text-base">
                <Text strong>Balance due</Text>
                <Text strong>{formatNaira(creditBalance)}</Text>
              </div>
              {sale.creditDueDate && (
                <div className="flex justify-between">
                  <Text type="secondary">Expected payment</Text>
                  <Text>
                    {new Date(`${sale.creditDueDate}T12:00:00`).toLocaleDateString('en-NG', {
                      dateStyle: 'medium',
                    })}
                  </Text>
                </div>
              )}
            </div>
          )}
          <Text type="secondary" className="mt-5 block text-center">
            {settings.receiptFooter || 'Thank you for shopping with us.'}
          </Text>
        </section>
      </Modal>
    </>
  )
}
