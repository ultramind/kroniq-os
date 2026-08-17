import { PlusOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, InputNumber, List, Modal, Switch, Table, Tag, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'
import { CurrencyInput } from '../../components/CurrencyInput'

type Service = {
  id: string
  name: string
  description?: string
  default_price_kobo: number
  estimated_duration_minutes?: number
  active: boolean
}
type Stage = { id: string; name: string; position: number; is_terminal: boolean }
export function ServiceSetup() {
  const [api, holder] = message.useMessage()
  const [storeId, setStoreId] = useState<string>()
  const [services, setServices] = useState<Service[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [serviceOpen, setServiceOpen] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serviceForm] = Form.useForm()
  const [stageForm] = Form.useForm()
  const load = useCallback(async () => {
    if (!supabase) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data: profile } = user
      ? await supabase.from('profiles').select('store_id').eq('id', user.id).maybeSingle()
      : { data: null }
    if (!profile) return
    setStoreId(profile.store_id)
    const [a, b] = await Promise.all([
      supabase
        .from('service_catalogue')
        .select('id,name,description,default_price_kobo,estimated_duration_minutes,active')
        .eq('store_id', profile.store_id)
        .order('name'),
      supabase
        .from('service_workflow_stages')
        .select('id,name,position,is_terminal')
        .eq('store_id', profile.store_id)
        .order('position'),
    ])
    if (a.error || b.error) api.error(a.error?.message ?? b.error?.message ?? 'Could not load service setup.')
    else {
      setServices((a.data ?? []) as Service[])
      setStages((b.data ?? []) as Stage[])
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const saveService = async (values: {
    name: string
    description?: string
    price: number
    duration?: number
    active: boolean
  }) => {
    if (!supabase || !storeId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('service_catalogue').insert({
        store_id: storeId,
        name: values.name,
        description: values.description,
        default_price_kobo: Math.round(values.price * 100),
        estimated_duration_minutes: values.duration,
        active: values.active,
      })
      if (error) api.error(error.message)
      else {
        api.success('Service added.')
        setServiceOpen(false)
        serviceForm.resetFields()
        await load()
      }
    } finally {
      setSaving(false)
    }
  }
  const saveStage = async (values: { name: string; position: number; isTerminal: boolean }) => {
    if (!supabase || !storeId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('service_workflow_stages').insert({
        store_id: storeId,
        name: values.name,
        position: values.position,
        is_terminal: values.isTerminal,
      })
      if (error) api.error(error.message)
      else {
        api.success('Workflow stage added.')
        setStageOpen(false)
        stageForm.resetFields()
        await load()
      }
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-6">
      {holder}
      <Card
        title="Service catalogue"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              serviceForm.setFieldsValue({ active: true, price: 0 })
              setServiceOpen(true)
            }}
          >
            Add service
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={services}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Service', dataIndex: 'name', key: 'name' },
            {
              title: 'Default price',
              dataIndex: 'default_price_kobo',
              key: 'price',
              render: (value: number) => formatNaira(value / 100),
            },
            {
              title: 'Duration',
              dataIndex: 'estimated_duration_minutes',
              key: 'duration',
              render: (value?: number) => (value ? `${value} min` : '—'),
            },
            {
              title: 'Status',
              dataIndex: 'active',
              key: 'active',
              render: (value: boolean) => (
                <Tag color={value ? 'green' : 'default'}>{value ? 'Active' : 'Inactive'}</Tag>
              ),
            },
          ]}
        />
      </Card>
      <Card
        title="Workflow stages"
        extra={
          <Button
            icon={<PlusOutlined />}
            onClick={() => {
              stageForm.setFieldsValue({ position: stages.length + 1, isTerminal: false })
              setStageOpen(true)
            }}
          >
            Add stage
          </Button>
        }
      >
        <p className="text-sm text-slate-500">
          Stages define your company’s service process, such as Received → Inspection → In progress → Ready.
        </p>
        <List
          dataSource={stages}
          locale={{ emptyText: 'Add your first workflow stage.' }}
          renderItem={(stage) => (
            <List.Item>
              <List.Item.Meta title={`${stage.position}. ${stage.name}`} />
              {stage.is_terminal && <Tag color="green">Terminal</Tag>}
            </List.Item>
          )}
        />
      </Card>
      <Modal
        title="Add service"
        open={serviceOpen}
        onCancel={() => setServiceOpen(false)}
        onOk={() => void serviceForm.submit()}
        confirmLoading={saving}
      >
        <Form form={serviceForm} layout="vertical" onFinish={(values) => void saveService(values)}>
          <Form.Item name="name" label="Service name" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="price" label="Default price (₦)" rules={[{ required: true }]}>
              <CurrencyInput min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="duration" label="Estimated duration (minutes)">
              <InputNumber min={1} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Add workflow stage"
        open={stageOpen}
        onCancel={() => setStageOpen(false)}
        onOk={() => void stageForm.submit()}
        confirmLoading={saving}
      >
        <Form form={stageForm} layout="vertical" onFinish={(values) => void saveStage(values)}>
          <Form.Item name="name" label="Stage name" rules={[{ required: true }]}>
            <Input autoFocus placeholder="Inspection" />
          </Form.Item>
          <Form.Item name="position" label="Position" rules={[{ required: true }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
          <Form.Item name="isTerminal" label="Final stage" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
