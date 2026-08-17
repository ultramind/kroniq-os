import {
  CustomerServiceOutlined,
  GlobalOutlined,
  NotificationOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

type Organization = { id: string; name: string; business_modes?: string[] }
type Ticket = {
  id: string
  organization_id: string
  subject: string
  description: string
  priority: string
  status: string
  created_at: string
}
type SupportSession = {
  id: string
  organization_id: string
  reason: string
  started_at: string
  expires_at: string
  ended_at?: string | null
}
type Notice = {
  id: string
  title: string
  message: string
  severity: string
  status: string
  starts_at: string
  ends_at?: string | null
}
type Operation = {
  operation_key: string
  display_name: string
  status: string
  details?: string | null
  updated_at: string
}

const statusColors: Record<string, string> = {
  open: 'blue',
  in_progress: 'gold',
  resolved: 'green',
  closed: 'default',
  urgent: 'red',
  high: 'orange',
  active: 'green',
  draft: 'default',
  resolved_notice: 'blue',
  healthy: 'green',
  degraded: 'orange',
  configured: 'blue',
  not_configured: 'default',
}
const display = (value: string) =>
  value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function PlatformSupportPage({ organizations }: { organizations: Organization[] }) {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [sessions, setSessions] = useState<SupportSession[]>([])
  const [loading, setLoading] = useState(true)
  const [accessFor, setAccessFor] = useState<Organization>()
  const [form] = Form.useForm<{ reason: string; minutes: number }>()
  const [api, holder] = message.useMessage()
  const organizationNames = useMemo(
    () => new Map(organizations.map((organization) => [organization.id, organization.name])),
    [organizations],
  )
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [ticketResult, sessionResult] = await Promise.all([
      supabase
        .from('support_tickets')
        .select('id,organization_id,subject,description,priority,status,created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('platform_support_sessions')
        .select('id,organization_id,reason,started_at,expires_at,ended_at')
        .order('started_at', { ascending: false }),
    ])
    if (ticketResult.error || sessionResult.error)
      api.error(ticketResult.error?.message ?? sessionResult.error?.message ?? 'Could not load support data.')
    setTickets((ticketResult.data ?? []) as Ticket[])
    setSessions((sessionResult.data ?? []) as SupportSession[])
    setLoading(false)
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const changeTicketStatus = async (ticket: Ticket, status: string) => {
    if (!supabase) return
    const { error } = await supabase
      .from('support_tickets')
      .update({
        status,
        resolved_at: status === 'resolved' || status === 'closed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket.id)
    if (error) api.error(error.message)
    else {
      api.success('Ticket updated.')
      void load()
    }
  }
  const startSession = async ({ reason, minutes }: { reason: string; minutes: number }) => {
    if (!supabase || !accessFor) return
    const { error } = await supabase.rpc('begin_platform_support_session', {
      p_organization_id: accessFor.id,
      p_reason: reason,
      p_minutes: minutes,
    })
    if (error) {
      api.error(error.message)
      return
    }
    api.success(`Read-only support access started for ${minutes} minutes.`)
    navigate(`/platform/organisations/${accessFor.id}?support=true`)
    setAccessFor(undefined)
    form.resetFields()
    void load()
  }
  const endSession = async (sessionId: string) => {
    if (!supabase) return
    const { error } = await supabase.rpc('end_platform_support_session', {
      p_session_id: sessionId,
      p_reason: 'Ended by platform admin',
    })
    if (error) api.error(error.message)
    else {
      api.success('Support access ended and recorded.')
      void load()
    }
  }
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1">
            Support & safety
          </Typography.Title>
          <Typography.Text type="secondary">Tickets and temporary, audited support access.</Typography.Text>
        </div>
        <Button onClick={() => void load()} loading={loading}>
          Refresh
        </Button>
      </div>
      {holder}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
        <Card
          title={
            <Space>
              <CustomerServiceOutlined />
              Support tickets
            </Space>
          }
        >
          <List
            loading={loading}
            dataSource={tickets}
            locale={{
              emptyText: <Empty description="No support tickets." image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            }}
            renderItem={(ticket) => (
              <List.Item
                actions={[
                  <Select
                    key="status"
                    size="small"
                    value={ticket.status}
                    onChange={(status) => void changeTicketStatus(ticket, status)}
                    options={['open', 'in_progress', 'resolved', 'closed'].map((status) => ({
                      value: status,
                      label: display(status),
                    }))}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {ticket.subject} <Tag color={statusColors[ticket.priority]}>{ticket.priority}</Tag>
                      <Tag color={statusColors[ticket.status]}>{display(ticket.status)}</Tag>
                    </span>
                  }
                  description={
                    <>
                      <span className="block">
                        {organizationNames.get(ticket.organization_id) ?? 'Organisation'} ·{' '}
                        {new Date(ticket.created_at).toLocaleString('en-NG')}
                      </span>
                      <span className="mt-1 block">{ticket.description}</span>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
        <Card
          title={
            <Space>
              <SafetyCertificateOutlined />
              Support access
            </Space>
          }
          extra={
            <Button
              type="primary"
              onClick={() => setAccessFor(organizations[0])}
              disabled={!organizations.length}
            >
              Start access
            </Button>
          }
        >
          <Typography.Paragraph type="secondary">
            Access is read-only, expires automatically within 60 minutes, and is written to the platform audit
            log.
          </Typography.Paragraph>
          <List
            size="small"
            loading={loading}
            dataSource={sessions.filter(
              (session) => !session.ended_at && new Date(session.expires_at) > new Date(),
            )}
            locale={{ emptyText: 'No active support sessions.' }}
            renderItem={(session) => (
              <List.Item
                actions={[
                  <Button key="end" danger type="link" onClick={() => void endSession(session.id)}>
                    End
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={organizationNames.get(session.organization_id) ?? 'Organisation'}
                  description={`${session.reason} · Expires ${new Date(session.expires_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`}
                />
              </List.Item>
            )}
          />
        </Card>
      </div>
      <Modal
        title={`Start support access${accessFor ? ` · ${accessFor.name}` : ''}`}
        open={Boolean(accessFor)}
        okText="Start audited access"
        onOk={() => void form.submit()}
        onCancel={() => setAccessFor(undefined)}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ minutes: 30 }}
          onFinish={(values) => void startSession(values)}
        >
          <Form.Item label="Organisation" required>
            <Select
              value={accessFor?.id}
              onChange={(id) => setAccessFor(organizations.find((organization) => organization.id === id))}
              options={organizations.map((organization) => ({
                value: organization.id,
                label: organization.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="Support reason" rules={[{ required: true, min: 5 }]}>
            <Input.TextArea rows={3} placeholder="Describe the support case." />
          </Form.Item>
          <Form.Item name="minutes" label="Access duration" rules={[{ required: true }]}>
            <Select
              options={[5, 15, 30, 45, 60].map((minutes) => ({
                value: minutes,
                label: `${minutes} minutes`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export function PlatformStatusPage() {
  const [notices, setNotices] = useState<Notice[]>([])
  const [form] = Form.useForm<Pick<Notice, 'title' | 'message' | 'severity'>>()
  const [open, setOpen] = useState(false)
  const [api, holder] = message.useMessage()
  const load = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('maintenance_notices')
      .select('id,title,message,severity,status,starts_at,ends_at')
      .order('starts_at', { ascending: false })
    if (error) api.error(error.message)
    else setNotices((data ?? []) as Notice[])
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const create = async (values: Pick<Notice, 'title' | 'message' | 'severity'>) => {
    if (!supabase) return
    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('maintenance_notices')
      .insert({ ...values, status: 'active', created_by: user.user?.id })
    if (error) api.error(error.message)
    else {
      api.success('Maintenance notice published.')
      setOpen(false)
      form.resetFields()
      void load()
    }
  }
  const resolve = async (notice: Notice) => {
    if (!supabase) return
    const { error } = await supabase
      .from('maintenance_notices')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', notice.id)
    if (error) api.error(error.message)
    else {
      api.success('Notice resolved.')
      void load()
    }
  }
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1">
            System status
          </Typography.Title>
          <Typography.Text type="secondary">
            Publish maintenance and service notices to all signed-in organisations.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<NotificationOutlined />} onClick={() => setOpen(true)}>
          Publish notice
        </Button>
      </div>
      {holder}
      <Card>
        <List
          dataSource={notices}
          locale={{ emptyText: 'No maintenance notices.' }}
          renderItem={(notice) => (
            <List.Item
              actions={
                notice.status === 'active'
                  ? [
                      <Button key="resolve" type="link" onClick={() => void resolve(notice)}>
                        Resolve
                      </Button>,
                    ]
                  : []
              }
            >
              <List.Item.Meta
                title={
                  <>
                    {notice.title} <Tag color={statusColors[notice.severity]}>{notice.severity}</Tag>
                    <Tag color={statusColors[notice.status]}>{notice.status}</Tag>
                  </>
                }
                description={`${notice.message} · Starts ${new Date(notice.starts_at).toLocaleString('en-NG')}`}
              />
            </List.Item>
          )}
        />
      </Card>
      <Modal
        title="Publish maintenance notice"
        open={open}
        okText="Publish"
        onOk={() => void form.submit()}
        onCancel={() => setOpen(false)}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ severity: 'info' }}
          onFinish={(values) => void create(values)}
        >
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="message" label="Message" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="severity" label="Severity">
            <Select
              options={['info', 'warning', 'critical'].map((value) => ({ value, label: display(value) }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export function PlatformOperationsPage() {
  const [operations, setOperations] = useState<Operation[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [api, holder] = message.useMessage()
  const load = useCallback(async () => {
    if (!supabase) return
    const [operationResult, organizationResult] = await Promise.all([
      supabase
        .from('platform_operations')
        .select('operation_key,display_name,status,details,updated_at')
        .order('display_name'),
      supabase.from('organizations').select('id,name,business_modes').order('name'),
    ])
    if (operationResult.error || organizationResult.error)
      api.error(
        operationResult.error?.message ??
          organizationResult.error?.message ??
          'Could not load platform operations.',
      )
    else {
      setOperations((operationResult.data ?? []) as Operation[])
      setOrganizations((organizationResult.data ?? []) as Organization[])
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const update = async (operation: Operation, status: string) => {
    if (!supabase) return
    const { error } = await supabase.rpc('update_platform_operation', {
      p_operation_key: operation.operation_key,
      p_status: status,
      p_details: operation.details ?? null,
    })
    if (error) api.error(error.message)
    else {
      api.success(`${operation.display_name} updated.`)
      void load()
    }
  }
  const updateModes = async (organizationId: string, modes: string[]) => {
    if (!supabase) return
    const { error } = await supabase.rpc('set_platform_organization_business_modes', {
      p_organization_id: organizationId,
      p_business_modes: modes,
    })
    if (error) api.error(error.message)
    else {
      api.success('Operating model updated and audited.')
      void load()
    }
  }
  return (
    <>
      <div className="mb-8">
        <Typography.Title level={2} className="!mb-1">
          SaaS operations
        </Typography.Title>
        <Typography.Text type="secondary">
          Track operational readiness and configure each company’s operating model.
        </Typography.Text>
      </div>
      {holder}
      <Card className="mb-6" title="Organisation operating models">
        <List
          dataSource={organizations}
          locale={{ emptyText: 'No organisations found.' }}
          renderItem={(organization) => (
            <List.Item>
              <List.Item.Meta
                title={organization.name}
                description="Controls which tenant modules appear after the company refreshes."
              />
              <Select
                mode="multiple"
                className="min-w-56"
                value={organization.business_modes ?? ['retail']}
                onChange={(modes) => void updateModes(organization.id, modes)}
                options={[
                  { value: 'retail', label: 'Retail / POS' },
                  { value: 'services', label: 'Services' },
                ]}
              />
            </List.Item>
          )}
        />
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {operations.map((operation) => (
          <Card
            key={operation.operation_key}
            title={
              <Space>
                <GlobalOutlined />
                {operation.display_name}
              </Space>
            }
            extra={<Tag color={statusColors[operation.status]}>{display(operation.status)}</Tag>}
          >
            <Typography.Paragraph type="secondary" className="min-h-10">
              {operation.details || 'No implementation notes recorded yet.'}
            </Typography.Paragraph>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Last updated">
                {new Date(operation.updated_at).toLocaleString('en-NG')}
              </Descriptions.Item>
            </Descriptions>
            <Select
              className="mt-3 w-full"
              value={operation.status}
              onChange={(status) => void update(operation, status)}
              options={['not_configured', 'configured', 'healthy', 'degraded'].map((status) => ({
                value: status,
                label: display(status),
              }))}
            />
          </Card>
        ))}
      </div>
    </>
  )
}
