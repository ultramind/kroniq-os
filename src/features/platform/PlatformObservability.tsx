import { ReloadOutlined } from '@ant-design/icons'
import { Button, Card, DatePicker, Input, Statistic, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'

type AuditEvent = {
  id: string
  created_at: string
  action: string
  organization_name?: string | null
  actor_email?: string | null
  before_data?: Record<string, string> | null
  after_data?: Record<string, string> | null
}
type Analytics = {
  active_organizations: number
  new_signups: number
  churned_organizations: number
  total_stores: number
  total_staff: number
  sales_volume_kobo: number
  subscription_revenue_kobo: number
  trials_started: number
  trials_converted: number
}
const isoDate = (date: Date) => date.toISOString().slice(0, 10)
const actionName = (action: string) =>
  action.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function PlatformAuditLogPage() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(isoDate(new Date()))
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [api, holder] = message.useMessage()
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error } = await supabase.rpc('platform_audit_log', {
      p_search: search || null,
      p_from: from || null,
      p_to: to || null,
    })
    if (error) api.error(error.message)
    else setEvents((data ?? []) as AuditEvent[])
    setLoading(false)
  }, [api, from, search, to])
  useEffect(() => {
    void load()
  }, [])
  const columns: TableColumnsType<AuditEvent> = [
    {
      title: 'When',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value) => new Date(value).toLocaleString('en-NG'),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      render: (value) => <Tag>{actionName(value)}</Tag>,
    },
    {
      title: 'Organisation',
      dataIndex: 'organization_name',
      key: 'organization_name',
      render: (value) => value ?? '—',
    },
    {
      title: 'Actor',
      dataIndex: 'actor_email',
      key: 'actor_email',
      responsive: ['md'],
      render: (value) => value ?? 'System',
    },
    {
      title: 'Change',
      key: 'change',
      responsive: ['lg'],
      render: (_, event) =>
        `${event.before_data?.status ?? event.before_data?.plan_code ?? '—'} → ${event.after_data?.status ?? event.after_data?.plan_code ?? '—'}`,
    },
  ]
  return (
    <>
      <div className="mb-8">
        <Typography.Title level={2} className="!mb-1">
          Platform audit log
        </Typography.Title>
        <Typography.Text type="secondary">Track platform actions across every organisation.</Typography.Text>
      </div>
      {holder}
      <Card>
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_280px_auto]">
          <Input
            placeholder="Search organisation, admin email, or action"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={() => void load()}
          />
          <DatePicker.RangePicker
            value={[dayjs(from), dayjs(to)]}
            format="DD MMM YYYY"
            onChange={(_, values) => {
              setFrom(values[0] || '')
              setTo(values[1] || '')
            }}
          />
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()}>
            Apply
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={events}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 880 }}
        />
      </Card>
    </>
  )
}

export function PlatformAnalyticsPage() {
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(isoDate(new Date()))
  const [data, setData] = useState<Analytics>()
  const [loading, setLoading] = useState(true)
  const [api, holder] = message.useMessage()
  const load = useCallback(async () => {
    if (!supabase || !from || !to) return
    setLoading(true)
    const { data: response, error } = await supabase.rpc('platform_analytics', { p_from: from, p_to: to })
    if (error) api.error(error.message)
    else setData(response?.[0] as Analytics | undefined)
    setLoading(false)
  }, [api, from, to])
  useEffect(() => {
    void load()
  }, [])
  const conversion = data?.trials_started
    ? Math.round((data.trials_converted / data.trials_started) * 100)
    : 0
  const metricCards = [
    ['Active organisations', data?.active_organizations ?? 0],
    ['New sign-ups', data?.new_signups ?? 0],
    ['Churned organisations', data?.churned_organizations ?? 0],
    ['Total active stores', data?.total_stores ?? 0],
    ['Total staff', data?.total_staff ?? 0],
    ['Trial-to-paid conversion', `${conversion}%`],
    ['Sales volume', formatNaira((data?.sales_volume_kobo ?? 0) / 100)],
    ['Subscription revenue', formatNaira((data?.subscription_revenue_kobo ?? 0) / 100)],
  ]
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1">
            Platform analytics
          </Typography.Title>
          <Typography.Text type="secondary">
            Aggregate operational and subscription performance across your platform.
          </Typography.Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <DatePicker.RangePicker
            value={[dayjs(from), dayjs(to)]}
            format="DD MMM YYYY"
            onChange={(_, values) => {
              setFrom(values[0] || '')
              setTo(values[1] || '')
            }}
          />
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()}>
            Apply
          </Button>
        </div>
      </div>
      {holder}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(([title, value]) => (
          <Card key={title}>
            <Statistic
              title={title}
              value={value}
              loading={loading}
              valueStyle={title === 'Subscription revenue' ? { color: '#15803d' } : undefined}
            />
          </Card>
        ))}
      </div>
      <Card className="mt-6" title="Conversion definition">
        <Typography.Text type="secondary">
          Trial-to-paid conversion measures organisations that started a trial during the selected period and
          have completed their first successful subscription payment.
        </Typography.Text>
      </Card>
    </>
  )
}
