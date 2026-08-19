import { DownloadOutlined, PrinterOutlined, UploadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, DatePicker, Select, Space, Statistic } from 'antd'
import dayjs from 'dayjs'
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
  onRetryStockConflict: (saleId: string) => Promise<void>
}

type Period = 'day' | 'week' | 'month' | 'year'

function rangeFor(period: Period, anchor: string) {
  const date = dayjs(anchor)
  if (period === 'week') {
    const start = date.startOf('week').add(1, 'day')
    return { start, end: start.add(6, 'day') }
  }
  if (period === 'month') return { start: date.startOf('month'), end: date.endOf('month') }
  if (period === 'year') return { start: date.startOf('year'), end: date.endOf('year') }
  return { start: date.startOf('day'), end: date.endOf('day') }
}

export function SalesPage({
  recentSales,
  allSales,
  returnActivities,
  role,
  onViewReceipt,
  onReturnSale,
  onRetryStockConflict,
}: Props) {
  const [method, setMethod] = useState<string>('all')
  const [date, setDate] = useState<string>(() => dayjs().format('YYYY-MM-DD'))
  const [period, setPeriod] = useState<Period>('day')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [returningSale, setReturningSale] = useState<Sale>()
  const [bulkOpen, setBulkOpen] = useState(false)
  const { start, end } = useMemo(() => rangeFor(period, date), [date, period])
  const filtered = useMemo(
    () =>
      allSales.filter(
        (sale) =>
          (method === 'all' || sale.paymentMethod === method) &&
          sale.createdAt.slice(0, 10) >= start.format('YYYY-MM-DD') &&
          sale.createdAt.slice(0, 10) <= end.format('YYYY-MM-DD'),
      ),
    [allSales, method, start, end],
  )
  const shown = filtered
    .slice()
    .sort((a, b) =>
      sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
    )
    .slice(0, 20)
  const reportSales = filtered.filter((sale) => sale.status !== 'returned')
  const stockConflicts = allSales.filter((sale) => sale.syncStatus === 'stock_conflict')
  const total = reportSales.reduce((sum, sale) => sum + sale.total, 0)
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
          <Statistic title="Sales total" value={total} formatter={(value) => formatNaira(Number(value))} />
        </Card>
        <Card>
          <Statistic title="Transactions" value={reportSales.length} />
        </Card>
        <Card>
          <Statistic
            title="Average sale"
            value={reportSales.length ? total / reportSales.length : 0}
            formatter={(value) => formatNaira(Number(value))}
          />
        </Card>
        <Card>
          <Statistic title="Pending sync" value={reportSales.filter((sale) => !sale.synced).length} />
        </Card>
      </div>
      {stockConflicts.length > 0 && (
        <Card title="Stock conflicts requiring review">
          <Alert
            type="warning"
            showIcon
            message="These sales were completed offline after stock changed on another device. They are safely stored, but cannot sync until stock is corrected."
          />
          <div className="mt-4 space-y-3">
            {stockConflicts.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="mb-0 font-medium">{sale.receiptNo}</p>
                  <p className="mb-0 text-xs text-slate-500">{sale.syncError}</p>
                </div>
                {role !== 'cashier' && (
                  <Button type="primary" onClick={() => void onRetryStockConflict(sale.id)}>
                    Retry after stock update
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card
        title="Sales filters"
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
              Print
            </Button>
            {role !== 'cashier' && (
              <>
                <Button icon={<UploadOutlined />} onClick={() => setBulkOpen(true)}>
                  Bulk upload
                </Button>
                <Button type="primary" icon={<DownloadOutlined />} onClick={() => exportSalesCsv(filtered)}>
                  Export CSV
                </Button>
              </>
            )}
          </Space>
        }
      >
        <Space wrap>
          <Select
            value={period}
            size="large"
            className="w-32"
            onChange={setPeriod}
            options={[
              { value: 'day', label: 'Today' },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' },
            ]}
          />
          <DatePicker
            size="large"
            value={date ? dayjs(date) : null}
            onChange={(_, value) => setDate(value || dayjs().format('YYYY-MM-DD'))}
          />
          <Select
            value={method}
            size="large"
            className="w-44"
            onChange={setMethod}
            options={[
              { value: 'all', label: 'All payments' },
              { value: 'cash', label: 'Cash' },
              { value: 'card', label: 'Card / POS' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'credit', label: 'Credit' },
              { value: 'order', label: 'Order' },
            ]}
          />
          <Select
            value={sort}
            size="large"
            className="w-40"
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
            ]}
          />
          <Button
            size="large"
            onClick={() => {
              setMethod('all')
              setDate(dayjs().format('YYYY-MM-DD'))
              setPeriod('day')
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
      <section id="sales-report" className="hidden">
        <h1>Sales report</h1>
        <p>
          {period === 'day'
            ? `Date: ${dayjs(date).format('DD MMM YYYY')}`
            : `${start.format('DD MMM YYYY')} – ${end.format('DD MMM YYYY')}`}{' '}
          · {method === 'all' ? 'All payment methods' : method.replace('_', ' ')}
        </p>
        <p>
          Transactions: {reportSales.length} · Sales total: {formatNaira(total)}
        </p>
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {reportSales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.receiptNo}</td>
                <td>{new Date(sale.createdAt).toLocaleString('en-NG')}</td>
                <td>{sale.paymentMethod.replace('_', ' ')}</td>
                <td>{sale.synced ? 'Synced' : 'Queued'}</td>
                <td>{formatNaira(sale.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
