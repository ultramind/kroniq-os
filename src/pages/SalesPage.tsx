import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Select, Space, Statistic } from 'antd'
import { useMemo, useState } from 'react'
import { exportSalesCsv } from '../features/sales/exportSalesCsv'
import { PartialReturnModal } from '../features/sales/PartialReturnModal'
import { RecentSales } from '../features/sales/RecentSales'
import { ReturnActivityTable } from '../features/sales/ReturnActivityTable'
import type { ReturnActivity, Role, Sale, SaleItem } from '../types'
import { formatNaira } from '../lib/currency'
import { BulkCsvImportModal, type CsvRow } from '../components/BulkCsvImportModal'
import { supabase } from '../supabase'
import { pullProducts, pullSales } from '../sync'

type Props = {
  recentSales: Sale[]
  allSales: Sale[]
  returnActivities: ReturnActivity[]
  role: Role
  onViewReceipt: (sale: Sale) => void
  onReturnSale: (sale: Sale, selected: Array<{ item: SaleItem; quantity: number }>) => void
}

export function SalesPage({
  recentSales,
  allSales,
  returnActivities,
  role,
  onViewReceipt,
  onReturnSale,
}: Props) {
  const [method, setMethod] = useState<string>('all')
  const [date, setDate] = useState<string>()
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [returningSale, setReturningSale] = useState<Sale>()
  const [bulkOpen, setBulkOpen] = useState(false)
  const filtered = useMemo(
    () =>
      allSales.filter(
        (sale) =>
          (method === 'all' || sale.paymentMethod === method) &&
          (!date || sale.createdAt.slice(0, 10) === date),
      ),
    [allSales, method, date],
  )
  const shown = filtered
    .slice()
    .sort((a, b) =>
      sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
    )
    .slice(0, 20)
  const total = filtered
    .filter((sale) => sale.status !== 'returned')
    .reduce((sum, sale) => sum + sale.total, 0)
  const today = new Date().toISOString().slice(0, 10)
  const todaySales = allSales.filter(
    (sale) => sale.createdAt.slice(0, 10) === today && sale.status !== 'returned',
  )
  const todayTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0)
  async function importSales(rows: CsvRow[]) {
    if (!supabase) throw new Error('Sales import requires Supabase to be configured.')
    if (role === 'cashier') throw new Error('Only managers and admins can import historical sales.')
    const byReceipt = new Map<string, CsvRow[]>()
    rows.forEach((row, index) => {
      const receipt = row.receipt_no?.trim()
      if (!receipt) throw new Error(`Row ${index + 2}: receipt_no is required.`)
      byReceipt.set(receipt, [...(byReceipt.get(receipt) ?? []), row])
    })
    const skus = [...new Set(rows.map((row) => row.sku?.trim()).filter(Boolean))]
    const { data: productRows, error: productError } = await supabase
      .from('products')
      .select('id, sku')
      .in('sku', skus)
    if (productError) throw new Error(productError.message)
    const products = new Map((productRows ?? []).map((product) => [product.sku, product.id]))
    let imported = 0
    for (const [receipt, lines] of byReceipt) {
      const first = lines[0]
      const saleDate = first.sale_date
      const paymentMethod = first.payment_method?.toLowerCase()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate ?? '') || saleDate >= new Date().toISOString().slice(0, 10))
        throw new Error(`${receipt}: sale_date must be a past date in YYYY-MM-DD format.`)
      if (!['cash', 'card', 'transfer', 'credit'].includes(paymentMethod))
        throw new Error(`${receipt}: payment_method must be cash, card, transfer, or credit.`)
      const items = lines.map((line, index) => {
        const quantity = Number(line.quantity)
        const price = Number(line.unit_price)
        const productId = products.get(line.sku?.trim())
        if (!productId || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0)
          throw new Error(`${receipt}, row ${index + 2}: SKU, quantity, and unit_price are required.`)
        return { product_id: productId, quantity, unit_price_kobo: Math.round(price * 100) }
      })
      const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price_kobo, 0)
      const credit =
        paymentMethod === 'credit'
          ? {
              customer_name: first.customer_name,
              customer_phone: first.customer_phone,
              due_date: first.due_date || null,
              initial_payment_kobo: Math.round(Number(first.initial_payment || 0) * 100),
            }
          : null
      const deductStock = ['yes', 'true', '1'].includes((first.deduct_stock ?? '').toLowerCase())
      const { error } = await supabase.rpc(
        deductStock ? 'record_historical_sale_with_stock' : 'record_historical_sale',
        {
          p_sale_id: crypto.randomUUID(),
          p_receipt_no: receipt,
          p_total_kobo: total,
          p_payment_method: paymentMethod,
          p_sold_at: `${saleDate}T12:00:00.000Z`,
          p_items: items,
          p_discount_kobo: 0,
          p_credit: credit,
        },
      )
      if (error) throw new Error(`${receipt}: ${error.message}`)
      imported++
    }
    await Promise.all([pullSales(), pullProducts()])
    void imported
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Statistic
            title="Today's sales"
            value={todayTotal}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic title="Today's transactions" value={todaySales.length} />
        </Card>
        <Card>
          <Statistic title="Filtered total" value={total} formatter={(value) => formatNaira(Number(value))} />
        </Card>
        <Card>
          <Statistic title="Pending sync" value={filtered.filter((sale) => !sale.synced).length} />
        </Card>
      </div>
      <Card
        title="Sales filters"
        extra={
          role !== 'cashier' && (
            <Space>
              <Button icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
                Bulk upload
              </Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={() => exportSalesCsv(filtered)}>
                Export CSV
              </Button>
            </Space>
          )
        }
      >
        <Space wrap>
          <DatePicker
            value={date ? undefined : undefined}
            onChange={(_, value) => setDate(value || undefined)}
          />
          <Select
            value={method}
            className="w-44"
            onChange={setMethod}
            options={[
              { value: 'all', label: 'All payments' },
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card / POS' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'credit', label: 'Mobile money' },
            ]}
          />
          <Select
            value={sort}
            className="w-40"
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
            ]}
          />
          <Button
            onClick={() => {
              setMethod('all')
              setDate(undefined)
              setSort('newest')
            }}
          >
            Clear filters
          </Button>
        </Space>
      </Card>
      <RecentSales sales={shown} role={role} onViewReceipt={onViewReceipt} onReturnSale={setReturningSale} />
      {role !== 'cashier' && <ReturnActivityTable activities={returnActivities} />}
      <PartialReturnModal
        sale={returningSale}
        open={Boolean(returningSale)}
        onClose={() => setReturningSale(undefined)}
        onSubmit={(sale, selected) => {
          onReturnSale(sale, selected)
          setReturningSale(undefined)
        }}
      />
      <BulkCsvImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk upload historical sales"
        templateName="kroniqos-sales-sample.csv"
        template={
          'receipt_no,sale_date,sku,quantity,unit_price,payment_method,customer_name,customer_phone,due_date,initial_payment,deduct_stock\nHIS-1001,2026-08-01,SKU-001,2,1500,cash,,,,,no\nHIS-1002,2026-08-02,SKU-002,1,5000,credit,Amina Musa,08030000000,2026-08-30,1000,yes'
        }
        guidance="Use one row per item. Lines with the same receipt_no become one historical sale. unit_price and initial_payment are in Naira. Set deduct_stock to yes only when the past sale should correct current stock."
        onImport={importSales}
      />
    </div>
  )
}
