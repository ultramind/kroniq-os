import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { staffApi } from '../features/staff/staff.api'
import type { Role, StaffMember } from '../types'

const { Text } = Typography
type FormValues = { fullName: string; email: string; password: string; role: Role }
export function StaffPage({ role }: { role: Role }) {
  const [api, contextHolder] = message.useMessage()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const load = async () => {
    setLoading(true)
    try {
      setStaff(await staffApi.list())
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not load staff.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (role === 'admin') void load()
  }, [role])
  async function createStaff(values: FormValues) {
    setSaving(true)
    try {
      await staffApi.create(values)
      api.success('Staff account created.')
      setOpen(false)
      form.resetFields()
      await load()
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not create staff.')
    } finally {
      setSaving(false)
    }
  }
  async function deactivateStaff(member: StaffMember) {
    try {
      await staffApi.deactivate(member.id)
      api.success(`${member.fullName} has been deactivated.`)
      await load()
    } catch (error) {
      api.error(error instanceof Error ? error.message : 'Could not deactivate staff.')
    }
  }
  if (role !== 'admin')
    return (
      <Card>
        <Text type="danger">Only administrators can manage staff accounts.</Text>
      </Card>
    )
  const columns = [
    { title: 'Name', dataIndex: 'fullName', key: 'fullName' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (value: Role) => (
        <Tag color="blue" className="capitalize">
          {value}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean) => (
        <Tag color={active ? 'success' : 'default'}>{active ? 'Active' : 'Deactivated'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, member: StaffMember) =>
        member.active && (
          <Popconfirm
            title="Deactivate this staff account?"
            description="They will no longer be able to sign in."
            okText="Deactivate"
            okButtonProps={{ danger: true }}
            onConfirm={() => void deactivateStaff(member)}
          >
            <Button type="link" danger>
              Deactivate
            </Button>
          </Popconfirm>
        ),
    },
  ]
  return (
    <>
      <Card
        title="Staff management"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Add staff
          </Button>
        }
      >
        <Text type="secondary">
          Create staff accounts and assign exactly one role. Only admins can access this area.
        </Text>
        <Table
          className="mt-5"
          columns={columns}
          dataSource={staff}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Modal
        title="Add staff member"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void form.submit()}
        confirmLoading={saving}
        okText="Create staff account"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={createStaff} initialValues={{ role: 'cashier' }}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Temporary password"
            rules={[{ required: true, min: 8, message: 'Use at least 8 characters.' }]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              size="large"
              options={[
                { value: 'cashier', label: 'Cashier' },
                { value: 'manager', label: 'Manager' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
