import { Card, Table, Tag } from 'antd'
import { formatNaira } from '../../lib/currency'
import type { ReturnActivity } from '../../types'

export function ReturnActivityTable({ activities }: { activities: ReturnActivity[] }) {
  return (
    <Card title="Return activity" className="shadow-sm">
      <Table
        rowKey="id"
        size="small"
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        dataSource={activities}
        locale={{ emptyText: 'No returns have been recorded on this device.' }}
        columns={[
          {
            title: 'Time',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (value: string) =>
              new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
          },
          { title: 'Receipt', dataIndex: 'receiptNo', key: 'receiptNo' },
          {
            title: 'Returned by',
            dataIndex: 'staffName',
            key: 'staffName',
            render: (value?: string) => value || 'Unknown staff',
          },
          {
            title: 'Items returned',
            dataIndex: 'items',
            key: 'items',
            render: (items: ReturnActivity['items']) =>
              items.map((item) => `${item.productName} ×${item.quantity}`).join(', '),
          },
          { title: 'Value', dataIndex: 'total', key: 'total', render: (value: number) => formatNaira(value) },
          {
            title: 'Sync',
            dataIndex: 'synced',
            key: 'synced',
            render: (synced: boolean) => (
              <Tag color={synced ? 'success' : 'gold'}>{synced ? 'Synced' : 'Queued'}</Tag>
            ),
          },
        ]}
      />
    </Card>
  )
}
