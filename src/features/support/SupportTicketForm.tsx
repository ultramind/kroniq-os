import { CustomerServiceOutlined } from '@ant-design/icons'
import { Button, Card, Form, Input, Select, message } from 'antd'
import { useState } from 'react'
import { supabase } from '../../supabase'

export function SupportTicketForm() {
  const [form] = Form.useForm<{ subject: string; description: string; priority: string }>()
  const [saving, setSaving] = useState(false)
  const [api, holder] = message.useMessage()
  const submit = async (values: { subject: string; description: string; priority: string }) => {
    if (!supabase) return
    setSaving(true)
    const { error } = await supabase.rpc('create_support_ticket', { p_subject: values.subject, p_description: values.description, p_priority: values.priority })
    setSaving(false)
    if (error) { api.error(error.message); return }
    form.resetFields(); api.success('Support ticket sent. Our team can now review it.')
  }
  return <Card className="mt-6 max-w-2xl" title={<><CustomerServiceOutlined className="mr-2" />Contact support</>}>{holder}<p className="text-sm text-slate-500">Send a question, issue, or request to the Kronicle support team.</p><Form form={form} layout="vertical" initialValues={{ priority: 'normal' }} onFinish={(values) => void submit(values)}><Form.Item name="subject" label="Subject" rules={[{ required: true, min: 3 }]}><Input /></Form.Item><Form.Item name="description" label="How can we help?" rules={[{ required: true, min: 10 }]}><Input.TextArea rows={4} /></Form.Item><Form.Item name="priority" label="Priority"><Select options={['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></Form.Item><Button type="primary" htmlType="submit" loading={saving}>Send ticket</Button></Form></Card>
}
