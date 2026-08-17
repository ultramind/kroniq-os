import { Table, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

type AuditEvent = {
  id: string
  entity_type: string
  action: 'created' | 'updated' | 'deleted'
  created_at: string
  actor?: { full_name?: string } | null
}

const entityLabel: Record<string, string> = {
  products: 'Product',
  sales: 'Sale',
  stock_movements: 'Stock movement',
  supplier_deliveries: 'Supplier delivery',
  expenses: 'Expense',
  credit_payments: 'Credit payment',
  cash_shifts: 'Cash shift',
}

export function AuditTrail() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setError('Audit records are available when Supabase is connected.')
      return
    }
    void supabase
      .from('audit_events')
      .select('id, entity_type, action, created_at, actor:profiles!audit_events_actor_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message)
        else setEvents((data ?? []) as AuditEvent[])
        setLoading(false)
      })
  }, [])

  return (
    <div className="mt-8">
      <div className="mb-4">
        <Typography.Title level={4} className="!mb-1">
          Audit log
        </Typography.Title>
        <Typography.Text type="secondary">
          The latest 100 server-recorded operational changes.
        </Typography.Text>
      </div>
      {error ? (
        <Typography.Text type="secondary">{error}</Typography.Text>
      ) : (
        <Table
          loading={loading}
          dataSource={events}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: 'Time',
              dataIndex: 'created_at',
              render: (value: string) => new Date(value).toLocaleString('en-NG'),
            },
            {
              title: 'Staff',
              dataIndex: 'actor',
              render: (actor?: AuditEvent['actor']) => actor?.full_name || 'System',
            },
            {
              title: 'Area',
              dataIndex: 'entity_type',
              render: (value: string) => entityLabel[value] ?? value,
            },
            {
              title: 'Action',
              dataIndex: 'action',
              render: (value: AuditEvent['action']) => (
                <Tag color={value === 'deleted' ? 'error' : value === 'updated' ? 'gold' : 'success'}>
                  {value}
                </Tag>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
