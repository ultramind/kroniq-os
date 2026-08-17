import type { Sale } from '../../types'

export function exportSalesCsv(sales: Sale[]) {
  const rows = [
    ['Receipt', 'Date', 'Payment method', 'Total (₦)', 'Status'],
    ...sales.map((sale) => [
      sale.receiptNo,
      sale.createdAt,
      sale.paymentMethod,
      sale.total.toFixed(2),
      sale.status ?? 'completed',
    ]),
  ]
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `naira-pos-sales-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
