import { PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'

type PlatformRole = 'owner' | 'operator' | 'support' | 'finance' | 'viewer'
type Member = { user_id: string; email: string; platform_role: PlatformRole; created_at: string }
const descriptions: Record<PlatformRole, string> = {
  owner: 'Full access, including team roles',
  operator: 'Organisations, plans, system operations',
  support: 'Tickets and time-limited support access',
  finance: 'Analytics, billing, and audit visibility',
  viewer: 'Read-only platform visibility',
}

export function PlatformTeamPage({ currentRole }: { currentRole: PlatformRole }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [api, holder] = message.useMessage()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ email: string; password: string; role: PlatformRole }>()
  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const { data, error } = await supabase.rpc('platform_team')
    if (error) api.error(error.message)
    else setMembers((data ?? []) as Member[])
    setLoading(false)
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const updateRole = async (member: Member, role: PlatformRole) => {
    if (!supabase || role === member.platform_role) return
    const { error } = await supabase.rpc('set_platform_admin_role', {
      p_user_id: member.user_id,
      p_platform_role: role,
    })
    if (error) api.error(error.message)
    else {
      api.success('Platform role updated and audited.')
      void load()
    }
  }
  const addMember = async (values: { email: string; password: string; role: PlatformRole }) => {
    if (!supabase) return
    setSaving(true)
    const { data, error } = await supabase.functions.invoke('manage-platform-team', { body: values })
    setSaving(false)
    if (error || data?.error) {
      api.error(data?.error ?? error.message)
      return
    }
    api.success('Platform team member added.')
    form.resetFields()
    setInviteOpen(false)
    void load()
  }
  const columns: TableColumnsType<Member> = [
    { title: 'Platform member', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      key: 'role',
      render: (_, member) =>
        currentRole === 'owner' ? (
          <Select
            value={member.platform_role}
            onChange={(role) => void updateRole(member, role)}
            options={(Object.keys(descriptions) as PlatformRole[]).map((role) => ({
              value: role,
              label: role[0].toUpperCase() + role.slice(1),
            }))}
            className="min-w-32"
          />
        ) : (
          <Tag>{member.platform_role}</Tag>
        ),
    },
    {
      title: 'Permissions',
      dataIndex: 'platform_role',
      key: 'permissions',
      responsive: ['md'],
      render: (role: PlatformRole) => descriptions[role],
    },
    {
      title: 'Added',
      dataIndex: 'created_at',
      key: 'created_at',
      responsive: ['lg'],
      render: (value) => new Date(value).toLocaleDateString('en-NG'),
    },
  ]
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Title level={2} className="!mb-1">
            Platform team & access
          </Typography.Title>
          <Typography.Text type="secondary">
            Small internal RBAC for Kronicle administrators. Only Owners can add members or change roles.
          </Typography.Text>
        </div>
        {currentRole === 'owner' && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.setFieldsValue({ role: 'operator' })
              setInviteOpen(true)
            }}
          >
            Add team member
          </Button>
        )}
      </div>
      {holder}
      <Card
        title={
          <>
            <SafetyCertificateOutlined className="mr-2" />
            Role permissions
          </>
        }
        className="mb-6"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {(Object.entries(descriptions) as [PlatformRole, string][]).map(([role, description]) => (
            <div key={role} className="border p-3">
              <Tag>{role}</Tag>
              <p className="mb-0 mt-2 text-xs text-slate-500">{description}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Table
          rowKey="user_id"
          loading={loading}
          columns={columns}
          dataSource={members}
          pagination={false}
          scroll={{ x: 760 }}
        />
      </Card>
      <Modal
        title="Add platform team member"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => void form.submit()}
        confirmLoading={saving}
        okText="Add member"
      >
        <Form form={form} layout="vertical" onFinish={addMember}>
          <Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="Temporary password"
            rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Platform role" rules={[{ required: true }]}>
            <Select
              options={(Object.keys(descriptions) as PlatformRole[])
                .filter((role) => role !== 'owner')
                .map((role) => ({ value: role, label: role[0].toUpperCase() + role.slice(1) }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
