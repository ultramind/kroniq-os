import { EditOutlined, GlobalOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Modal, Select, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'

type DomainStatus = 'requested' | 'dns_required' | 'verifying' | 'active' | 'failed' | 'removed'
type Domain = {
  id: string
  store_id: string
  store_name: string
  domain: string
  status: DomainStatus
  dns_record_type?: string | null
  dns_record_name?: string | null
  dns_record_value?: string | null
  provider_reference?: string | null
  failure_message?: string | null
  requested_at: string
  verified_at?: string | null
}
type Values = {
  status: DomainStatus
  dnsRecordType?: string
  dnsRecordName?: string
  dnsRecordValue?: string
  providerReference?: string
  failureMessage?: string
}

const statusLabel: Record<DomainStatus, string> = {
  requested: 'Requested',
  dns_required: 'DNS required',
  verifying: 'Verifying',
  active: 'Active',
  failed: 'Failed',
  removed: 'Removed',
}
const statusColor: Record<DomainStatus, string> = {
  requested: 'gold',
  dns_required: 'gold',
  verifying: 'blue',
  active: 'green',
  failed: 'red',
  removed: 'default',
}

export function PlatformCustomDomains({ organizationId }: { organizationId: string }) {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Domain>()
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<Values>()
  const [api, holder] = message.useMessage()

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error } = await supabase.rpc('platform_storefront_custom_domains', {
      p_organization_id: organizationId,
    })
    if (error) api.error(error.message)
    else setDomains((data ?? []) as Domain[])
    setLoading(false)
  }, [api, organizationId])

  useEffect(() => {
    void load()
  }, [load])

  function openEditor(domain: Domain) {
    setEditing(domain)
    form.setFieldsValue({
      status: domain.status,
      dnsRecordType: domain.dns_record_type ?? '',
      dnsRecordName: domain.dns_record_name ?? '',
      dnsRecordValue: domain.dns_record_value ?? '',
      providerReference: domain.provider_reference ?? '',
      failureMessage: domain.failure_message ?? '',
    })
  }

  async function save(values: Values) {
    if (!supabase || !editing) return
    setSaving(true)
    const { error } = await supabase.rpc('update_platform_storefront_custom_domain', {
      p_domain_id: editing.id,
      p_status: values.status,
      p_dns_record_type: values.dnsRecordType || null,
      p_dns_record_name: values.dnsRecordName || null,
      p_dns_record_value: values.dnsRecordValue || null,
      p_provider_reference: values.providerReference || null,
      p_failure_message: values.failureMessage || null,
    })
    setSaving(false)
    if (error) {
      api.error(error.message)
      return
    }
    api.success('Custom domain updated and audited.')
    setEditing(undefined)
    void load()
  }

  return (
    <Card
      title={
        <span>
          <GlobalOutlined className="mr-2" />
          Custom domain
        </span>
      }
      extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void load()} />}
    >
      {holder}
      <Alert
        className="mb-4"
        type="warning"
        showIcon
        message="Platform-managed domain setup"
        description="Attach the tenant domain in Vercel, copy Vercel’s DNS instruction here, then update the status as DNS verification progresses."
      />
      <Table<Domain>
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{ emptyText: 'This organisation has not requested a custom domain.' }}
        columns={[
          {
            title: 'Actions',
            key: 'actions',
            width: 92,
            render: (_, domain) => <Button icon={<EditOutlined />} onClick={() => openEditor(domain)} />,
          },
          {
            title: 'Domain',
            dataIndex: 'domain',
            render: (domain, record) => (
              <div>
                <strong>{domain}</strong>
                <div className="text-xs text-slate-500">{record.store_name}</div>
              </div>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (status: DomainStatus) => <Tag color={statusColor[status]}>{statusLabel[status]}</Tag>,
          },
          {
            title: 'Requested',
            dataIndex: 'requested_at',
            responsive: ['md'],
            render: (value: string) => new Date(value).toLocaleString('en-NG'),
          },
        ]}
        dataSource={domains}
      />
      <Modal
        title={editing ? `Configure ${editing.domain}` : 'Configure custom domain'}
        open={Boolean(editing)}
        onCancel={() => setEditing(undefined)}
        onOk={() => void form.submit()}
        confirmLoading={saving}
        okText="Save domain status"
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="dnsRecordType" label="DNS record type">
            <Input placeholder="CNAME or A" />
          </Form.Item>
          <Form.Item name="dnsRecordName" label="DNS record name">
            <Input placeholder="@, www, or a value supplied by Vercel" />
          </Form.Item>
          <Form.Item name="dnsRecordValue" label="DNS record value">
            <Input placeholder="Copy the exact value from Vercel" />
          </Form.Item>
          <Form.Item name="providerReference" label="Vercel reference">
            <Input placeholder="Optional Vercel domain ID or note" />
          </Form.Item>
          <Form.Item name="failureMessage" label="Tenant-facing note">
            <Input.TextArea rows={2} placeholder="Explain any DNS issue or next action." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
