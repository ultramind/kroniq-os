import { Button, Card, Form, Input, Radio, Select, Typography, message } from 'antd'
import { useState } from 'react'
import { supabase } from '../../supabase'
import { functionErrorMessage } from '../../lib/functionError'

type Values = {
  companyName: string
  branchName: string
  fullName: string
  businessMode: 'retail' | 'services' | 'hybrid'
  currencyCode: string
}

export function OrganizationOnboarding({ onComplete }: { onComplete: () => void }) {
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const [api, holder] = message.useMessage()
  const submit = async (values: Values) => {
    if (!supabase) return
    setSaving(true)
    const { error } = await supabase.functions.invoke('onboard-organization', { body: values })
    setSaving(false)
    if (error) {
      api.error(await functionErrorMessage(error, 'Could not create the company workspace.'))
      return
    }
    api.success('Your company is ready.')
    onComplete()
  }
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <Card className="w-full max-w-lg" title="Set up your company">
        <Typography.Paragraph type="secondary">
          Choose how your business operates. You can enable another mode later.
        </Typography.Paragraph>
        {holder}
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void submit(values)}
          initialValues={{ branchName: 'Main branch', businessMode: 'retail', currencyCode: 'NGN' }}
        >
          <Form.Item
            name="companyName"
            label="Company name"
            rules={[{ required: true, message: 'Enter your company name.' }]}
          >
            <Input autoFocus size="large" placeholder="e.g. BrightMart Retail Ltd" />
          </Form.Item>
          <Form.Item name="businessMode" label="Business model" rules={[{ required: true }]}>
            <Radio.Group
              className="grid gap-2"
              options={[
                { value: 'retail', label: 'Retail / POS' },
                { value: 'services', label: 'Services' },
                { value: 'hybrid', label: 'Retail + Services' },
              ]}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="branchName" label="First branch" rules={[{ required: true }]}>
              <Input size="large" />
            </Form.Item>
            <Form.Item name="currencyCode" label="Business currency" rules={[{ required: true }]}>
              <Select
                size="large"
                options={[
                  { value: 'NGN', label: '₦ Nigerian naira (NGN)' },
                  { value: 'GHS', label: '₵ Ghanaian cedi (GHS)' },
                  { value: 'KES', label: 'KSh Kenyan shilling (KES)' },
                  { value: 'ZAR', label: 'R South African rand (ZAR)' },
                  { value: 'USD', label: '$ US dollar (USD)' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="fullName" label="Your full name" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={saving}>
            Create company workspace
          </Button>
        </Form>
      </Card>
    </main>
  )
}
