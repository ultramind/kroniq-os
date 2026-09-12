import { Card, DatePicker, Select, Table } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import type { Product, StockDelivery } from '../../types'
import { formatNaira } from '../../lib/currency'

export function DeliveryHistory({
  deliveries,
  products,
}: {
  deliveries: StockDelivery[]
  products: Product[]
}) {
  const [period, setPeriod] = useState<'all' | 'day' | 'week' | 'month' | 'year' | 'range'>('all')
  const [range, setRange] = useState<[string, string] | undefined>()
  const names = new Map(products.map((product) => [product.id, product.name]))
  const filtered = useMemo(() => {
    const now = dayjs()
    const start =
      period === 'day'
        ? now.startOf('day')
        : period === 'week'
          ? now.startOf('week')
          : period === 'month'
            ? now.startOf('month')
            : period === 'year'
              ? now.startOf('year')
              : period === 'range' && range
                ? dayjs(range[0]).startOf('day')
                : undefined
    const end = period === 'range' && range ? dayjs(range[1]).endOf('day') : now.endOf('day')
    return deliveries.filter(
      (delivery) =>
        !start ||
        (dayjs(delivery.receivedAt ?? delivery.createdAt).isAfter(start.subtract(1, 'millisecond')) &&
          dayjs(delivery.receivedAt ?? delivery.createdAt).isBefore(end.add(1, 'millisecond'))),
    )
  }, [deliveries, period, range])
  const columns = [
    {
      title: 'Received date',
      dataIndex: 'receivedAt',
      key: 'receivedAt',
      render: (value: string | undefined, delivery: StockDelivery) => {
        const date = value ?? delivery.createdAt
        return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-NG', { dateStyle: 'medium' })
      },
    },
    {
      title: 'Product',
      dataIndex: 'productId',
      key: 'productId',
      render: (id: string) => names.get(id) ?? 'Unknown product',
    },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName' },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
    {
      title: 'Unit cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      render: (value: number) => formatNaira(value),
    },
  ]
  return (
    <Card title="Supplier delivery log" extra="Stock received into the store">
      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={period}
          onChange={setPeriod}
          className="min-w-32"
          options={[
            { value: 'all', label: 'All deliveries' },
            { value: 'day', label: 'Today' },
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'This month' },
            { value: 'year', label: 'This year' },
            { value: 'range', label: 'Date range' },
          ]}
        />
        {period === 'range' && (
          <DatePicker.RangePicker
            value={range ? [dayjs(range[0]), dayjs(range[1])] : undefined}
            onChange={(value) =>
              setRange(
                value?.[0] && value[1]
                  ? [value[0].format('YYYY-MM-DD'), value[1].format('YYYY-MM-DD')]
                  : undefined,
              )
            }
          />
        )}
      </div>
      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        pagination={{ pageSize: 10, showSizeChanger: true }}
        locale={{ emptyText: 'No supplier deliveries recorded yet.' }}
      />
    </Card>
  )
}
