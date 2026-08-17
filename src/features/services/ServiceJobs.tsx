import { PlusOutlined, UploadOutlined } from '@ant-design/icons'
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Steps,
  Table,
  Tag,
  Upload,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { formatNaira } from '../../lib/currency'
import { supabase } from '../../supabase'
import { ProjectDetailsDrawer } from './ProjectDetailsDrawer'
import { CurrencyInput } from '../../components/CurrencyInput'

type Client = { id: string; full_name: string; phone?: string }
type Service = { id: string; name: string; default_price_kobo: number }
type Stage = { id: string; name: string }
type Project = {
  id: string
  title: string
  quoted_amount_kobo: number
  due_at?: string
  status: 'open' | 'completed' | 'cancelled'
  customer: Client | Client[] | null
  stage: Stage | Stage[] | null
  payments?: { amount_kobo: number }[]
}
const projectStatus = (project: Project) =>
  project.status === 'completed'
    ? { label: 'Completed', color: 'green' }
    : project.status === 'cancelled'
      ? { label: 'Cancelled', color: 'default' }
      : project.due_at && dayjs(project.due_at).endOf('day').isBefore(dayjs())
        ? { label: 'Overdue', color: 'red' }
        : { label: 'Ongoing', color: 'blue' }
export function ServiceJobs() {
  const [api, holder] = message.useMessage()
  const [storeId, setStoreId] = useState<string>()
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [open, setOpen] = useState(false)
  const [detailsProjectId, setDetailsProjectId] = useState<string>()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [pendingDocument, setPendingDocument] = useState<File>()
  const [clientDraft, setClientDraft] = useState<Record<string, unknown>>({})
  const [form] = Form.useForm()
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
    const [a, b, c, d] = await Promise.all([
      supabase
        .from('service_jobs')
        .select(
          'id,title,quoted_amount_kobo,due_at,status,customer:customers(id,full_name,phone),stage:service_workflow_stages(id,name),payments:project_payments(amount_kobo)',
        )
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('customers')
        .select('id,full_name,phone')
        .eq('store_id', profile.store_id)
        .order('full_name'),
      supabase
        .from('service_catalogue')
        .select('id,name,default_price_kobo')
        .eq('store_id', profile.store_id)
        .eq('active', true),
      supabase
        .from('service_workflow_stages')
        .select('id,name')
        .eq('store_id', profile.store_id)
        .order('position'),
    ])
    if (a.error || b.error || c.error || d.error)
      api.error(
        a.error?.message ??
          b.error?.message ??
          c.error?.message ??
          d.error?.message ??
          'Could not load projects.',
      )
    else {
      setProjects((a.data ?? []) as Project[])
      setClients((b.data ?? []) as Client[])
      setServices((c.data ?? []) as Service[])
      setStages((d.data ?? []) as Stage[])
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])
  const clientName = (v: Project['customer']) => (Array.isArray(v) ? v[0]?.full_name : v?.full_name)
  const stageName = (v: Project['stage']) => (Array.isArray(v) ? v[0]?.name : v?.name)
  const continueToProject = () => {
    const values = form.getFieldsValue(true)
    const customerId =
      typeof values.customerId === 'string' && values.customerId.trim() ? values.customerId : null
    const clientName = typeof values.clientName === 'string' ? values.clientName.trim() : ''
    const clientPhone = typeof values.clientPhone === 'string' ? values.clientPhone.trim() : ''
    if (!customerId && (!clientName || !clientPhone)) {
      api.error('Select an existing client, or enter the new client’s name and phone number.')
      return
    }
    setClientDraft(values)
    setStep(1)
  }
  const create = async (values: any) => {
    if (!supabase || !storeId) return
    const customerId =
      typeof values.customerId === 'string' && values.customerId.trim() ? values.customerId : null
    const clientName = typeof values.clientName === 'string' ? values.clientName.trim() : ''
    const clientPhone = typeof values.clientPhone === 'string' ? values.clientPhone.trim() : ''
    if (!customerId && (!clientName || !clientPhone)) {
      api.error('Select an existing client, or enter the new client’s name and phone number.')
      setStep(0)
      return
    }
    setSaving(true)
    try {
      let resolvedCustomerId = customerId
      if (!resolvedCustomerId) {
        const { data, error } = await supabase
          .from('customers')
          .insert({
            store_id: storeId,
            full_name: clientName,
            phone: clientPhone,
            email: values.clientEmail?.trim() || null,
            address: values.clientAddress?.trim() || null,
          })
          .select('id')
          .single()
        if (error || !data) {
          api.error(error?.message ?? 'Could not create client.')
          return
        }
        resolvedCustomerId = data.id
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: project, error } = await supabase
        .from('service_jobs')
        .insert({
          store_id: storeId,
          customer_id: resolvedCustomerId,
          service_id: values.serviceId || null,
          current_stage_id: values.stageId || null,
          title: values.title,
          description: values.description || null,
          quoted_amount_kobo: Math.round(values.amount * 100),
          project_date: (values.projectDate ?? dayjs()).format('YYYY-MM-DD'),
          due_at: values.dueAt?.toISOString(),
        })
        .select('id')
        .single()
      if (error || !project) {
        api.error(error?.message ?? 'Could not create project.')
        return
      }
      if (values.stageId)
        await supabase.from('service_job_stage_history').insert({
          service_job_id: project.id,
          stage_id: values.stageId,
          changed_by: user?.id,
          note: 'Project created',
        })
      if (values.deposit > 0)
        await supabase.from('project_payments').insert({
          service_job_id: project.id,
          store_id: storeId,
          amount_kobo: Math.round(values.deposit * 100),
          payment_method: values.paymentMethod || 'cash',
          recorded_by: user?.id,
        })
      if (pendingDocument) {
        const storagePath = `${storeId}/${project.id}/${crypto.randomUUID()}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('project-documents')
          .upload(storagePath, pendingDocument, { contentType: 'application/pdf' })
        if (uploadError)
          api.warning(`Project created, but the document was not uploaded: ${uploadError.message}`)
        else {
          const { error: documentError } = await supabase.from('project_documents').insert({
            service_job_id: project.id,
            store_id: storeId,
            file_name: pendingDocument.name,
            storage_path: storagePath,
            mime_type: 'application/pdf',
            size_bytes: pendingDocument.size,
            uploaded_by: user?.id,
          })
          if (documentError)
            api.warning(`Project created, but the document record was not saved: ${documentError.message}`)
        }
      }
      api.success('Project created.')
      setOpen(false)
      setStep(0)
      setPendingDocument(undefined)
      form.resetFields()
      await load()
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      {holder}
      <Card
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields()
              form.setFieldsValue({
                amount: 0,
                deposit: 0,
                projectDate: dayjs(),
                stageId: stages[0]?.id,
                paymentMethod: 'cash',
              })
              setClientDraft({})
              setPendingDocument(undefined)
              setStep(0)
              setOpen(true)
            }}
          >
            New project
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={projects}
          columns={[
            { title: 'Project', dataIndex: 'title' },
            { title: 'Client', render: (_, p: Project) => clientName(p.customer) ?? '—' },
            { title: 'Value', dataIndex: 'quoted_amount_kobo', render: (v: number) => formatNaira(v / 100) },
            {
              title: 'Paid',
              render: (_, p: Project) =>
                formatNaira((p.payments ?? []).reduce((s, x) => s + x.amount_kobo, 0) / 100),
            },
            {
              title: 'Balance',
              render: (_, p: Project) =>
                formatNaira(
                  (p.quoted_amount_kobo - (p.payments ?? []).reduce((s, x) => s + x.amount_kobo, 0)) / 100,
                ),
            },
            { title: 'Stage', render: (_, p: Project) => <Tag>{stageName(p.stage) ?? 'New'}</Tag> },
            {
              title: 'Status',
              render: (_, p: Project) => {
                const status = projectStatus(p)
                return <Tag color={status.color}>{status.label}</Tag>
              },
            },
            {
              title: '',
              render: (_, p: Project) => (
                <Button type="link" onClick={() => setDetailsProjectId(p.id)}>
                  View
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title="New project"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => (step === 0 ? continueToProject() : void form.submit())}
        confirmLoading={saving}
        okText={step === 0 ? 'Continue' : 'Create project'}
        width={720}
      >
        <Steps
          current={step}
          items={[{ title: 'Client details' }, { title: 'Project details' }]}
          className="mb-6"
        />
        <Form form={form} layout="vertical" onFinish={(values) => create({ ...clientDraft, ...values })}>
          {step === 0 ? (
            <>
              <Form.Item name="customerId" label="Existing client">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={clients.map((x) => ({
                    value: x.id,
                    label: `${x.full_name}${x.phone ? ` · ${x.phone}` : ''}`,
                  }))}
                />
              </Form.Item>
              <Form.Item shouldUpdate noStyle>
                {() =>
                  !form.getFieldValue('customerId') && (
                    <>
                      <Form.Item
                        name="clientName"
                        label="Client or company name"
                        rules={[{ required: true }]}
                      >
                        <Input autoFocus />
                      </Form.Item>
                      <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="clientPhone" label="Phone" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                        <Form.Item name="clientEmail" label="Email">
                          <Input />
                        </Form.Item>
                      </div>
                      <Form.Item name="clientAddress" label="Address">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </>
                  )
                }
              </Form.Item>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="serviceId" label="Service type">
                  <Select
                    allowClear
                    options={services.map((x) => ({ value: x.id, label: x.name }))}
                    onChange={(id) => {
                      const s = services.find((x) => x.id === id)
                      if (s) form.setFieldValue('amount', s.default_price_kobo / 100)
                    }}
                  />
                </Form.Item>
                <Form.Item name="stageId" label="Starting stage">
                  <Select options={stages.map((x) => ({ value: x.id, label: x.name }))} />
                </Form.Item>
              </div>
              <Form.Item name="title" label="Project / contract title" rules={[{ required: true }]}>
                <Input autoFocus />
              </Form.Item>
              <Form.Item name="description" label="Project details">
                <Input.TextArea rows={3} />
              </Form.Item>
              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="projectDate" label="Project date" rules={[{ required: true }]}>
                  <DatePicker className="w-full" />
                </Form.Item>
                <Form.Item name="dueAt" label="Estimated delivery">
                  <DatePicker className="w-full" />
                </Form.Item>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Form.Item name="amount" label="Contract value (₦)" rules={[{ required: true }]}>
                  <CurrencyInput min={0} className="w-full" />
                </Form.Item>
                <Form.Item name="deposit" label="Initial deposit">
                  <CurrencyInput min={0} className="w-full" />
                </Form.Item>
              </div>
              <Form.Item label="Project document (PDF)">
                <Upload
                  accept="application/pdf,.pdf"
                  maxCount={1}
                  showUploadList={false}
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) {
                      api.error('Project document must be 10 MB or smaller.')
                      return Upload.LIST_IGNORE
                    }
                    setPendingDocument(file as File)
                    return false
                  }}
                >
                  <Button icon={<UploadOutlined />}>Attach PDF</Button>
                </Upload>
                {pendingDocument && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <span className="truncate">{pendingDocument.name}</span>
                    <Button type="link" size="small" danger onClick={() => setPendingDocument(undefined)}>
                      Remove
                    </Button>
                  </div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  Optional agreement, scope, or signed contract. Maximum 10 MB.
                </div>
              </Form.Item>
              <Form.Item shouldUpdate noStyle>
                {() =>
                  form.getFieldValue('deposit') > 0 && (
                    <Form.Item name="paymentMethod" label="Deposit payment method">
                      <Select
                        options={['cash', 'transfer', 'card', 'credit'].map((x) => ({ value: x, label: x }))}
                      />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
      <ProjectDetailsDrawer
        projectId={detailsProjectId}
        open={Boolean(detailsProjectId)}
        onClose={() => setDetailsProjectId(undefined)}
        onChanged={() => void load()}
      />
    </div>
  )
}
