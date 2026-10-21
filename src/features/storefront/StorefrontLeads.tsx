import { CheckOutlined, PhoneOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Input, Select, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'

type Lead = {
  id: string
  name: string
  phone: string
  email?: string | null
  message?: string | null
  status: 'new' | 'contacted' | 'closed'
  created_at: string
  products?: { name?: string | null } | null
}

const statusMeta: Record<Lead['status'], { color: string; label: string }> = {
  new: { color: 'gold', label: 'New' },
  contacted: { color: 'blue', label: 'Contacted' },
  closed: { color: 'green', label: 'Closed' },
}

export function StorefrontLeads() {
  const [api, holder] = message.useMessage()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string>()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | Lead['status']>('all')
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
        : { data: null }
      if (!profile) return
      const { data, error } = await supabase
        .from('storefront_leads')
        .select('id,name,phone,email,message,status,created_at,products(name)')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setLeads((data ?? []) as Lead[])
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not load customer enquiries.')
    } finally {
      setLoading(false)
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])

  const updateStatus = async (lead: Lead, nextStatus: Lead['status']) => {
    if (!supabase || nextStatus === lead.status) return
    setUpdatingId(lead.id)
    try {
      const { error } = await supabase.from('storefront_leads').update({ status: nextStatus }).eq('id', lead.id)
      if (error) throw error
      setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status: nextStatus } : item)))
      api.success('Lead status updated.')
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not update lead status.')
    } finally {
      setUpdatingId(undefined)
    }
  }

  const visibleLeads = useMemo(
    () =>
      leads.filter((lead) => {
        const searchMatch = `${lead.name} ${lead.phone} ${lead.email ?? ''} ${lead.products?.name ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase())
        return searchMatch && (status === 'all' || lead.status === status)
      }),
    [leads, query, status],
  )

  const columns: TableColumnsType<Lead> = [
    {
      title: 'Customer',
      key: 'customer',
      render: (_, lead) => (
        <div>
          <div className="font-medium text-[#0B1121]">{lead.name}</div>
          <a className="text-sm text-slate-500" href={`tel:${lead.phone}`}>{lead.phone}</a>
          {lead.email && <div className="text-xs text-slate-500">{lead.email}</div>}
        </div>
      ),
    },
    {
      title: 'Enquiry',
      key: 'enquiry',
      render: (_, lead) => (
        <div className="max-w-xs">
          {lead.products?.name && <Tag className="!m-0">{lead.products.name}</Tag>}
          {lead.message && <p className="mb-0 mt-2 whitespace-pre-line text-sm text-slate-600">{lead.message}</p>}
        </div>
      ),
    },
    {
      title: 'Received',
      dataIndex: 'created_at',
      render: (value) => <span className="whitespace-nowrap text-sm text-slate-600">{dayjs(value).format('DD MMM YYYY, h:mm A')}</span>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, lead) => <Tag color={statusMeta[lead.status].color}>{statusMeta[lead.status].label}</Tag>,
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, lead) => (
        <div className="flex items-center gap-2">
          <Button size="small" icon={<PhoneOutlined />} href={`tel:${lead.phone}`}>Call</Button>
          <Select
            size="small"
            value={lead.status}
            loading={updatingId === lead.id}
            onChange={(nextStatus) => void updateStatus(lead, nextStatus)}
            options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
        </div>
      ),
    },
  ]

  return (
    <Card title="Customer enquiries" extra={<Button icon={<CheckOutlined />} onClick={() => void load()} loading={loading}>Refresh</Button>}>
      {holder}
      <p className="mb-5 text-sm text-slate-500">Leads submitted from your public storefront contact and product enquiry forms.</p>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} prefix={<SearchOutlined />} placeholder="Search name, phone, email, or product" allowClear />
        <Select className="sm:w-40" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))]} />
      </div>
      <div className="overflow-x-auto">
        <Table rowKey="id" columns={columns} dataSource={visibleLeads} loading={loading} pagination={{ pageSize: 10, showSizeChanger: false }} />
      </div>
    </Card>
  )
}
